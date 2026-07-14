"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  quotations,
  quotationItems,
  negotiations,
  negotiationItems,
  salesOrders,
  salesOrderItems,
  settingsEvents,
} from "@/db/schema";
import { requireRole } from "@/lib/auth/roles";
import type { PipelineStage } from "@/lib/flow/derive-stage";
import {
  actorRoleFor,
  canTransition,
  guardsFor,
  type GuardContext,
} from "@/lib/workflow/transitions";
import { isWorkflowFlagOn } from "@/lib/workflow/flags";
import {
  provisionNegotiationFromQuote,
  provisionSalesOrderFromNegotiation,
  smNumberForInquiry,
} from "@/lib/workflow/provision";
import type { WorkflowFlagKey } from "@/db/enums";

/**
 * ERP Phase 8 - `advanceStage`, the SINGLE funnel for every enforced pipeline
 * transition (§4.6). In ONE transaction it:
 *   1. checks the per-entity feature flag (OFF ⇒ hard no-op, so the deploy is
 *      inert until an admin flips it ON);
 *   2. `requireRole(actorRoleFor(from,to))` - the stage actor is enforced;
 *   3. validates `canTransition` + runs the exit/entry GUARDS against live,
 *      FK-resolved data (rejects with the unmet reasons otherwise);
 *   4. WRITES the legal snapshot columns (FREEZE) for the transition (§2.4) -
 *      e.g. sending a quote freezes unit_price/spec_snapshot/frozen_at/by on its
 *      lines; confirming an SO additionally freezes qty_ordered;
 *   5. IDEMPOTENTLY auto-provisions the next-stage draft BY REFERENCE, only if
 *      no descendant already exists (a second call is a no-op);
 *   6. writes a settings_events row for the transition + freeze + provision.
 *
 * Returns the new stage + any provisioned descendant id. When the flag is OFF,
 * the standalone New-Quotation/Negotiation/SO forms remain the write path and
 * this returns `{ ok:false, error }` without touching anything.
 */

export type AdvanceStageResult =
  | {
      ok: true;
      stage: PipelineStage;
      /** Descendant provisioned (or already existing) by the transition. */
      provisionedId?: string;
      provisioned?: boolean;
      frozenLines?: number;
    }
  | { ok: false; error: string; unmet?: string[] };

/** The entities `advanceStage` can drive (map to the feature-flag keys). */
export type AdvanceEntity = "quotation" | "negotiation" | "sales_order";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID_RE.test(v);

/**
 * Send a quotation: quotation → negotiation (§2.4). Freezes unit_price +
 * spec_snapshot + frozen_at/by on each line (drafts read live; sent is frozen),
 * flips `quote_sent`, then idempotently provisions a draft negotiation.
 */
async function advanceQuotationToSent(
  quotationId: string,
): Promise<AdvanceStageResult> {
  const from: PipelineStage = "quotation";
  const to: PipelineStage = "negotiation";
  const me = await requireRole(actorRoleFor(from, to));

  return db.transaction(async (tx) => {
    const [q] = await tx
      .select({
        id: quotations.id,
        inquiryId: quotations.inquiryId,
        quoteSent: quotations.quoteSent,
      })
      .from(quotations)
      .where(eq(quotations.id, quotationId))
      .limit(1);
    if (!q) return { ok: false as const, error: "Quotation not found." };

    const lines = await tx
      .select({
        id: quotationItems.id,
        itemId: quotationItems.itemId,
        quotePrice: quotationItems.quotePrice,
      })
      .from(quotationItems)
      .where(eq(quotationItems.quotationId, quotationId));

    const priceOf = (v: string | null): number => Number(v ?? 0);
    const ctx: GuardContext = {
      lineCount: lines.length,
      linesWithItem: lines.filter((l) => l.itemId != null).length,
      linesWithChosenCosting: lines.length, // entry guard already satisfied upstream
      linesWithPrice: lines.filter((l) => priceOf(l.quotePrice) > 0).length,
    };
    const gr = guardsFor(from, to, ctx);
    if (!gr.ok) return { ok: false as const, error: "Cannot send quote.", unmet: gr.unmet };

    // FREEZE - only lines not already frozen (re-send is a no-op on frozen rows).
    const now = new Date();
    let frozen = 0;
    for (const l of lines) {
      const res = await tx
        .update(quotationItems)
        .set({
          unitPrice: l.quotePrice,
          specSnapshot: { itemId: l.itemId, frozenPrice: l.quotePrice },
          frozenAt: now,
          frozenBy: me.id,
          updatedAt: now,
        })
        .where(and(eq(quotationItems.id, l.id), sql`${quotationItems.frozenAt} is null`))
        .returning({ id: quotationItems.id });
      frozen += res.length;
    }

    await tx
      .update(quotations)
      .set({ quoteSent: true, updatedAt: now })
      .where(eq(quotations.id, quotationId));

    // Idempotent provision of the draft negotiation (SM number off the inquiry).
    const smNumber = await resolveSm(tx, q.inquiryId);
    const prov = await provisionNegotiationFromQuote(tx, {
      quotationId,
      inquiryId: q.inquiryId,
      smNumber: smNumber ?? "SM",
      createdById: me.id,
    });

    await writeEvent(tx, {
      scope: "workflow_advance",
      targetId: quotationId,
      actorId: me.id,
      eventType: "quotation.sent",
      toValue: {
        from,
        to,
        frozenLines: frozen,
        provisionedNegotiationId: prov.id,
        provisioned: prov.created,
      },
    });

    revalidatePath("/quotations");
    revalidatePath(`/quotations/${quotationId}`);
    revalidatePath("/negotiations");
    return {
      ok: true as const,
      stage: to,
      provisionedId: prov.id,
      provisioned: prov.created,
      frozenLines: frozen,
    };
  });
}

/**
 * Mark a negotiation won: negotiation → sales_order (§2.5). Freezes the agreed
 * unit_price on each line, flips status to order_won, then idempotently
 * provisions a draft SO (closing the negotiation→SO break).
 */
async function advanceNegotiationToWon(
  negotiationId: string,
): Promise<AdvanceStageResult> {
  const from: PipelineStage = "negotiation";
  const to: PipelineStage = "sales_order";
  const me = await requireRole(actorRoleFor(from, to));

  return db.transaction(async (tx) => {
    const [n] = await tx
      .select({
        id: negotiations.id,
        inquiryId: negotiations.inquiryId,
        quotationId: negotiations.quotationId,
        status: negotiations.negotiationStatus,
      })
      .from(negotiations)
      .where(eq(negotiations.id, negotiationId))
      .limit(1);
    if (!n) return { ok: false as const, error: "Negotiation not found." };

    const lines = await tx
      .select({
        id: negotiationItems.id,
        itemId: negotiationItems.itemId,
        negotiation: negotiationItems.negotiation,
        quotePrice: negotiationItems.quotePrice,
      })
      .from(negotiationItems)
      .where(eq(negotiationItems.negotiationId, negotiationId));

    const agreedOf = (l: (typeof lines)[number]): number =>
      Number(l.negotiation ?? l.quotePrice ?? 0);
    const sentQuote = n.quotationId
      ? await isQuoteSent(tx, n.quotationId)
      : false;
    const ctx: GuardContext = {
      lineCount: lines.length,
      hasSentQuotation: sentQuote,
      parentQuoteSent: sentQuote,
      wonLinesHavePrice: lines.length > 0 && lines.every((l) => agreedOf(l) > 0),
    };
    const gr = guardsFor(from, to, ctx);
    if (!gr.ok) return { ok: false as const, error: "Cannot mark won.", unmet: gr.unmet };

    const now = new Date();
    let frozen = 0;
    for (const l of lines) {
      const res = await tx
        .update(negotiationItems)
        .set({
          unitPrice: String(agreedOf(l)),
          specSnapshot: { itemId: l.itemId, frozenPrice: String(agreedOf(l)) },
          frozenAt: now,
          frozenBy: me.id,
          updatedAt: now,
        })
        .where(and(eq(negotiationItems.id, l.id), sql`${negotiationItems.frozenAt} is null`))
        .returning({ id: negotiationItems.id });
      frozen += res.length;
    }

    await tx
      .update(negotiations)
      .set({ negotiationStatus: "order_won", updatedAt: now })
      .where(eq(negotiations.id, negotiationId));

    const smNumber = await resolveSm(tx, n.inquiryId);
    const prov = await provisionSalesOrderFromNegotiation(tx, {
      negotiationId,
      quotationId: n.quotationId,
      inquiryId: n.inquiryId,
      smNumber: smNumber ?? "SM",
      createdById: me.id,
    });

    await writeEvent(tx, {
      scope: "workflow_advance",
      targetId: negotiationId,
      actorId: me.id,
      eventType: "negotiation.order_won",
      toValue: {
        from,
        to,
        frozenLines: frozen,
        provisionedSalesOrderId: prov.id,
        provisioned: prov.created,
      },
    });

    revalidatePath("/negotiations");
    revalidatePath(`/negotiations/${negotiationId}`);
    revalidatePath("/sales-orders");
    return {
      ok: true as const,
      stage: to,
      provisionedId: prov.id,
      provisioned: prov.created,
      frozenLines: frozen,
    };
  });
}

/**
 * Confirm a sales order: sales_order → job_card (§2.6). Freezes unit_price,
 * spec_snapshot AND qty_ordered on each line (the order is a contract). Does NOT
 * auto-provision a job card here - JC create/release stay their own path in
 * Phase 9; this locks the SO as a confirmed contract.
 */
async function advanceSalesOrderToConfirmed(
  salesOrderId: string,
): Promise<AdvanceStageResult> {
  const from: PipelineStage = "sales_order";
  const to: PipelineStage = "job_card";
  const me = await requireRole(actorRoleFor(from, to));

  return db.transaction(async (tx) => {
    const [so] = await tx
      .select({
        id: salesOrders.id,
        inquiryId: salesOrders.inquiryId,
        quotationId: salesOrders.quotationId,
        customerPoLink: salesOrders.customerPoLink,
        customerPoNo: salesOrders.customerPoNo,
      })
      .from(salesOrders)
      .where(eq(salesOrders.id, salesOrderId))
      .limit(1);
    if (!so) return { ok: false as const, error: "Sales order not found." };

    const lines = await tx
      .select({
        id: salesOrderItems.id,
        itemId: salesOrderItems.itemId,
        qty: salesOrderItems.qty,
        quotePrice: salesOrderItems.quotePrice,
      })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.salesOrderId, salesOrderId));

    const sentQuote = so.quotationId ? await isQuoteSent(tx, so.quotationId) : true;
    const hasPo = Boolean(so.customerPoLink || so.customerPoNo);
    const ctx: GuardContext = {
      lineCount: lines.length,
      hasSentQuotation: sentQuote,
      hasCustomerPo: hasPo,
      linesWithQty: lines.filter((l) => Number(l.qty ?? 0) > 0).length,
    };
    const gr = guardsFor(from, to, ctx);
    if (!gr.ok) return { ok: false as const, error: "Cannot confirm order.", unmet: gr.unmet };

    const now = new Date();
    let frozen = 0;
    for (const l of lines) {
      const res = await tx
        .update(salesOrderItems)
        .set({
          unitPrice: l.quotePrice,
          qtyOrdered: l.qty,
          specSnapshot: { itemId: l.itemId, frozenPrice: l.quotePrice, qtyOrdered: l.qty },
          frozenAt: now,
          frozenBy: me.id,
          updatedAt: now,
        })
        .where(and(eq(salesOrderItems.id, l.id), sql`${salesOrderItems.frozenAt} is null`))
        .returning({ id: salesOrderItems.id });
      frozen += res.length;
    }

    await tx
      .update(salesOrders)
      .set({ customerSoSent: true, updatedAt: now })
      .where(eq(salesOrders.id, salesOrderId));

    await writeEvent(tx, {
      scope: "workflow_advance",
      targetId: salesOrderId,
      actorId: me.id,
      eventType: "sales_order.confirmed",
      toValue: { from, to, frozenLines: frozen },
    });

    revalidatePath("/sales-orders");
    revalidatePath(`/sales-orders/${salesOrderId}`);
    return { ok: true as const, stage: to, frozenLines: frozen };
  });
}

// ── Shared helpers ───────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function resolveSm(tx: Tx, inquiryId: string): Promise<string | null> {
  return smNumberForInquiry(tx, inquiryId);
}

async function isQuoteSent(tx: Tx, quotationId: string): Promise<boolean> {
  const [row] = await tx
    .select({ quoteSent: quotations.quoteSent })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  return row?.quoteSent === true;
}

async function writeEvent(
  tx: Tx,
  ev: {
    scope: string;
    targetId: string;
    actorId: string;
    eventType: string;
    toValue: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await tx.insert(settingsEvents).values({
      scope: ev.scope,
      targetId: ev.targetId,
      actorId: ev.actorId,
      eventType: ev.eventType,
      toValue: ev.toValue,
    });
  } catch (err) {
    // Non-fatal: never let the audit write roll back the transition.
    console.error("[advanceStage] event write failed", err);
  }
}

const FLAG_FOR: Record<AdvanceEntity, WorkflowFlagKey> = {
  quotation: "quotation",
  negotiation: "negotiation",
  sales_order: "sales_order",
};

const TARGET_FOR: Record<AdvanceEntity, PipelineStage> = {
  quotation: "negotiation",
  negotiation: "sales_order",
  sales_order: "job_card",
};

const FROM_FOR: Record<AdvanceEntity, PipelineStage> = {
  quotation: "quotation",
  negotiation: "negotiation",
  sales_order: "sales_order",
};

/**
 * The public funnel. Dispatches to the per-entity handler after the flag +
 * transition-table checks. `targetStage` is validated against the table so a
 * caller can never request an undefined move. Flag OFF ⇒ inert no-op.
 */
export async function advanceStage(input: {
  entity: AdvanceEntity;
  id: string;
  targetStage?: PipelineStage;
}): Promise<AdvanceStageResult> {
  const { entity, id } = input;
  if (!isUuid(id)) return { ok: false, error: "Invalid id." };

  // 1. Feature flag - OFF is the default and a hard no-op.
  const flagOn = await isWorkflowFlagOn(FLAG_FOR[entity]);
  if (!flagOn) {
    return {
      ok: false,
      error:
        "Enforced workflow is off for this entity - use the standard form/status controls.",
    };
  }

  // 2. Transition-table validation (the single source of allowed edges).
  const from = FROM_FOR[entity];
  const to = input.targetStage ?? TARGET_FOR[entity];
  if (!canTransition(from, to)) {
    return { ok: false, error: `Transition ${from} → ${to} is not allowed.` };
  }

  switch (entity) {
    case "quotation":
      return advanceQuotationToSent(id);
    case "negotiation":
      return advanceNegotiationToWon(id);
    case "sales_order":
      return advanceSalesOrderToConfirmed(id);
  }
}
