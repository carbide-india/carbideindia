import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
import type { CostingRoute } from "@/db/enums";
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
}

export async function getCostingContext(
  inquiryItemId: string,
): Promise<CostingContext> {
  const [row] = await db
    .select({
      custProductName: inquiryItems.custProductName,
      quantityNos: inquiryItems.quantityNos,
      clientPaymentTerms: clients.paymentTerms,
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

/**
 * One row of the /costings register - joins inquiry smNumber/companyName and
 * the inquiry_item's custProductName so the register is human-readable without
 * extra round-trips.
 */
export interface CostingListItem {
  id: string;
  inquiryId: string;
  inquiryItemId: string;
  smNumber: string | null;
  companyName: string | null;
  custProductName: string | null;
  costingType: "inhouse" | "bought_out";
  isChosen: boolean;
  finalCostPerPiece: string | null;
  quoteValue: string | null;
  costingDoneStatus: "not_done" | "in_process" | "done";
  createdAt: Date;
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
  costingDoneStatus: "not_done" | "in_process" | "done";
}

/**
 * Costing register - all costings, newest first. Joins inquiry smNumber +
 * companyName and inquiry_item custProductName for display.
 */
export async function listCostings(): Promise<CostingListItem[]> {
  return db
    .select({
      id: costings.id,
      inquiryId: costings.inquiryId,
      inquiryItemId: costings.inquiryItemId,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      custProductName: inquiryItems.custProductName,
      costingType: costings.costingType,
      isChosen: costings.isChosen,
      finalCostPerPiece: costings.finalCostPerPiece,
      quoteValue: costings.quoteValue,
      costingDoneStatus: costings.costingDoneStatus,
      createdAt: costings.createdAt,
    })
    .from(costings)
    .leftJoin(inquiries, eq(costings.inquiryId, inquiries.id))
    .leftJoin(inquiryItems, eq(costings.inquiryItemId, inquiryItems.id))
    .orderBy(desc(costings.createdAt));
}

/**
 * Product lines that are ELIGIBLE to be costed - i.e. their parent inquiry has
 * passed Primary Feasibility (feasibilityStatus = proceed_to_costing). Powers
 * the picker shown when /costings/new is opened without a target line (e.g. the
 * Forms launcher "Costing" tile or the register's "New Costing" button). Flags
 * lines that already carry a chosen costing so the picker can badge them.
 */
export interface CostableInquiryItem {
  inquiryItemId: string;
  inquiryId: string;
  smNumber: string | null;
  companyName: string | null;
  custProductName: string | null;
  alreadyCosted: boolean;
}

export async function listCostableInquiryItems(): Promise<CostableInquiryItem[]> {
  const rows = await db
    .select({
      inquiryItemId: inquiryItems.id,
      inquiryId: inquiryItems.inquiryId,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      custProductName: inquiryItems.custProductName,
      sortOrder: inquiryItems.sortOrder,
      createdAt: inquiries.createdAt,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiryItems.inquiryId, inquiries.id))
    .where(eq(inquiries.feasibilityStatus, "proceed_to_costing"))
    .orderBy(desc(inquiries.createdAt), asc(inquiryItems.sortOrder));

  if (rows.length === 0) return [];

  // One extra query to badge lines that already have a chosen costing.
  const chosen = await db
    .select({ inquiryItemId: costings.inquiryItemId })
    .from(costings)
    .where(
      and(
        eq(costings.isChosen, true),
        inArray(
          costings.inquiryItemId,
          rows.map((r) => r.inquiryItemId),
        ),
      ),
    );
  const costedSet = new Set(chosen.map((c) => c.inquiryItemId));

  return rows.map((r) => ({
    inquiryItemId: r.inquiryItemId,
    inquiryId: r.inquiryId,
    smNumber: r.smNumber,
    companyName: r.companyName,
    custProductName: r.custProductName,
    alreadyCosted: costedSet.has(r.inquiryItemId),
  }));
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
