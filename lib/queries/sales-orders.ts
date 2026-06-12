import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { salesOrders, type SalesOrder } from "@/db/schema";

/** One row of the /sales-orders register table. */
export interface SalesOrderListItem {
  id: string;
  soNo: string;
  companyName: string | null;
  quotePrice: string | null;
  customerPoNo: string | null;
  customerSoSent: boolean;
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
