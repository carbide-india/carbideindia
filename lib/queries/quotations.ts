import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotations, type Quotation } from "@/db/schema";
import type { CostingDoneStatus } from "@/db/enums";

/** One row of the /quotations register table. */
export interface QuotationListItem {
  id: string;
  quoteNo: string;
  companyName: string | null;
  custProductName: string | null;
  quotePrice: string | null;
  costingDoneStatus: CostingDoneStatus;
  quoteSent: boolean;
  /** SM snapshot of the enquiry date; null on legacy rows — date filters fall
   *  back to createdAt. */
  enquiryDate: Date | null;
  createdAt: Date;
}

export interface QuotationFilters {
  q?: string;
}

/**
 * Quotation register list. Filters are URL-driven (nuqs) and per-user, so this
 * is intentionally uncached. `q` matches the quote number OR company name,
 * case-insensitive substring (ilike wildcards escaped).
 */
export async function listQuotations(
  filters: QuotationFilters = {},
): Promise<QuotationListItem[]> {
  const conds = [];
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(ilike(quotations.quoteNo, like), ilike(quotations.companyName, like)),
    );
  }
  return db
    .select({
      id: quotations.id,
      quoteNo: quotations.quoteNo,
      companyName: quotations.companyName,
      custProductName: quotations.custProductName,
      quotePrice: quotations.quotePrice,
      costingDoneStatus: quotations.costingDoneStatus,
      quoteSent: quotations.quoteSent,
      enquiryDate: quotations.enquiryDate,
      createdAt: quotations.createdAt,
    })
    .from(quotations)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(quotations.createdAt));
}

/** Full quotation row for the detail page. */
export async function getQuotationById(id: string): Promise<Quotation | null> {
  const [row] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, id))
    .limit(1);
  return row ?? null;
}
