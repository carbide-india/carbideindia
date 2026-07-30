import "server-only";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotations, quotationItems, type Quotation } from "@/db/schema";
import type { CostingDoneStatus } from "@/db/enums";
import {
  resolveSpecsByItemId,
  resolveCustomerAskByInquiryItemId,
} from "@/lib/flow/spec-resolve";

/** One quoted line-product shown in a register row's "Quoted Products" table.
 *  Beyond the name + qty the register list always carried, this surfaces the
 *  read-through spec (grade / tolerance / condition / part-no) and the line's
 *  price so every meaningful per-line field is readable in one popover. */
export interface QuotationLineProduct {
  id: string;
  /** Customer-facing product name (read-through), or a part-no / item-code
   *  fallback; null only for a line with no resolvable descriptor. */
  name: string | null;
  qty: string | null;
  /** Read-through spec (master NAMES, resolved from the line's `item_id`). */
  grade: string | null;
  tolerance: string | null;
  condition: string | null;
  /** Part identity carried on the item spec. */
  partNo: string | null;
  /** The line's price: the working quote price, else the frozen sent unit
   *  price; a numeric string (₹) or null when the line is unpriced. */
  quotePrice: string | null;
}

/** One row of the /quotations register table. */
export interface QuotationListItem {
  id: string;
  quoteNo: string;
  companyName: string | null;
  custProductName: string | null;
  quotePrice: string | null;
  costingDoneStatus: CostingDoneStatus;
  quoteSent: boolean;
  /** SM snapshot of the enquiry date; null on legacy rows - date filters fall
   *  back to createdAt. */
  enquiryDate: Date | null;
  createdAt: Date;
  /** Every quoted line-product for this quotation, in sort order (line 1 first).
   *  A quotation can carry many product lines; the register's flat
   *  `custProductName` only mirrors line 1, so this drives the "More Products"
   *  affordance. Empty for legacy quotes with no `quotation_items` rows. */
  lineProducts: QuotationLineProduct[];
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
  const heads = await db
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

  const lineProducts = await listQuotationLineProducts(heads.map((h) => h.id));
  return heads.map((h) => ({
    ...h,
    lineProducts: lineProducts.get(h.id) ?? [],
  }));
}

/**
 * All line-products for the given quotations, grouped by quotation id and in
 * sort order. ONE query for the raw lines plus two batched read-through
 * resolvers (customer-ask via `inquiry_item_id`, spec via `item_id`) - no N+1
 * per quotation or per line. Each line's display name prefers the customer-ask
 * product name, then falls back to the item's part-no / item-code so a line is
 * never blank when the SPEC still describes it.
 */
async function listQuotationLineProducts(
  quotationIds: string[],
): Promise<Map<string, QuotationLineProduct[]>> {
  const out = new Map<string, QuotationLineProduct[]>();
  if (quotationIds.length === 0) return out;

  const rows = await db
    .select({
      id: quotationItems.id,
      quotationId: quotationItems.quotationId,
      inquiryItemId: quotationItems.inquiryItemId,
      itemId: quotationItems.itemId,
      qty: quotationItems.qty,
      quotePrice: quotationItems.quotePrice,
      unitPrice: quotationItems.unitPrice,
    })
    .from(quotationItems)
    .where(inArray(quotationItems.quotationId, quotationIds))
    .orderBy(asc(quotationItems.quotationId), asc(quotationItems.sortOrder));

  const [specs, asks] = await Promise.all([
    resolveSpecsByItemId(rows.map((r) => r.itemId)),
    resolveCustomerAskByInquiryItemId(rows.map((r) => r.inquiryItemId)),
  ]);

  for (const r of rows) {
    const ask = r.inquiryItemId ? asks.get(r.inquiryItemId) : undefined;
    const spec = r.itemId ? specs.get(r.itemId) : undefined;
    const name =
      ask?.custProductName ?? spec?.partNo ?? spec?.itemCode ?? null;
    const list = out.get(r.quotationId);
    const product: QuotationLineProduct = {
      id: r.id,
      name,
      qty: r.qty,
      grade: spec?.gradeName ?? null,
      tolerance: spec?.toleranceName ?? null,
      condition: spec?.conditionName ?? null,
      partNo: spec?.partNo ?? null,
      // Working quote price drives the draft; fall back to the frozen sent
      // unit price so a sent line still shows what the customer relied on.
      quotePrice: r.quotePrice ?? r.unitPrice ?? null,
    };
    if (list) list.push(product);
    else out.set(r.quotationId, [product]);
  }
  return out;
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
