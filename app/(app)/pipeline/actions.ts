"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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

/** Stages that a hold/cancel/resume cascades across, in pipeline order. Includes
 *  Enquiry so the whole inquiry (its own status too) freezes/resumes. */
const CASCADE_STAGES: PipelineStageKey[] = [
  "enquiry",
  "feasibility",
  "secondary",
  "costing",
  "quotation",
  "negotiation",
  "sales_order",
];

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
    await db.transaction(async (tx) => {
      if (decision === "on_hold" || decision === "cancelled") {
        for (const s of CASCADE_STAGES) await setStage(tx, s, inquiryId, decision);
      } else if (decision === "resume") {
        for (const s of CASCADE_STAGES) await setStage(tx, s, inquiryId, "draft");
      } else if (decision === "approve") {
        await setStage(tx, stage, inquiryId, APPROVED[stage]);
      } else {
        await setStage(tx, stage, inquiryId, "not_approved");
      }

      await tx.insert(stageRemarks).values({
        module: decision === "on_hold" || decision === "cancelled" || decision === "resume"
          ? "pipeline"
          : stage,
        recordId: inquiryId,
        toStatus: decision,
        body: remark,
        authorId: me.id,
      });
    });
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
