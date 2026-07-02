import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dispatches,
  dispatchLines,
  salesOrders,
  salesOrderItems,
  type Dispatch,
} from "@/db/schema";
import { requireRole } from "@/lib/auth/roles";
import { nextDocNumber, financialYearLabel } from "@/lib/series/next-number";

/**
 * Phase 7 — thin dispatch (delivery-note) create + issue path (§11.2). The DN
 * number is a GAPLESS FY-scoped register, so it is allocated ONLY at the issue
 * transition, inside the same transaction that flips the status — never on the
 * draft. Full workspace/PDF is Phase 9.
 */

export interface DispatchLineSeed {
  salesOrderItemId?: string | null;
  itemId?: string | null;
  productionOrderId?: string | null;
  qtyDispatched: number;
}

export type CreateDispatchResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Create a DRAFT dispatch (no DN number yet) for a sales order, seeding lines
 * from explicit qtys. Requires the `dispatch` role.
 */
export async function createDraftDispatch(input: {
  salesOrderId: string;
  lines: DispatchLineSeed[];
  vehicleNo?: string;
  transporterName?: string;
}): Promise<CreateDispatchResult> {
  const me = await requireRole("dispatch");

  const [so] = await db
    .select({ id: salesOrders.id, clientId: salesOrders.inquiryId })
    .from(salesOrders)
    .where(eq(salesOrders.id, input.salesOrderId))
    .limit(1);
  if (!so) return { ok: false, error: "Sales order not found" };
  if (input.lines.length === 0) return { ok: false, error: "No dispatch lines" };

  const id = await db.transaction(async (tx) => {
    const [head] = await tx
      .insert(dispatches)
      .values({
        salesOrderId: input.salesOrderId,
        status: "draft",
        vehicleNo: input.vehicleNo ?? null,
        transporterName: input.transporterName ?? null,
        createdById: me.id,
      })
      .returning({ id: dispatches.id });
    if (!head) throw new Error("dispatches insert returned no row");

    await tx.insert(dispatchLines).values(
      input.lines.map((l, i) => ({
        dispatchId: head.id,
        salesOrderItemId: l.salesOrderItemId ?? null,
        itemId: l.itemId ?? null,
        productionOrderId: l.productionOrderId ?? null,
        sortOrder: i,
        qtyDispatched: String(l.qtyDispatched),
      })),
    );
    return head.id;
  });

  return { ok: true, id };
}

/**
 * Issue a draft dispatch: allocate the gapless FY-scoped DN number and flip to
 * `issued`, atomically. Re-issuing an already-issued dispatch is a no-op error.
 */
export async function issueDispatch(
  dispatchId: string,
): Promise<{ ok: true; dnNo: string } | { ok: false; error: string }> {
  const me = await requireRole("dispatch");
  const date = new Date();

  return db.transaction(async (tx) => {
    const [d] = await tx
      .select({ id: dispatches.id, status: dispatches.status, dnNo: dispatches.dnNo })
      .from(dispatches)
      .where(eq(dispatches.id, dispatchId))
      .limit(1);
    if (!d) return { ok: false as const, error: "Dispatch not found" };
    if (d.status !== "draft" || d.dnNo != null) {
      return { ok: false as const, error: "Dispatch already issued" };
    }

    const num = await nextDocNumber(tx, "dn", date);
    await tx
      .update(dispatches)
      .set({
        dnNo: num.formatted,
        fyLabel: num.fyLabel,
        status: "issued",
        dispatchDate: date,
        issuedAt: date,
        issuedById: me.id,
        updatedAt: date,
      })
      .where(eq(dispatches.id, dispatchId));

    return { ok: true as const, dnNo: num.formatted };
  });
}

/** Thin read of a dispatch header + its FY (callers/tests). */
export async function getDispatch(id: string): Promise<Dispatch | null> {
  await requireRole("dispatch");
  const [row] = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
  return row ?? null;
}

/** Exposed for callers that need to precompute the current FY label. */
export { financialYearLabel };

/** Ordered lines of a dispatch (thin read). */
export async function getDispatchLines(dispatchId: string) {
  await requireRole("dispatch");
  return db
    .select()
    .from(dispatchLines)
    .where(eq(dispatchLines.dispatchId, dispatchId))
    .orderBy(asc(dispatchLines.sortOrder));
}
