import "server-only";
import { asc, count, eq } from "drizzle-orm";
import {
  quotations,
  quotationItems,
  negotiations,
  negotiationItems,
  salesOrders,
  salesOrderItems,
  inquiries,
} from "@/db/schema";
import { db } from "@/lib/db";
import { getInquiryItemSeeds, getQuoteAutofill } from "@/lib/queries/quotes";

/**
 * ERP Phase 8 - idempotent auto-provisioning (§4.6). Each `provision*` helper
 * creates the NEXT-stage DRAFT for a source record BY REFERENCE (FK edges only,
 * never copying spec/price - downstream resolves read-through), and ONLY IF no
 * descendant already exists. The idempotency guard makes a second call a no-op:
 * it returns the already-existing id and inserts nothing, so double-provisioning
 * (e.g. a retried transition, or the standalone New form + advanceStage racing)
 * is impossible.
 *
 * These run INSIDE the advanceStage transaction (passed `tx`) so the freeze +
 * provision + audit are one atomic unit.
 */

// A handle compatible with both `db` and a `db.transaction(tx => )` tx - the
// provision helpers only ever `select`/`insert`, so this narrow surface lets a
// caller pass either without a structural mismatch.
type DbLike = Pick<typeof db, "select" | "insert">;

export interface ProvisionResult {
  /** The descendant id (freshly created OR the pre-existing one). */
  id: string;
  /** True when this call created it; false when it already existed (no-op). */
  created: boolean;
}

/** Next document number "<SM>-<prefix><nn>" using the current descendant count. */
function nextDocNo(smNumber: string, prefix: string, existing: number): string {
  return `${smNumber}-${prefix}${String(existing + 1).padStart(2, "0")}`;
}

/**
 * Provision a DRAFT negotiation from a SENT quotation (quote → negotiation).
 * Idempotent on quotation_id: if a negotiation already links this quote, no-op.
 */
export async function provisionNegotiationFromQuote(
  tx: DbLike,
  args: { quotationId: string; inquiryId: string; smNumber: string; createdById: string },
): Promise<ProvisionResult> {
  const [existing] = await tx
    .select({ id: negotiations.id })
    .from(negotiations)
    .where(eq(negotiations.quotationId, args.quotationId))
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [cnt] = await tx
    .select({ n: count() })
    .from(negotiations)
    .where(eq(negotiations.inquiryId, args.inquiryId));
  const negotiationNo = nextDocNo(args.smNumber, "N", Number(cnt?.n ?? 0));

  const [head] = await tx
    .insert(negotiations)
    .values({
      inquiryId: args.inquiryId,
      quotationId: args.quotationId,
      negotiationNo,
      negotiationStatus: "to_start",
      createdById: args.createdById,
    })
    .returning({ id: negotiations.id });
  if (!head) throw new Error("negotiations insert returned no row");

  const qLines = await tx
    .select({
      id: quotationItems.id,
      inquiryItemId: quotationItems.inquiryItemId,
      itemId: quotationItems.itemId,
      sortOrder: quotationItems.sortOrder,
    })
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, args.quotationId));
  if (qLines.length) {
    await tx.insert(negotiationItems).values(
      qLines.map((l) => ({
        negotiationId: head.id,
        quotationItemId: l.id,
        inquiryItemId: l.inquiryItemId,
        itemId: l.itemId,
        sortOrder: l.sortOrder,
      })),
    );
  }
  return { id: head.id, created: true };
}

/**
 * Provision a DRAFT sales order from a WON negotiation (negotiation → SO).
 * Idempotent on negotiation_id - closes the negotiation→SO break (§4.6/DoD #9).
 */
export async function provisionSalesOrderFromNegotiation(
  tx: DbLike,
  args: {
    negotiationId: string;
    quotationId: string | null;
    inquiryId: string;
    smNumber: string;
    createdById: string;
  },
): Promise<ProvisionResult> {
  const [existing] = await tx
    .select({ id: salesOrders.id })
    .from(salesOrders)
    .where(eq(salesOrders.negotiationId, args.negotiationId))
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [cnt] = await tx
    .select({ n: count() })
    .from(salesOrders)
    .where(eq(salesOrders.inquiryId, args.inquiryId));
  const soNo = nextDocNo(args.smNumber, "SO", Number(cnt?.n ?? 0));

  const [head] = await tx
    .insert(salesOrders)
    .values({
      inquiryId: args.inquiryId,
      quotationId: args.quotationId,
      negotiationId: args.negotiationId,
      soNo,
      createdById: args.createdById,
    })
    .returning({ id: salesOrders.id });
  if (!head) throw new Error("salesOrders insert returned no row");

  const nLines = await tx
    .select({
      id: negotiationItems.id,
      quotationItemId: negotiationItems.quotationItemId,
      inquiryItemId: negotiationItems.inquiryItemId,
      itemId: negotiationItems.itemId,
      sortOrder: negotiationItems.sortOrder,
    })
    .from(negotiationItems)
    .where(eq(negotiationItems.negotiationId, args.negotiationId));
  if (nLines.length) {
    await tx.insert(salesOrderItems).values(
      nLines.map((l) => ({
        salesOrderId: head.id,
        quotationItemId: l.quotationItemId,
        inquiryItemId: l.inquiryItemId,
        itemId: l.itemId,
        sortOrder: l.sortOrder,
      })),
    );
  }
  return { id: head.id, created: true };
}

/**
 * Costing → Quotation hand-off (manual-mode auto-flow, owner request 2026-09-01:
 * "when the previous step is completed the details flow to the next step, like a
 * multi-step form"). On every costing approval we ensure the inquiry has a DRAFT
 * quotation and that every APPROVED + LOCKED line is present on it — so approved
 * costings surface in the Quotation register with their details carried forward.
 *
 * Idempotent + accumulating:
 *  - one quotation per inquiry (the earliest existing one is reused, never a 2nd);
 *  - only lines whose chosen costing is locked with a non-null final unit cost are
 *    pulled in (the same "safe to quote" rule the createQuotation hard-gate uses);
 *  - a line already on the quotation is left untouched (never re-priced), so a
 *    later-approved line just appends. Nothing is sent — the draft waits for review.
 */
export async function syncQuotationForInquiry(
  inquiryId: string,
  createdById: string,
): Promise<{ quotationId: string; created: boolean; added: number } | null> {
  const seeds = await getInquiryItemSeeds(inquiryId);
  // "Ready to quote" = approved & locked chosen costing with a final unit cost.
  const ready = seeds.filter((s) => s.isCostingLocked && s.finalUnitCost != null);
  if (ready.length === 0) return null;

  const auto = await getQuoteAutofill(inquiryId);
  if (!auto) return null;

  // Accumulate into the inquiry's existing quotation (earliest), else create one.
  const [existing] = await db
    .select({ id: quotations.id, quoteSent: quotations.quoteSent })
    .from(quotations)
    .where(eq(quotations.inquiryId, inquiryId))
    .orderBy(asc(quotations.createdAt))
    .limit(1);

  // Never mutate a quotation that's already gone to the customer — what was sent
  // stays sent. A line approved after the send is the user's call to add.
  if (existing?.quoteSent) {
    return { quotationId: existing.id, created: false, added: 0 };
  }

  let quotationId: string;
  let created = false;
  if (existing) {
    quotationId = existing.id;
  } else {
    const line0 = ready[0]!;
    const quoteNo = `${auto.smNumber}-Q01`;
    const [head] = await db
      .insert(quotations)
      .values({
        inquiryId,
        companyName: auto.companyName,
        enquiryDate: auto.enquiryDate,
        // line-#1 legacy mirror (same subset createQuotation seeds).
        custProductName: line0.custProductName ?? auto.productDescription ?? undefined,
        qty: line0.qty ?? undefined,
        gradeCustomer: line0.gradeCustomer ?? auto.gradeName ?? undefined,
        tolerance: line0.tolerance ?? auto.toleranceName ?? undefined,
        condition: line0.condition ?? auto.conditionName ?? undefined,
        partNo: line0.partNo ?? undefined,
        finalCost: line0.finalUnitCost ?? undefined,
        quotationStatus: "draft",
        quoteNo,
        createdById,
      })
      .returning({ id: quotations.id });
    if (!head) throw new Error("quotations insert returned no row");
    quotationId = head.id;
    created = true;
  }

  // Append any approved line not yet on the quotation (never touch existing ones).
  const existingItems = await db
    .select({
      inquiryItemId: quotationItems.inquiryItemId,
      sortOrder: quotationItems.sortOrder,
    })
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, quotationId));
  const present = new Set(
    existingItems.map((r) => r.inquiryItemId).filter((v): v is string => v !== null),
  );
  const maxSort = existingItems.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  const missing = ready.filter((s) => !present.has(s.inquiryItemId));
  if (missing.length) {
    await db.insert(quotationItems).values(
      missing.map((s, i) => ({
        quotationId,
        inquiryItemId: s.inquiryItemId,
        itemId: s.itemId,
        sortOrder: maxSort + 1 + i,
        qty: s.qty,
        // Authoritative approved per-piece cost (same basis createQuotation uses).
        finalCost: s.finalUnitCost,
      })),
    );
  }
  return { quotationId, created, added: missing.length };
}

/**
 * Quotation → Negotiation hand-off (manual-mode auto-flow). Resolves the quote's
 * inquiry + SM number and provisions the DRAFT negotiation. Idempotent via
 * provisionNegotiationFromQuote (no-op if a negotiation already links the quote).
 */
export async function ensureNegotiationForQuote(
  quotationId: string,
  createdById: string,
): Promise<ProvisionResult | null> {
  const [q] = await db
    .select({ inquiryId: quotations.inquiryId })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  if (!q) return null;
  const smNumber = await smNumberForInquiry(db, q.inquiryId);
  if (!smNumber) return null;
  return provisionNegotiationFromQuote(db, {
    quotationId,
    inquiryId: q.inquiryId,
    smNumber,
    createdById,
  });
}

/** Resolve an inquiry's SM number (for provisioning doc numbers). */
export async function smNumberForInquiry(
  tx: DbLike,
  inquiryId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ smNumber: inquiries.smNumber })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);
  return row?.smNumber ?? null;
}
