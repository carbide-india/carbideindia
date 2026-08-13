import "server-only";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients,
  costings,
  costingVendorQuotes,
  employees,
  inquiries,
  inquiryItems,
  type CostingVendorQuote,
} from "@/db/schema";
import {
  compareVendors,
  type VendorComparison,
} from "@/lib/costing/compute";
import {
  costingBucketOf,
  costingDaysToTarget,
  isCostingOverdue,
  type CostingBucket,
} from "@/lib/costing/buckets";
import type {
  CostingDoneStatus,
  CostingRoute,
  SecondaryFeasibilityStatus,
} from "@/db/enums";
import type { SpecSnapshot } from "@/lib/feasibility/spec-variance";

/**
 * Tiny caption query for the /costings/new page: fetches the product name
 * (custProductName) for a single inquiry_item so the form header shows the
 * product without requiring the caller to reload the full inquiry.
 */
export async function getInquiryItemCaption(
  inquiryItemId: string,
): Promise<string> {
  const [row] = await db
    .select({ custProductName: inquiryItems.custProductName })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  return row?.custProductName ?? "Unknown product";
}

/**
 * Everything the Costing Master shell needs for one target line in ONE read: the
 * product caption, the line quantity (from the enquiry), and the customer's
 * default payment-terms label (from the Client Master, for the terminal-field
 * default). All nullable / best-effort.
 */
export interface CostingContext {
  productCaption: string;
  lineQty: number | null;
  customerPaymentTerms: string | null;
  /** Auto/"From Data" header fields shown read-only on the costing form. */
  smNumber: string | null;
  enquiryDate: Date | null;
}

export async function getCostingContext(
  inquiryItemId: string,
): Promise<CostingContext> {
  const [row] = await db
    .select({
      custProductName: inquiryItems.custProductName,
      quantityNos: inquiryItems.quantityNos,
      clientPaymentTerms: clients.paymentTerms,
      smNumber: inquiries.smNumber,
      enquiryDate: inquiries.enquiryDate,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiryItems.inquiryId, inquiries.id))
    .leftJoin(clients, eq(inquiries.clientId, clients.id))
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);

  const rawQty = row?.quantityNos != null ? Number(row.quantityNos) : NaN;
  return {
    productCaption: row?.custProductName ?? "Unknown product",
    lineQty: Number.isFinite(rawQty) ? rawQty : null,
    customerPaymentTerms: row?.clientPaymentTerms ?? null,
    smNumber: row?.smNumber ?? null,
    enquiryDate: row?.enquiryDate ?? null,
  };
}

/**
 * The full "From Data" spec (enquiry fields 4–21) for one product line, plus the
 * frozen Primary-Feasibility baseline and the per-line lock flag — everything the
 * Costing form's editable Product & Specifications transfer panel needs. Master
 * ids are returned RAW (unresolved); the page passes the master option lists so
 * the client can render labels + the PF-vs-Costing variance tags. `outerDia` etc.
 * are numeric columns → returned as decimal strings (or null).
 */
export interface CostingSpec {
  custProductName: string | null;
  custDrawingNo: string | null;
  drawingRevisionNo: string | null;
  quantityNos: string | null;
  quantityUom: string;
  shape: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionUnit: string | null;
  dimensionNotes: string | null;
  gradeCustomer: string | null;
  gradeCustomerFacingId: string | null;
  gradeInternalProductionId: string | null;
  toleranceId: string | null;
  conditionId: string | null;
  internalProductionCodeId: string | null;
  partNoId: string | null;
  isDimensionsLocked: boolean;
  /** Frozen PF snapshot (jsonb) — the variance baseline, or null if never locked. */
  feasibilityBaseline: SpecSnapshot | null;
}

export async function getCostingSpecForItem(
  inquiryItemId: string,
): Promise<CostingSpec | null> {
  const [row] = await db
    .select({
      custProductName: inquiryItems.custProductName,
      custDrawingNo: inquiryItems.custDrawingNo,
      drawingRevisionNo: inquiryItems.drawingRevisionNo,
      quantityNos: inquiryItems.quantityNos,
      quantityUom: inquiryItems.quantityUom,
      shape: inquiryItems.shape,
      outerDia: inquiryItems.outerDia,
      innerDia: inquiryItems.innerDia,
      length: inquiryItems.length,
      width: inquiryItems.width,
      thickness: inquiryItems.thickness,
      dimensionUnit: inquiryItems.dimensionUnit,
      dimensionNotes: inquiryItems.dimensionNotes,
      gradeCustomer: inquiryItems.gradeCustomer,
      gradeCustomerFacingId: inquiryItems.gradeCustomerFacingId,
      gradeInternalProductionId: inquiryItems.gradeInternalProductionId,
      toleranceId: inquiryItems.toleranceId,
      conditionId: inquiryItems.conditionId,
      internalProductionCodeId: inquiryItems.internalProductionCodeId,
      partNoId: inquiryItems.partNoId,
      isDimensionsLocked: inquiryItems.isDimensionsLocked,
      feasibilityBaseline: inquiryItems.feasibilityBaseline,
    })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    feasibilityBaseline: (row.feasibilityBaseline as SpecSnapshot | null) ?? null,
  };
}

/** Full costing row (all inputs + outputs). */
export type CostingRow = typeof costings.$inferSelect;

/**
 * A costing enriched with its BO vendor-quote matrix (ordered by sortOrder) and
 * the server-computed comparison tags (cheapest / fastest / bestCredit ids plus
 * per-vendor landed cost). `vendorComparison` is null for non-BO costings or a
 * BO costing with no quotes.
 */
export interface CostingWithVendorQuotes extends CostingRow {
  vendorQuotes: CostingVendorQuote[];
  vendorComparison: VendorComparison | null;
}

/**
 * Attach a costing's vendor quotes + comparison in ONE grouped query (no N+1 —
 * called only by single-costing getters). qty for the landed-cost math comes
 * from the costing row itself.
 */
async function attachVendorQuotes(
  row: CostingRow,
): Promise<CostingWithVendorQuotes> {
  const vendorQuotes = await db
    .select()
    .from(costingVendorQuotes)
    .where(eq(costingVendorQuotes.costingId, row.id))
    .orderBy(asc(costingVendorQuotes.sortOrder));

  const vendorComparison =
    vendorQuotes.length > 0
      ? compareVendors(vendorQuotes, Number(row.qty ?? 0))
      : null;

  return { ...row, vendorQuotes, vendorComparison };
}

/** Chosen costing summary per inquiry_item - used by Task 5 to avoid N+1. */
export interface ChosenCostingSummary {
  inquiryItemId: string;
  finalCostPerPiece: string | null;
  costingDoneStatus: CostingDoneStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Costing register — "what is LEFT", not "what exists"
//
// The register counts PRODUCT LINES, because a product line is the unit of
// costing work. One line can carry an in-house row AND a bought-out row AND
// several revisions and it is still ONE costing job. Crucially, a line that is
// costable but has NO costing row at all is still a row here, in the Not Started
// bucket — that is the only way Manan's "20 confirmed, 3 costed, 17 NOT DONE"
// can ever appear on screen. Listing `costings` (as this register used to) can
// by construction only ever show the 3.
//
// Membership (deliberately a UNION, so no row is ever silently excluded):
//   A) every product line whose per-item feasibility is CONFIRMED
//      (inquiry_items.feasibility_confirmed = true) — this is exactly the gate
//      `saveCosting` / `saveCostingMaster` enforce, so every line counted here
//      is a line the system will actually let you cost; and
//   B) every product line that already carries at least one costing row, even if
//      it has since been un-confirmed — otherwise real cost sheets would vanish
//      from their own register.
// ─────────────────────────────────────────────────────────────────────────────

/** One costing row under a register line (the expanded revision/route list). */
export interface CostingRegisterCosting {
  id: string;
  costingType: CostingRoute;
  status: CostingDoneStatus;
  isChosen: boolean;
  isLocked: boolean;
  isLatestRevision: boolean;
  revisionNo: number;
  revisionReason: string | null;
  finalCostPerPiece: string | null;
  quoteValue: string | null;
  targetDate: Date | null;
  needInfoNote: string | null;
  createdAt: Date;
}

/** One row of the /costings register — a PRODUCT LINE, costed or not. */
export interface CostingRegisterRow {
  /** Row id = the inquiry_item id (the register's unit is the product line). */
  id: string;
  inquiryItemId: string;
  inquiryId: string;
  smNumber: string | null;
  companyName: string | null;
  custProductName: string | null;
  quantityNos: string | null;
  quantityUom: string | null;
  /** The costing this row reports on — null when nothing has been costed yet. */
  costingId: string | null;
  costingType: CostingRoute | null;
  /** Raw stored status of the representative costing (null = no costing row). */
  status: CostingDoneStatus | null;
  /** House bucket — legacy statuses fold in, `null` status ⇒ "not_done". */
  bucket: CostingBucket;
  finalCostPerPiece: string | null;
  quoteValue: string | null;
  targetDate: Date | null;
  needInfoNote: string | null;
  isLocked: boolean;
  /** Position of the representative within its route's revision list (1-based). */
  revisionNo: number;
  /** How many revisions exist on the representative's route. */
  revisionCount: number;
  /** Total costing rows on the line, across both routes and all revisions. */
  costingCount: number;
  overdue: boolean;
  /** Days late (positive) / remaining (negative); null when un-dated. */
  daysToTarget: number | null;
  secondaryFeasibilityStatus: SecondaryFeasibilityStatus;
  feasibilityConfirmed: boolean;
  /** Every costing on the line, oldest first — powers the expanded row panel. */
  costings: CostingRegisterCosting[];
  /** Representative costing's date, else the enquiry's — the register's "Date". */
  createdAt: Date;
}

/** Newest-first comparator inside one revision group: revision no, then date. */
function byRevisionDesc(
  a: CostingRegisterCosting,
  b: CostingRegisterCosting,
): number {
  if (a.revisionNo !== b.revisionNo) return b.revisionNo - a.revisionNo;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

/**
 * The costing that speaks for a line: the CHOSEN latest revision if there is one
 * (that is the row the Quotation will lock onto), otherwise the newest latest
 * revision, otherwise — for legacy lines where nothing is flagged latest — the
 * newest row of all. Never returns undefined for a non-empty list.
 */
function pickRepresentative(
  rows: readonly CostingRegisterCosting[],
): CostingRegisterCosting | null {
  if (rows.length === 0) return null;
  const latest = rows.filter((r) => r.isLatestRevision);
  const pool = latest.length > 0 ? latest : [...rows];
  const chosen = pool.filter((r) => r.isChosen);
  const ranked = (chosen.length > 0 ? chosen : pool).slice().sort(byRevisionDesc);
  return ranked[0] ?? null;
}

/**
 * The Costing register. Two reads (all costings; the union of costable +
 * already-costed lines) then an in-memory roll-up per line — no N+1.
 *
 * `now` is injectable so the overdue flag is testable; callers pass nothing.
 */
export async function listCostingRegister(
  now: Date = new Date(),
): Promise<CostingRegisterRow[]> {
  const costingRows = await db
    .select({
      id: costings.id,
      inquiryItemId: costings.inquiryItemId,
      costingType: costings.costingType,
      status: costings.costingDoneStatus,
      isChosen: costings.isChosen,
      isLocked: costings.isLocked,
      isLatestRevision: costings.isLatestRevision,
      revisionNo: costings.revisionNo,
      revisionReason: costings.revisionReason,
      finalCostPerPiece: costings.finalCostPerPiece,
      quoteValue: costings.quoteValue,
      targetDate: costings.targetDate,
      needInfoNote: costings.needInfoNote,
      createdAt: costings.createdAt,
    })
    .from(costings)
    .orderBy(asc(costings.createdAt));

  const byLine = new Map<string, CostingRegisterCosting[]>();
  for (const c of costingRows) {
    const list = byLine.get(c.inquiryItemId);
    const entry: CostingRegisterCosting = {
      id: c.id,
      costingType: c.costingType,
      status: c.status,
      isChosen: c.isChosen,
      isLocked: c.isLocked,
      isLatestRevision: c.isLatestRevision,
      revisionNo: c.revisionNo,
      revisionReason: c.revisionReason,
      finalCostPerPiece: c.finalCostPerPiece,
      quoteValue: c.quoteValue,
      targetDate: c.targetDate,
      needInfoNote: c.needInfoNote,
      createdAt: c.createdAt,
    };
    if (list) list.push(entry);
    else byLine.set(c.inquiryItemId, [entry]);
  }

  const costedLineIds = [...byLine.keys()];
  // Union membership (A ∪ B). `inArray` with an empty list is invalid SQL, so a
  // fresh database — no costings at all — falls back to the confirmed-only arm.
  const membership =
    costedLineIds.length > 0
      ? or(
          eq(inquiryItems.feasibilityConfirmed, true),
          inArray(inquiryItems.id, costedLineIds),
        )
      : eq(inquiryItems.feasibilityConfirmed, true);

  const lines = await db
    .select({
      inquiryItemId: inquiryItems.id,
      inquiryId: inquiryItems.inquiryId,
      custProductName: inquiryItems.custProductName,
      quantityNos: inquiryItems.quantityNos,
      quantityUom: inquiryItems.quantityUom,
      feasibilityConfirmed: inquiryItems.feasibilityConfirmed,
      secondaryFeasibilityStatus: inquiryItems.secondaryFeasibilityStatus,
      sortOrder: inquiryItems.sortOrder,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      enquiryCreatedAt: inquiries.createdAt,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiryItems.inquiryId, inquiries.id))
    // Archived enquiries are out — same rule the feasibility queue applies. An
    // archived SM is not outstanding work, and counting it would inflate every
    // bucket. This is the register's ONE exclusion and it is stated on the page.
    .where(and(eq(inquiries.isArchived, false), membership))
    .orderBy(desc(inquiries.createdAt), asc(inquiryItems.sortOrder));

  return lines.map((l) => {
    const all = (byLine.get(l.inquiryItemId) ?? []).slice().sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const rep = pickRepresentative(all);
    const sameRoute = rep ? all.filter((c) => c.costingType === rep.costingType) : [];
    // Positional ordinal, NOT the stored revision_no: every row written before
    // migration 0072 carries the default 1, so position is the only honest
    // "Costing 1 / 2 / 3" for legacy lines. They agree for new rows.
    const repIndex = rep ? sameRoute.findIndex((c) => c.id === rep.id) : -1;
    const bucket = costingBucketOf(rep?.status ?? null);

    return {
      id: l.inquiryItemId,
      inquiryItemId: l.inquiryItemId,
      inquiryId: l.inquiryId,
      smNumber: l.smNumber,
      companyName: l.companyName,
      custProductName: l.custProductName,
      quantityNos: l.quantityNos,
      quantityUom: l.quantityUom,
      costingId: rep?.id ?? null,
      costingType: rep?.costingType ?? null,
      status: rep?.status ?? null,
      bucket,
      finalCostPerPiece: rep?.finalCostPerPiece ?? null,
      quoteValue: rep?.quoteValue ?? null,
      targetDate: rep?.targetDate ?? null,
      needInfoNote: rep?.needInfoNote ?? null,
      isLocked: rep?.isLocked ?? false,
      revisionNo: repIndex >= 0 ? repIndex + 1 : 0,
      revisionCount: sameRoute.length,
      costingCount: all.length,
      overdue: isCostingOverdue(rep?.targetDate ?? null, bucket, now),
      daysToTarget: costingDaysToTarget(rep?.targetDate ?? null, now),
      secondaryFeasibilityStatus: l.secondaryFeasibilityStatus,
      feasibilityConfirmed: l.feasibilityConfirmed,
      costings: all,
      createdAt: rep?.createdAt ?? l.enquiryCreatedAt,
    } satisfies CostingRegisterRow;
  });
}

/**
 * Every costing revision on one product line, oldest first, grouped by route —
 * the "Costing 1 / Costing 2 / Costing 3" list on the costing detail page.
 * Earlier revisions are RETAINED, never deleted (पहले वाला रहेगा सिस्टम में), so
 * this is a plain history read with no filtering.
 */
export async function getCostingRevisionsForItem(
  inquiryItemId: string,
): Promise<CostingRow[]> {
  return db
    .select()
    .from(costings)
    .where(eq(costings.inquiryItemId, inquiryItemId))
    .orderBy(asc(costings.revisionNo), asc(costings.createdAt));
}

/** Line identity shown above a costing (SM / company / product / gate state). */
export interface CostingLineIdentity {
  inquiryItemId: string;
  inquiryId: string;
  smNumber: string | null;
  companyName: string | null;
  custProductName: string | null;
  feasibilityConfirmed: boolean;
  secondaryFeasibilityStatus: SecondaryFeasibilityStatus;
}

export async function getCostingLineIdentity(
  inquiryItemId: string,
): Promise<CostingLineIdentity | null> {
  const [row] = await db
    .select({
      inquiryItemId: inquiryItems.id,
      inquiryId: inquiryItems.inquiryId,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      custProductName: inquiryItems.custProductName,
      feasibilityConfirmed: inquiryItems.feasibilityConfirmed,
      secondaryFeasibilityStatus: inquiryItems.secondaryFeasibilityStatus,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiryItems.inquiryId, inquiries.id))
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  return row ?? null;
}

/**
 * All costings for an inquiry, ordered by item sort order then creation time.
 * Used on the SM detail page costing tab.
 */
export async function getCostingsForInquiry(
  inquiryId: string,
): Promise<CostingRow[]> {
  return db
    .select()
    .from(costings)
    .where(eq(costings.inquiryId, inquiryId))
    .orderBy(asc(costings.sortOrder), desc(costings.createdAt));
}

/**
 * Single costing by id - used for the costing detail / edit view.
 */
export async function getCostingById(
  id: string,
): Promise<CostingWithVendorQuotes | null> {
  const [row] = await db
    .select()
    .from(costings)
    .where(eq(costings.id, id))
    .limit(1);
  return row ? attachVendorQuotes(row) : null;
}

/**
 * The chosen costing for a single inquiry_item - at most one row (saveCosting
 * guarantees exactly-one-chosen per item). Returns the most recently created
 * chosen costing in case of legacy duplicates.
 */
export async function getChosenCostingForItem(
  inquiryItemId: string,
): Promise<CostingWithVendorQuotes | null> {
  const [row] = await db
    .select()
    .from(costings)
    .where(
      and(
        eq(costings.inquiryItemId, inquiryItemId),
        eq(costings.isChosen, true),
      ),
    )
    .orderBy(desc(costings.createdAt))
    .limit(1);
  return row ? attachVendorQuotes(row) : null;
}

/** Cross-path recommendation: the cheaper of the in-house vs bought-out path. */
export interface CostingRecommendation {
  recommendedOption: CostingRoute;
  /** Recommended unit cost (finalCostPerPiece of the cheaper path). */
  recommendedUnitCost: number;
  /** The BO vendor quote behind the recommendation - null when in-house wins. */
  recommendedVendorQuoteId: string | null;
}

/** Current lock / approval state of an inquiry_item's chosen costing (Shape A). */
export interface CostingDecisionState {
  approvedOption: CostingRoute | null;
  chosenVendorQuoteId: string | null;
  isOverridden: boolean;
  overrideReason: string | null;
  finalUnitCost: string | null;
  approverName: string | null;
  approvedAt: Date | null;
  isLocked: boolean;
}

/**
 * Everything the Costing Decision UI needs for one inquiry_item, in one read:
 * both candidate paths (in-house row + bought-out row with its vendor matrix),
 * the server-computed cross-path recommendation, and the current lock/approval
 * state (read off the chosen row, Shape A).
 */
export interface CostingDecision {
  inquiryItemId: string;
  inhouse: CostingRow | null;
  boughtOut: CostingWithVendorQuotes | null;
  recommendation: CostingRecommendation | null;
  state: CostingDecisionState;
}

const EMPTY_DECISION_STATE: CostingDecisionState = {
  approvedOption: null,
  chosenVendorQuoteId: null,
  isOverridden: false,
  overrideReason: null,
  finalUnitCost: null,
  approverName: null,
  approvedAt: null,
  isLocked: false,
};

/**
 * Compute the cross-path recommendation from the two candidate rows: the cheaper
 * finalCostPerPiece wins; if only one path exists it wins; null if neither does.
 * Ties resolve to in-house (manufacturing preferred). Pure - no DB access.
 */
export function computeCostingRecommendation(
  inhouse: CostingRow | null,
  boughtOut: CostingRow | null,
): CostingRecommendation | null {
  const inCost = inhouse?.finalCostPerPiece != null ? Number(inhouse.finalCostPerPiece) : null;
  const boCost = boughtOut?.finalCostPerPiece != null ? Number(boughtOut.finalCostPerPiece) : null;
  const inValid = inCost != null && Number.isFinite(inCost);
  const boValid = boCost != null && Number.isFinite(boCost);

  if (inValid && (!boValid || (inCost as number) <= (boCost as number))) {
    return {
      recommendedOption: "inhouse",
      recommendedUnitCost: inCost as number,
      recommendedVendorQuoteId: null,
    };
  }
  if (boValid) {
    return {
      recommendedOption: "bought_out",
      recommendedUnitCost: boCost as number,
      recommendedVendorQuoteId: boughtOut?.recommendedVendorQuoteId ?? null,
    };
  }
  return null;
}

/**
 * Decision bundle for one inquiry_item. One grouped read for the costing rows
 * (+ approver name via left-join) and one read for the BO vendor quotes - no
 * N+1. Picks the most-recent row per path as that path's candidate.
 */
export async function getCostingDecision(
  inquiryItemId: string,
): Promise<CostingDecision> {
  const rows = await db
    .select({ costing: costings, approverName: employees.name })
    .from(costings)
    .leftJoin(employees, eq(employees.id, costings.approverId))
    .where(eq(costings.inquiryItemId, inquiryItemId))
    .orderBy(desc(costings.createdAt));

  const inhouseRow =
    rows.find((r) => r.costing.costingType === "inhouse")?.costing ?? null;
  const boRowFlat =
    rows.find((r) => r.costing.costingType === "bought_out")?.costing ?? null;
  const chosen = rows.find((r) => r.costing.isChosen) ?? null;

  const boughtOut = boRowFlat ? await attachVendorQuotes(boRowFlat) : null;

  const recommendation = computeCostingRecommendation(inhouseRow, boRowFlat);

  const state: CostingDecisionState = chosen
    ? {
        approvedOption: chosen.costing.approvedOption ?? null,
        chosenVendorQuoteId: chosen.costing.chosenVendorQuoteId ?? null,
        isOverridden: chosen.costing.isOverridden,
        overrideReason: chosen.costing.overrideReason ?? null,
        finalUnitCost: chosen.costing.finalUnitCost ?? null,
        approverName: chosen.approverName ?? null,
        approvedAt: chosen.costing.approvedAt ?? null,
        isLocked: chosen.costing.isLocked,
      }
    : EMPTY_DECISION_STATE;

  return {
    inquiryItemId,
    inhouse: inhouseRow,
    boughtOut,
    recommendation,
    state,
  };
}

/**
 * Lock/approval snapshot of the CHOSEN costing for a single inquiry_item, as
 * used by the quotation hard-gate. `isLocked` + a non-null `finalUnitCost`
 * together mean the decision is admin-approved and safe to quote against.
 */
export interface ChosenCostingLock {
  inquiryItemId: string;
  isLocked: boolean;
  /** The approved per-piece cost (numeric string) - the authoritative quote cost basis. */
  finalUnitCost: string | null;
  approvedOption: CostingRoute | null;
  chosenVendorQuoteId: string | null;
}

/**
 * Batched lock/approval lookup for many inquiry_items in ONE read (no N+1):
 * the chosen costing per item keyed by inquiryItemId, most-recent-wins to
 * tolerate legacy duplicate chosen rows (same rule as getChosenCostingForItem).
 * Items with no chosen costing are simply absent from the map. Used by the
 * quotation create action to enforce "every quoted line has an approved &
 * locked costing" and to source the authoritative cost basis (finalUnitCost).
 */
export async function getChosenCostingLocksForItems(
  inquiryItemIds: string[],
): Promise<Map<string, ChosenCostingLock>> {
  const map = new Map<string, ChosenCostingLock>();
  if (inquiryItemIds.length === 0) return map;
  const rows = await db
    .select({
      inquiryItemId: costings.inquiryItemId,
      isLocked: costings.isLocked,
      finalUnitCost: costings.finalUnitCost,
      approvedOption: costings.approvedOption,
      chosenVendorQuoteId: costings.chosenVendorQuoteId,
    })
    .from(costings)
    .where(
      and(
        inArray(costings.inquiryItemId, inquiryItemIds),
        eq(costings.isChosen, true),
        // The Quotation must consume the LATEST revision. Previously "latest"
        // was implied by createdAt DESC alone; this makes it explicit so a
        // superseded Costing 1 can never win a race with Costing 2. No
        // behaviour change on legacy rows — every pre-0072 row is flagged true.
        eq(costings.isLatestRevision, true),
      ),
    )
    .orderBy(desc(costings.createdAt));
  for (const r of rows) {
    // First row per item wins (rows are newest-first).
    if (!map.has(r.inquiryItemId)) {
      map.set(r.inquiryItemId, {
        inquiryItemId: r.inquiryItemId,
        isLocked: r.isLocked,
        finalUnitCost: r.finalUnitCost ?? null,
        approvedOption: r.approvedOption ?? null,
        chosenVendorQuoteId: r.chosenVendorQuoteId ?? null,
      });
    }
  }
  return map;
}

/**
 * Chosen costing summary for every inquiry_item of an inquiry - avoids N+1
 * on the SM detail costing tab. Returns an array keyed by inquiryItemId with
 * the finalCostPerPiece + costingDoneStatus of the chosen costing (if any).
 */
export async function getChosenCostingsForInquiry(
  inquiryId: string,
): Promise<ChosenCostingSummary[]> {
  return db
    .select({
      inquiryItemId: costings.inquiryItemId,
      finalCostPerPiece: costings.finalCostPerPiece,
      costingDoneStatus: costings.costingDoneStatus,
    })
    .from(costings)
    .where(
      and(
        eq(costings.inquiryId, inquiryId),
        eq(costings.isChosen, true),
      ),
    )
    .orderBy(desc(costings.createdAt));
}
