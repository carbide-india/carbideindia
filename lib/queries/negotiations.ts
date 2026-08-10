import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  negotiations,
  negotiationItems,
  costings,
  employees,
  type Negotiation,
  type NegotiationItem,
} from "@/db/schema";
import type {
  CostingDoneStatus,
  CostingRoute,
  NegotiationStage,
  NegotiationStatus,
} from "@/db/enums";
import {
  buildNegotiationDashboard,
  type NegotiationDashboard,
  type NegotiationGroupRow,
} from "@/lib/negotiations/buckets";
import {
  resolveSpecsByItemId,
  resolveCustomerAskByInquiryItemId,
  EMPTY_SPEC,
  EMPTY_CUSTOMER_ASK,
  type ResolvedSpec,
  type ResolvedCustomerAsk,
} from "@/lib/flow/spec-resolve";

/**
 * Σ(quote price × qty) over a negotiation's OWN lines, one row per negotiation.
 * Line #1 mirrors the header columns, so joining this and preferring it over the
 * header product never double-counts; negotiations created without lines (legacy
 * / header-only rows) fall back to `quote_price × qty` so no value is dropped.
 */
const negLineValue = db
  .select({
    negotiationId: negotiationItems.negotiationId,
    lineValue: sql<
      string | null
    >`sum(coalesce(${negotiationItems.quotePrice}, 0) * coalesce(${negotiationItems.qty}, 0))`.as(
      "line_value",
    ),
  })
  .from(negotiationItems)
  .groupBy(negotiationItems.negotiationId)
  .as("neg_line_value");

/** The quoted value of ONE negotiation: its line sum, else the header mirror. */
const quotedValueSql = sql<string>`coalesce(${negLineValue.lineValue}, coalesce(${negotiations.quotePrice}, 0) * coalesce(${negotiations.qty}, 0))`;

/** numeric-as-text → number; unparseable / null folds to 0 (never NaN). */
function numOrZero(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** One row of the /negotiations register table. */
export interface NegotiationListItem {
  id: string;
  negotiationNo: string;
  companyName: string | null;
  salesPersonName: string | null;
  quotePrice: string | null;
  negotiationStatus: NegotiationStatus;
  /** PI pipeline position — Quote Send → PI Issued → Awarded → PO Received. */
  negotiationStage: NegotiationStage;
  /** How many proforma invoices have gone out; 0 = nothing sent yet. */
  piIterationCount: number;
  customerPoNo: string | null;
  /** Σ(quote price × qty) across the negotiation's lines (see quotedValueSql). */
  quotedValue: number;
  /** SM snapshot of the enquiry date; null on legacy rows - date filters fall
   *  back to createdAt. */
  enquiryDate: Date | null;
  createdAt: Date;
}

export interface NegotiationFilters {
  status?: NegotiationStatus;
  /** Any-of status filter — how the dashboard's "Outcome" tile drills through
   *  (the outcome axis is a SET of statuses, not one value). */
  statusIn?: readonly NegotiationStatus[];
  /** PI pipeline stage — the dashboard's "sent / in negotiation" chips. */
  stage?: NegotiationStage;
  /** true = only rows with at least one PI issued; false = only rows with none. */
  piSent?: boolean;
  q?: string;
}

/**
 * Negotiation register list. Uncached (URL-driven, per-user). `q` matches the
 * negotiation number OR company name (ilike wildcards escaped); `status`
 * filters by the live pipeline state (house bucket OR commercial outcome — they
 * share one column); `stage` / `piSent` filter the PI pipeline axis. Sales
 * person name from the employee join, quoted value from the line-sum subquery.
 */
export async function listNegotiations(
  filters: NegotiationFilters = {},
): Promise<NegotiationListItem[]> {
  const conds = [];
  if (filters.status) {
    conds.push(eq(negotiations.negotiationStatus, filters.status));
  }
  if (filters.statusIn) {
    // An empty allow-list must match NOTHING, not everything.
    conds.push(
      filters.statusIn.length
        ? inArray(negotiations.negotiationStatus, [...filters.statusIn])
        : sql`false`,
    );
  }
  if (filters.stage) {
    conds.push(eq(negotiations.negotiationStage, filters.stage));
  }
  if (filters.piSent !== undefined) {
    conds.push(
      filters.piSent
        ? sql`${negotiations.piIterationCount} > 0`
        : sql`${negotiations.piIterationCount} = 0`,
    );
  }
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        ilike(negotiations.negotiationNo, like),
        ilike(negotiations.companyName, like),
      ),
    );
  }
  const rows = await db
    .select({
      id: negotiations.id,
      negotiationNo: negotiations.negotiationNo,
      companyName: negotiations.companyName,
      salesPersonName: employees.name,
      quotePrice: negotiations.quotePrice,
      negotiationStatus: negotiations.negotiationStatus,
      negotiationStage: negotiations.negotiationStage,
      piIterationCount: negotiations.piIterationCount,
      customerPoNo: negotiations.customerPoNo,
      quotedValue: quotedValueSql,
      enquiryDate: negotiations.enquiryDate,
      createdAt: negotiations.createdAt,
    })
    .from(negotiations)
    .leftJoin(employees, eq(negotiations.salesPersonId, employees.id))
    .leftJoin(negLineValue, eq(negLineValue.negotiationId, negotiations.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(negotiations.createdAt));

  return rows.map((r) => ({ ...r, quotedValue: numOrZero(r.quotedValue) }));
}

/**
 * Live counts for the /negotiations dashboard, over the WHOLE register (never
 * the filtered slice) so a bucket count can never silently exclude rows.
 *
 * One grouped round trip on (status, stage, "has a PI been issued") — at most
 * 13 × 4 × 2 groups — carrying both the row count and the summed quoted value.
 * The fold into buckets / outcomes / volume tiles is the pure
 * `buildNegotiationDashboard`, which is unit-tested.
 */
export async function getNegotiationDashboard(): Promise<NegotiationDashboard> {
  const piSentSql = sql<boolean>`${negotiations.piIterationCount} > 0`;
  const rows = await db
    .select({
      status: negotiations.negotiationStatus,
      stage: negotiations.negotiationStage,
      piSent: piSentSql,
      count: sql<number>`count(*)::int`,
      value: sql<string>`coalesce(sum(${quotedValueSql}), 0)`,
    })
    .from(negotiations)
    .leftJoin(negLineValue, eq(negLineValue.negotiationId, negotiations.id))
    .groupBy(negotiations.negotiationStatus, negotiations.negotiationStage, piSentSql);

  const groups: NegotiationGroupRow[] = rows.map((r) => ({
    status: r.status,
    stage: r.stage,
    piSent: Boolean(r.piSent),
    count: numOrZero(r.count),
    value: numOrZero(r.value),
  }));
  return buildNegotiationDashboard(groups);
}

/** Full negotiation row for the detail page. */
export async function getNegotiationById(
  id: string,
): Promise<Negotiation | null> {
  const [row] = await db
    .select()
    .from(negotiations)
    .where(eq(negotiations.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * All line items for a negotiation, in sort order, with product SPEC resolved
 * read-through from the linked Item (§2.4). Prices / qty / timeline stay on the
 * line; the product-describing fields come from `items` via `item_id`.
 */
export type NegotiationLineWithSpec = NegotiationItem & {
  spec: ResolvedSpec;
  ask: ResolvedCustomerAsk;
};

export async function getNegotiationItems(
  negotiationId: string,
): Promise<NegotiationLineWithSpec[]> {
  const rows = await db
    .select()
    .from(negotiationItems)
    .where(eq(negotiationItems.negotiationId, negotiationId))
    .orderBy(asc(negotiationItems.sortOrder));
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

// ── Revise-costing loop ─────────────────────────────────────────────────────
// A negotiation that is not approved sends the costing back for a NEW revision
// ("वो नया कॉस्टिंग बनेगा उसका"). The revision MODEL lives on `costings`
// (revisionNo / supersedesCostingId / isLatestRevision — owned by the costing
// workstream); this query only answers "which cost sheets could be revised from
// here", i.e. the CURRENT revision of every costing behind this negotiation's
// product lines.

/** One current-revision cost sheet reachable from a negotiation's lines. */
export interface RevisableCosting {
  id: string;
  /** The enquiry product line this cost sheet belongs to. */
  inquiryItemId: string;
  costingType: CostingRoute;
  revisionNo: number;
  costingDoneStatus: CostingDoneStatus;
  finalUnitCost: string | null;
  isChosen: boolean;
  isLocked: boolean;
  updatedAt: Date;
}

/**
 * The latest revision of every costing that hangs off this negotiation's product
 * lines. Superseded revisions are excluded (`is_latest_revision = true`) — you
 * can only revise the head of a revision chain. Ordered by product line then
 * costing type so the picker reads in the same order as the negotiation lines.
 */
export async function listRevisableCostingsForNegotiation(
  negotiationId: string,
): Promise<RevisableCosting[]> {
  const lines = await db
    .select({ inquiryItemId: negotiationItems.inquiryItemId })
    .from(negotiationItems)
    .where(eq(negotiationItems.negotiationId, negotiationId));

  const itemIds = [
    ...new Set(
      lines.map((l) => l.inquiryItemId).filter((v): v is string => v !== null),
    ),
  ];
  if (itemIds.length === 0) return [];

  return db
    .select({
      id: costings.id,
      inquiryItemId: costings.inquiryItemId,
      costingType: costings.costingType,
      revisionNo: costings.revisionNo,
      costingDoneStatus: costings.costingDoneStatus,
      finalUnitCost: costings.finalUnitCost,
      isChosen: costings.isChosen,
      isLocked: costings.isLocked,
      updatedAt: costings.updatedAt,
    })
    .from(costings)
    .where(
      and(
        inArray(costings.inquiryItemId, itemIds),
        eq(costings.isLatestRevision, true),
      ),
    )
    .orderBy(asc(costings.sortOrder), asc(costings.costingType), asc(costings.createdAt));
}
