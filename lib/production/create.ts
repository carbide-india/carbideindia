import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  productionOrders,
  salesOrders,
  salesOrderItems,
  type ProductionOrder,
} from "@/db/schema";
import { requireRole } from "@/lib/auth/roles";

/**
 * Phase 7 - thin production-order create path (§11.1). Full workspace/routing UI
 * lands in Phase 9; this is the minimal, callable, testable seam that turns a
 * Sales Order into shop-floor production orders (one per SO line), anchored on
 * the line's Item. `po_no` is DB-assigned via the production_order_no_seq
 * default, so no allocation logic is needed here (production numbers are NOT
 * statutory / gapless - only invoice/DN are).
 */

export type CreateResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Create one production order per line of a confirmed Sales Order. Idempotency
 * and stage-gating (only from a confirmed SO) are Phase-8 concerns; this seam
 * just materializes the orders. Requires the `production` role.
 */
export async function createProductionOrdersForSalesOrder(
  salesOrderId: string,
): Promise<CreateResult> {
  const me = await requireRole("production");

  const [so] = await db
    .select({ id: salesOrders.id })
    .from(salesOrders)
    .where(eq(salesOrders.id, salesOrderId))
    .limit(1);
  if (!so) return { ok: false, error: "Sales order not found" };

  const lines = await db
    .select({
      id: salesOrderItems.id,
      itemId: salesOrderItems.itemId,
      inquiryItemId: salesOrderItems.inquiryItemId,
      qty: salesOrderItems.qty,
      qtyOrdered: salesOrderItems.qtyOrdered,
    })
    .from(salesOrderItems)
    .where(eq(salesOrderItems.salesOrderId, salesOrderId))
    .orderBy(asc(salesOrderItems.sortOrder));

  const withItem = lines.filter(
    (l): l is typeof l & { itemId: string } => l.itemId != null,
  );
  if (withItem.length === 0) {
    return { ok: false, error: "Sales order has no item-linked lines" };
  }

  const ids = await db.transaction(async (tx) => {
    const out: string[] = [];
    for (const line of withItem) {
      const [row] = await tx
        .insert(productionOrders)
        .values({
          salesOrderId,
          salesOrderItemId: line.id,
          itemId: line.itemId,
          qtyPlanned: line.qtyOrdered ?? line.qty ?? null,
          status: "planned",
          createdById: me.id,
        })
        .returning({ id: productionOrders.id });
      if (!row) throw new Error("production_orders insert returned no row");
      out.push(row.id);
    }
    return out;
  });

  return { ok: true, ids };
}

/** Fetch a production order by id (thin read for callers/tests). */
export async function getProductionOrder(
  id: string,
): Promise<ProductionOrder | null> {
  await requireRole("production");
  const [row] = await db
    .select()
    .from(productionOrders)
    .where(and(eq(productionOrders.id, id), eq(productionOrders.isActive, true)))
    .limit(1);
  return row ?? null;
}
