import "server-only";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  salesOrders,
  salesOrderItems,
  type SalesOrder,
  type SalesOrderItem,
} from "@/db/schema";
import {
  resolveSpecsByItemId,
  resolveCustomerAskByInquiryItemId,
  EMPTY_SPEC,
  EMPTY_CUSTOMER_ASK,
  type ResolvedSpec,
  type ResolvedCustomerAsk,
} from "@/lib/flow/spec-resolve";

/** One row of the /sales-orders register table. */
export interface SalesOrderListItem {
  id: string;
  soNo: string;
  companyName: string | null;
  quotePrice: string | null;
  customerPoNo: string | null;
  customerSoSent: boolean;
  /** SM snapshot of the enquiry date; null on legacy rows — date filters fall
   *  back to createdAt. */
  enquiryDate: Date | null;
  createdAt: Date;
}

export interface SalesOrderFilters {
  q?: string;
}

/**
 * Sales Order register list. Uncached (URL-driven, per-user). `q` matches the
 * SO number OR company name, case-insensitive substring (wildcards escaped).
 */
export async function listSalesOrders(
  filters: SalesOrderFilters = {},
): Promise<SalesOrderListItem[]> {
  const conds = [];
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(ilike(salesOrders.soNo, like), ilike(salesOrders.companyName, like)),
    );
  }
  return db
    .select({
      id: salesOrders.id,
      soNo: salesOrders.soNo,
      companyName: salesOrders.companyName,
      quotePrice: salesOrders.quotePrice,
      customerPoNo: salesOrders.customerPoNo,
      customerSoSent: salesOrders.customerSoSent,
      enquiryDate: salesOrders.enquiryDate,
      createdAt: salesOrders.createdAt,
    })
    .from(salesOrders)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(salesOrders.createdAt));
}

/** Full sales-order row for the detail page. */
export async function getSalesOrderById(
  id: string,
): Promise<SalesOrder | null> {
  const [row] = await db
    .select()
    .from(salesOrders)
    .where(eq(salesOrders.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * All line items for a sales order, in sort order, with product SPEC resolved
 * read-through from the linked Item (§2.4). Price / qty / timeline stay on the
 * line; product-describing fields come from `items` via `item_id`.
 */
export type SalesOrderLineWithSpec = SalesOrderItem & {
  spec: ResolvedSpec;
  ask: ResolvedCustomerAsk;
};

export async function getSalesOrderItems(
  salesOrderId: string,
): Promise<SalesOrderLineWithSpec[]> {
  const rows = await db
    .select()
    .from(salesOrderItems)
    .where(eq(salesOrderItems.salesOrderId, salesOrderId))
    .orderBy(asc(salesOrderItems.sortOrder));
  const [specs, asks] = await Promise.all([
    resolveSpecsByItemId(rows.map((r) => r.itemId)),
    resolveCustomerAskByInquiryItemId(rows.map((r) => r.inquiryItemId)),
  ]);
  return rows.map((r) => ({
    ...r,
    spec: (r.itemId && specs.get(r.itemId)) || EMPTY_SPEC,
    ask: (r.inquiryItemId && asks.get(r.inquiryItemId)) || EMPTY_CUSTOMER_ASK,
  }));
}
