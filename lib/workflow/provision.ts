import "server-only";
import { count, eq } from "drizzle-orm";
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

/**
 * ERP Phase 8 — idempotent auto-provisioning (§4.6). Each `provision*` helper
 * creates the NEXT-stage DRAFT for a source record BY REFERENCE (FK edges only,
 * never copying spec/price — downstream resolves read-through), and ONLY IF no
 * descendant already exists. The idempotency guard makes a second call a no-op:
 * it returns the already-existing id and inserts nothing, so double-provisioning
 * (e.g. a retried transition, or the standalone New form + advanceStage racing)
 * is impossible.
 *
 * These run INSIDE the advanceStage transaction (passed `tx`) so the freeze +
 * provision + audit are one atomic unit.
 */

// A handle compatible with both `db` and a `db.transaction(tx => )` tx — the
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
 * Idempotent on negotiation_id — closes the negotiation→SO break (§4.6/DoD #9).
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
