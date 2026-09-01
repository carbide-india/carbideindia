"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  costings,
  inquiries,
  inquiryItems,
  negotiations,
  quotations,
  salesOrders,
  stageRemarks,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canApprove } from "@/lib/approval/gate";
import type {
  CostingDoneStatus,
  EnquiryStatus,
  FeasibilityStatus,
  NegotiationStatus,
  QuotationStatus,
  SalesOrderStatus,
  SecondaryFeasibilityStatus,
} from "@/db/enums";

/**
 * Approver decisions from the Pipeline Tracker (Alok / Altus only).
 *
 *  • approve / not_approved — act on ONE stage.
 *  • on_hold / cancelled    — freeze the WHOLE inquiry: every stage from Primary
 *    Feasibility to Sales Order is set to that state (backward + forward).
 *  • resume                 — lift a hold/cancel: every stage back to Draft.
 *
 * Enquiry is intentionally left out for now (its On Hold/Cancelled statuses are
 * still to be decided). Every change is logged to stage_remarks.
 */

export type PipelineStageKey =
  | "enquiry"
  | "feasibility"
  | "secondary"
  | "costing"
  | "quotation"
  | "negotiation"
  | "sales_order";

export type PipelineDecision =
  | "approve"
  | "not_approved"
  | "on_hold"
  | "cancelled"
  | "resume";

/** The stage-remarks module tag under which the whole-inquiry freeze
 *  (On Hold / Cancelled / Resume) is recorded. Reading the LATEST such row per
 *  inquiry gives its freeze state — no enum column is touched, so it needs no
 *  migration and Resume restores the exact prior stage statuses. */
const FREEZE_MODULE = "pipeline-freeze";

/** Each stage's "approved" status value. */
const APPROVED: Record<PipelineStageKey, string> = {
  enquiry: "enquiry_approved",
  feasibility: "proceed_to_costing",
  secondary: "secondary_feasibility_approved",
  costing: "costing_approved",
  quotation: "quotation_approved",
  negotiation: "negotiation_approved",
  sales_order: "sales_order_approved",
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Set one stage's status for every row tied to the inquiry. */
async function setStage(
  tx: Tx,
  stage: PipelineStageKey,
  inquiryId: string,
  value: string,
): Promise<void> {
  switch (stage) {
    case "enquiry":
      await tx
        .update(inquiries)
        .set({ enquiryStatus: value as EnquiryStatus })
        .where(eq(inquiries.id, inquiryId));
      return;
    case "feasibility":
      await tx
        .update(inquiries)
        .set({ feasibilityStatus: value as FeasibilityStatus })
        .where(eq(inquiries.id, inquiryId));
      return;
    case "secondary":
      await tx
        .update(inquiryItems)
        .set({ secondaryFeasibilityStatus: value as SecondaryFeasibilityStatus })
        .where(eq(inquiryItems.inquiryId, inquiryId));
      return;
    case "costing":
      await tx
        .update(costings)
        .set({ costingDoneStatus: value as CostingDoneStatus })
        .where(eq(costings.inquiryId, inquiryId));
      return;
    case "quotation":
      await tx
        .update(quotations)
        .set({ quotationStatus: value as QuotationStatus })
        .where(eq(quotations.inquiryId, inquiryId));
      return;
    case "negotiation":
      await tx
        .update(negotiations)
        .set({ negotiationStatus: value as NegotiationStatus })
        .where(eq(negotiations.inquiryId, inquiryId));
      return;
    case "sales_order":
      await tx
        .update(salesOrders)
        .set({ salesOrderStatus: value as SalesOrderStatus })
        .where(eq(salesOrders.inquiryId, inquiryId));
      return;
  }
}

/** A snapshot of every stage status for an inquiry, so a freeze is fully
 *  reversible. Multi-row stages are keyed by row id. */
type SnapJSON = {
  enquiry: string | null;
  feasibility: string | null;
  secondary: Record<string, string>;
  costing: Record<string, string>;
  quotation: Record<string, string>;
  negotiation: Record<string, string>;
  sales_order: Record<string, string>;
};

/** Read the current status of every stage of the inquiry. */
async function snapshotStatuses(tx: Tx, inquiryId: string): Promise<SnapJSON> {
  const [inq] = await tx
    .select({ enquiry: inquiries.enquiryStatus, feasibility: inquiries.feasibilityStatus })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId));
  const rows = async <T extends { id: string; s: string }>(q: Promise<T[]>) => {
    const out: Record<string, string> = {};
    for (const r of await q) out[r.id] = r.s;
    return out;
  };
  return {
    enquiry: inq?.enquiry ?? null,
    feasibility: inq?.feasibility ?? null,
    secondary: await rows(
      tx.select({ id: inquiryItems.id, s: inquiryItems.secondaryFeasibilityStatus }).from(inquiryItems).where(eq(inquiryItems.inquiryId, inquiryId)),
    ),
    costing: await rows(
      tx.select({ id: costings.id, s: costings.costingDoneStatus }).from(costings).where(eq(costings.inquiryId, inquiryId)),
    ),
    quotation: await rows(
      tx.select({ id: quotations.id, s: quotations.quotationStatus }).from(quotations).where(eq(quotations.inquiryId, inquiryId)),
    ),
    negotiation: await rows(
      tx.select({ id: negotiations.id, s: negotiations.negotiationStatus }).from(negotiations).where(eq(negotiations.inquiryId, inquiryId)),
    ),
    sales_order: await rows(
      tx.select({ id: salesOrders.id, s: salesOrders.salesOrderStatus }).from(salesOrders).where(eq(salesOrders.inquiryId, inquiryId)),
    ),
  };
}

/** Set every stage of the inquiry to one freeze value (on_hold / cancelled). */
async function freezeAll(tx: Tx, inquiryId: string, value: string): Promise<void> {
  await tx
    .update(inquiries)
    .set({ enquiryStatus: value as EnquiryStatus, feasibilityStatus: value as FeasibilityStatus })
    .where(eq(inquiries.id, inquiryId));
  await tx.update(inquiryItems).set({ secondaryFeasibilityStatus: value as SecondaryFeasibilityStatus }).where(eq(inquiryItems.inquiryId, inquiryId));
  await tx.update(costings).set({ costingDoneStatus: value as CostingDoneStatus }).where(eq(costings.inquiryId, inquiryId));
  await tx.update(quotations).set({ quotationStatus: value as QuotationStatus }).where(eq(quotations.inquiryId, inquiryId));
  await tx.update(negotiations).set({ negotiationStatus: value as NegotiationStatus }).where(eq(negotiations.inquiryId, inquiryId));
  await tx.update(salesOrders).set({ salesOrderStatus: value as SalesOrderStatus }).where(eq(salesOrders.inquiryId, inquiryId));
}

/** Restore each stage to its snapshot. Rows created after the freeze have no
 *  snapshot entry and are left as-is (rather than guessed). */
async function restoreFromSnapshot(tx: Tx, inquiryId: string, snap: SnapJSON): Promise<void> {
  if (snap.enquiry || snap.feasibility) {
    await tx
      .update(inquiries)
      .set({
        ...(snap.enquiry ? { enquiryStatus: snap.enquiry as EnquiryStatus } : {}),
        ...(snap.feasibility ? { feasibilityStatus: snap.feasibility as FeasibilityStatus } : {}),
      })
      .where(eq(inquiries.id, inquiryId));
  }
  for (const [id, s] of Object.entries(snap.secondary ?? {}))
    await tx.update(inquiryItems).set({ secondaryFeasibilityStatus: s as SecondaryFeasibilityStatus }).where(eq(inquiryItems.id, id));
  for (const [id, s] of Object.entries(snap.costing ?? {}))
    await tx.update(costings).set({ costingDoneStatus: s as CostingDoneStatus }).where(eq(costings.id, id));
  for (const [id, s] of Object.entries(snap.quotation ?? {}))
    await tx.update(quotations).set({ quotationStatus: s as QuotationStatus }).where(eq(quotations.id, id));
  for (const [id, s] of Object.entries(snap.negotiation ?? {}))
    await tx.update(negotiations).set({ negotiationStatus: s as NegotiationStatus }).where(eq(negotiations.id, id));
  for (const [id, s] of Object.entries(snap.sales_order ?? {}))
    await tx.update(salesOrders).set({ salesOrderStatus: s as SalesOrderStatus }).where(eq(salesOrders.id, id));
}

export async function applyPipelineDecision(input: {
  inquiryId: string;
  stage: PipelineStageKey;
  decision: PipelineDecision;
  remark?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  // Approve / Not Approved / On Hold / Cancelled / Resume are all approver-only.
  if (!canApprove(me)) {
    return { ok: false, error: "Only an approver (Alok / Altus) can make this decision." };
  }

  const { inquiryId, stage, decision } = input;
  const remark = input.remark?.trim() || `Approver marked ${decision.replace("_", " ")}.`;

  try {
    if (decision === "on_hold" || decision === "cancelled") {
      // Whole-inquiry freeze. Snapshot every stage's current status first (so
      // Resume restores it exactly), THEN set every stage to the freeze value so
      // it shows in each module's own On Hold / Cancelled bucket. The snapshot
      // rides in the freeze remark body (a FREEZE_MODULE row, not shown in the
      // user-facing stage threads).
      await db.transaction(async (tx) => {
        const snap = await snapshotStatuses(tx, inquiryId);
        await freezeAll(tx, inquiryId, decision);
        await tx.insert(stageRemarks).values({
          module: FREEZE_MODULE,
          recordId: inquiryId,
          toStatus: decision,
          body: JSON.stringify({ note: remark, snap }),
          authorId: me.id,
        });
      });
    } else if (decision === "resume") {
      // Lift the freeze: restore every stage from the most recent freeze
      // snapshot. If the snapshot is missing/unreadable, statuses are left as-is
      // rather than guessed (safer than clobbering).
      await db.transaction(async (tx) => {
        const [last] = await tx
          .select({ body: stageRemarks.body, toStatus: stageRemarks.toStatus })
          .from(stageRemarks)
          .where(and(eq(stageRemarks.module, FREEZE_MODULE), eq(stageRemarks.recordId, inquiryId)))
          .orderBy(desc(stageRemarks.createdAt))
          .limit(1);
        if (last && (last.toStatus === "on_hold" || last.toStatus === "cancelled")) {
          try {
            const parsed = JSON.parse(last.body) as { snap?: SnapJSON };
            if (parsed.snap) await restoreFromSnapshot(tx, inquiryId, parsed.snap);
          } catch {
            /* leave statuses untouched */
          }
        }
        await tx.insert(stageRemarks).values({
          module: FREEZE_MODULE,
          recordId: inquiryId,
          toStatus: "resume",
          body: remark,
          authorId: me.id,
        });
      });
    } else {
      // Approve / Not Approved — a real, per-stage status change + its log.
      await db.transaction(async (tx) => {
        await setStage(tx, stage, inquiryId, decision === "approve" ? APPROVED[stage] : "not_approved");
        await tx.insert(stageRemarks).values({
          module: stage,
          recordId: inquiryId,
          toStatus: decision,
          body: remark,
          authorId: me.id,
        });
      });
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not apply the decision.",
    };
  }

  revalidatePath(`/pipeline/${inquiryId}`);
  revalidatePath("/pipeline");
  return { ok: true };
}
