import "server-only";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  notExists,
  or,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  costings,
  quotations,
  quotationItems,
  type Quotation,
} from "@/db/schema";
import {
  COSTING_ROUTE_LABELS,
  type CostingDoneStatus,
  type CostingRoute,
  type QuotationStatus,
} from "@/db/enums";
import {
  resolveSpecsByItemId,
  resolveCustomerAskByInquiryItemId,
} from "@/lib/flow/spec-resolve";
import {
  foldQuotationBucketCounts,
  type QuotationBucketCounts,
} from "@/components/quotations/quotation-buckets";
import { isCostBasisStale } from "@/components/quotations/costing-basis";

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
  /** The cost basis frozen onto this line when the quote was created (numeric
   *  string ₹), sourced server-side from the then-approved costing. */
  costBasis: string | null;
  /** LATEST costing revision behind this line (revision model owned by the
   *  costing workstream - consumed here, never recomputed). Null when the line
   *  has no inquiry_item link or the item has no costing yet. */
  latestCosting: LatestCostingRevision | null;
  /** True only when BOTH the frozen basis and the latest revision's unit cost
   *  are known AND they differ - an unknown is never reported as stale. */
  costBasisStale: boolean;
}

/**
 * The newest costing revision for one product line, as the quotation stage sees
 * it. Read straight off `costings` with `is_latest_revision = true`; the
 * revision numbering / supersession rules belong to the costing workstream.
 */
export interface LatestCostingRevision {
  costingId: string;
  /** Costing 1 / Costing 2 / Costing 3 for this product line. */
  revisionNo: number;
  costingType: CostingRoute;
  costingTypeLabel: string;
  /** Approved per-piece cost on that revision (the quote's authoritative basis). */
  finalUnitCost: string | null;
  costingDoneStatus: CostingDoneStatus;
  isChosen: boolean;
  isLocked: boolean;
}

/** One row of the /quotations register table. */
export interface QuotationListItem {
  id: string;
  quoteNo: string;
  companyName: string | null;
  custProductName: string | null;
  quotePrice: string | null;
  /** Mirrored UPSTREAM costing status (display only - inherited, not this
   *  stage's own state). */
  costingDoneStatus: CostingDoneStatus;
  /** This stage's house bucket - what the dashboard groups and counts by. */
  quotationStatus: QuotationStatus;
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
  /** How many lines were priced off a costing revision that has since been
   *  superseded. 0 when nothing is stale OR nothing is comparable. */
  staleCostLines: number;
}

export interface QuotationFilters {
  q?: string;
  /** House bucket from the dashboard strip (`?bucket=`). */
  bucket?: QuotationStatus;
  /** `"no"` = only quotes still unsent (`?sent=no`); cross-cuts `bucket`. */
  sent?: "yes" | "no";
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
  // Dashboard tiles filter the register server-side, so the list a tile opens
  // is exactly the rows that tile counted.
  if (filters.bucket) {
    conds.push(eq(quotations.quotationStatus, filters.bucket));
  }
  if (filters.sent) {
    conds.push(eq(quotations.quoteSent, filters.sent === "yes"));
  }
  const heads = await db
    .select({
      id: quotations.id,
      quoteNo: quotations.quoteNo,
      companyName: quotations.companyName,
      custProductName: quotations.custProductName,
      quotePrice: quotations.quotePrice,
      costingDoneStatus: quotations.costingDoneStatus,
      quotationStatus: quotations.quotationStatus,
      quoteSent: quotations.quoteSent,
      enquiryDate: quotations.enquiryDate,
      createdAt: quotations.createdAt,
    })
    .from(quotations)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(quotations.createdAt));

  const lineProducts = await listQuotationLineProducts(heads.map((h) => h.id));
  return heads.map((h) => {
    const lines = lineProducts.get(h.id) ?? [];
    return {
      ...h,
      lineProducts: lines,
      staleCostLines: lines.filter((l) => l.costBasisStale).length,
    };
  });
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
      finalCost: quotationItems.finalCost,
    })
    .from(quotationItems)
    .where(inArray(quotationItems.quotationId, quotationIds))
    .orderBy(asc(quotationItems.quotationId), asc(quotationItems.sortOrder));

  const [specs, asks, costingRevs] = await Promise.all([
    resolveSpecsByItemId(rows.map((r) => r.itemId)),
    resolveCustomerAskByInquiryItemId(rows.map((r) => r.inquiryItemId)),
    getLatestCostingRevisionsForItems(
      rows.map((r) => r.inquiryItemId).filter((v): v is string => v !== null),
    ),
  ]);

  for (const r of rows) {
    const ask = r.inquiryItemId ? asks.get(r.inquiryItemId) : undefined;
    const spec = r.itemId ? specs.get(r.itemId) : undefined;
    const name =
      ask?.custProductName ?? spec?.partNo ?? spec?.itemCode ?? null;
    const latestCosting =
      (r.inquiryItemId ? costingRevs.get(r.inquiryItemId) : undefined) ?? null;
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
      costBasis: r.finalCost ?? null,
      latestCosting,
      costBasisStale: isCostBasisStale(
        r.finalCost,
        latestCosting?.finalUnitCost,
      ),
    };
    if (list) list.push(product);
    else out.set(r.quotationId, [product]);
  }
  return out;
}

/**
 * The LATEST costing revision per inquiry_item, in ONE batched read (no N+1).
 *
 * A product line can carry two live revision chains - the revision group is
 * (inquiry_item_id, costing_type), so an In-house AND a Bought-Out sheet can
 * both be `is_latest_revision`. The quotation stage wants the one the price
 * actually rests on, so rows are ordered CHOSEN first, then highest revision,
 * then newest, and the first row per item wins. Items with no costing at all
 * are simply absent from the map.
 *
 * The revision model itself (revisionNo / supersedesCostingId /
 * isLatestRevision) is owned by the costing workstream - this only reads it.
 */
export async function getLatestCostingRevisionsForItems(
  inquiryItemIds: string[],
): Promise<Map<string, LatestCostingRevision>> {
  const map = new Map<string, LatestCostingRevision>();
  const ids = Array.from(new Set(inquiryItemIds));
  if (ids.length === 0) return map;

  const rows = await db
    .select({
      costingId: costings.id,
      inquiryItemId: costings.inquiryItemId,
      revisionNo: costings.revisionNo,
      costingType: costings.costingType,
      finalUnitCost: costings.finalUnitCost,
      costingDoneStatus: costings.costingDoneStatus,
      isChosen: costings.isChosen,
      isLocked: costings.isLocked,
    })
    .from(costings)
    .where(
      and(
        inArray(costings.inquiryItemId, ids),
        eq(costings.isLatestRevision, true),
      ),
    )
    .orderBy(
      desc(costings.isChosen),
      desc(costings.revisionNo),
      desc(costings.createdAt),
    );

  for (const r of rows) {
    if (map.has(r.inquiryItemId)) continue;
    map.set(r.inquiryItemId, {
      costingId: r.costingId,
      revisionNo: r.revisionNo,
      costingType: r.costingType,
      costingTypeLabel: COSTING_ROUTE_LABELS[r.costingType],
      finalUnitCost: r.finalUnitCost ?? null,
      costingDoneStatus: r.costingDoneStatus,
      isChosen: r.isChosen,
      isLocked: r.isLocked,
    });
  }
  return map;
}

/**
 * Live bucket counts for the register dashboard, from ONE
 * `GROUP BY quotation_status, quote_sent` over the WHOLE table.
 *
 * Deliberately unfiltered: the tiles must always show what is left across the
 * register, not within whatever the user is currently looking at. Quotations
 * carry no soft-delete and the register list is equally unfiltered, so
 * `sum(byBucket) === total === listQuotations({}).length` - a tile can never
 * silently drop a row.
 */
export async function getQuotationBucketCounts(): Promise<QuotationBucketCounts> {
  const rows = await db
    .select({
      status: quotations.quotationStatus,
      quoteSent: quotations.quoteSent,
      n: count(),
    })
    .from(quotations)
    .groupBy(quotations.quotationStatus, quotations.quoteSent);

  return foldQuotationBucketCounts(
    rows.map((r) => ({
      status: r.status,
      quoteSent: r.quoteSent,
      n: Number(r.n),
    })),
  );
}

/**
 * Product lines that are READY to quote but have no quotation line yet - the
 * quotation stage's inflow, i.e. work that has not reached the register at all
 * and therefore cannot appear in any bucket.
 *
 * "Ready" is not a new rule: it is exactly the hard-gate `createQuotation`
 * already enforces via getChosenCostingLocksForItems - a chosen costing that is
 * LOCKED with a non-null `final_unit_cost`. Restricted to the latest revision so
 * a superseded row can never make a line look ready. Counted as DISTINCT
 * inquiry_item_ids, so a line with both an In-house and a Bought-Out chosen
 * sheet counts once.
 */
export async function countLinesReadyToQuote(): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(costings.inquiryItemId) })
    .from(costings)
    .where(
      and(
        eq(costings.isChosen, true),
        eq(costings.isLocked, true),
        eq(costings.isLatestRevision, true),
        isNotNull(costings.finalUnitCost),
        notExists(
          db
            .select({ one: quotationItems.id })
            .from(quotationItems)
            .where(eq(quotationItems.inquiryItemId, costings.inquiryItemId)),
        ),
      ),
    );
  return Number(row?.n ?? 0);
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
