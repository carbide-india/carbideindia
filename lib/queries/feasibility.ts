import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, employees, masterOptions } from "@/db/schema";
import type {
  FeasibilityStatus,
  FeasPriority,
  InquiryPriority,
  RecheckState,
} from "@/db/enums";
import type { SecondaryFeasibilityStatus } from "@/db/enums";
import { feasibilityBucketOf } from "@/lib/feasibility/stage-buckets";
import {
  computeSpecVariance,
  collectMasterIds,
  countChanged,
  type SpecSnapshot,
  type SpecVarianceRow,
} from "@/lib/feasibility/spec-variance";
import { effectiveSecondaryBucket } from "@/lib/feasibility/stage-buckets";

/**
 * Primary-Feasibility queries (client-sheet model). The review lives on the
 * `inquiries` row (the legacy embedded `feas*` columns): five checks, notes,
 * priority, export, actions, who-checked, and the feasibility status the costing
 * gate reads. Every live enquiry is a queue row (a fresh enquiry is simply
 * `not_started`).
 */

export interface FeasibilityQueueItem {
  id: string;
  smNumber: string;
  companyName: string;
  enquiryDate: Date;
  createdAt: Date;
  priority: InquiryPriority;
  feasPriority: FeasPriority | null;
  export: boolean | null;
  status: FeasibilityStatus;
  checkedByName: string | null;
  productCount: number;
  /** How many of the 5 checks are set (Yes/Assumed, i.e. not "Not Done"). */
  checksDone: number;
  checksTotal: number;
  /**
   * How many of this SM's product lines drifted from their frozen Primary
   * baseline (≥1 changed spec field). Lines with no baseline are not
   * comparable and never count — see {@link countVarianceLines}.
   */
  varianceLines: number;
  /** Lines that HAVE a frozen baseline, i.e. the denominator of the above. */
  comparableLines: number;
}

const notDone = (v: RecheckState | null | undefined) => v != null && v !== "not_done";

/** The spec columns the variance engine reads off a live product line. */
const SPEC_SELECT = {
  shape: inquiryItems.shape,
  outerDia: inquiryItems.outerDia,
  innerDia: inquiryItems.innerDia,
  length: inquiryItems.length,
  width: inquiryItems.width,
  thickness: inquiryItems.thickness,
  dimensionUnit: inquiryItems.dimensionUnit,
  gradeCustomer: inquiryItems.gradeCustomer,
  gradeCustomerFacingId: inquiryItems.gradeCustomerFacingId,
  gradeInternalProductionId: inquiryItems.gradeInternalProductionId,
  toleranceId: inquiryItems.toleranceId,
  conditionId: inquiryItems.conditionId,
  quantityNos: inquiryItems.quantityNos,
  quantityUom: inquiryItems.quantityUom,
} as const;

/**
 * Does this line differ from its frozen Primary baseline? Master-id fields are
 * compared by ID, so counting needs no master_options lookup (labels are only
 * resolved when the report is actually rendered).
 */
function hasSpecVariance(baseline: unknown, current: SpecSnapshot): boolean {
  if (baseline == null) return false;
  return countChanged(computeSpecVariance(baseline as SpecSnapshot, current)) > 0;
}

/** The feasibility queue: every live enquiry with its review state. */
export async function listFeasibilityQueue(): Promise<FeasibilityQueueItem[]> {
  const rows = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      enquiryDate: inquiries.enquiryDate,
      createdAt: inquiries.createdAt,
      priority: inquiries.priority,
      feasPriority: inquiries.feasPriority,
      export: inquiries.feasExport,
      status: inquiries.feasibilityStatus,
      checkedByName: employees.name,
      c1: inquiries.feasSizeDrawingCheck,
      c2: inquiries.feasToleranceCheck,
      c3: inquiries.feasGradeAppCheck,
      c4: inquiries.feasQuantityCheck,
      c5: inquiries.feasConditionCheck,
    })
    .from(inquiries)
    .leftJoin(employees, eq(employees.id, inquiries.feasibilityCheckedById))
    .where(eq(inquiries.isArchived, false))
    .orderBy(desc(inquiries.enquiryDate), desc(inquiries.createdAt));

  // One pass over the product lines gives BOTH the line count and the variance
  // roll-up (no N+1, no second query per SM).
  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await db
        .select({
          inquiryId: inquiryItems.inquiryId,
          baseline: inquiryItems.feasibilityBaseline,
          ...SPEC_SELECT,
        })
        .from(inquiryItems)
        .where(inArray(inquiryItems.inquiryId, ids))
    : [];

  const countBy = new Map<string, number>();
  const comparableBy = new Map<string, number>();
  const varianceBy = new Map<string, number>();
  for (const l of lines) {
    countBy.set(l.inquiryId, (countBy.get(l.inquiryId) ?? 0) + 1);
    if (l.baseline == null) continue;
    comparableBy.set(l.inquiryId, (comparableBy.get(l.inquiryId) ?? 0) + 1);
    if (hasSpecVariance(l.baseline, l)) {
      varianceBy.set(l.inquiryId, (varianceBy.get(l.inquiryId) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    smNumber: r.smNumber,
    companyName: r.companyName,
    enquiryDate: r.enquiryDate,
    createdAt: r.createdAt,
    priority: r.priority,
    feasPriority: r.feasPriority ?? null,
    export: r.export ?? null,
    status: r.status,
    checkedByName: r.checkedByName ?? null,
    productCount: countBy.get(r.id) ?? 0,
    checksDone: [r.c1, r.c2, r.c3, r.c4, r.c5].filter(notDone).length,
    checksTotal: 5,
    varianceLines: varianceBy.get(r.id) ?? 0,
    comparableLines: comparableBy.get(r.id) ?? 0,
  }));
}

/** @deprecated Alias of {@link listFeasibilityQueue} kept for existing callers. */
export const listFeasibilityReviews = listFeasibilityQueue;

/** The feasibility status for one enquiry (costing gate reads this). */
export async function getFeasibilityStatus(inquiryId: string): Promise<FeasibilityStatus> {
  const [row] = await db
    .select({ status: inquiries.feasibilityStatus })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);
  return (row?.status ?? "not_started") as FeasibilityStatus;
}

/** True once the review is approved for costing (costing hard-gate helper). */
export async function isFeasibilityApproved(inquiryId: string): Promise<boolean> {
  return (await getFeasibilityStatus(inquiryId)) === "proceed_to_costing";
}

/**
 * True once a single product line's feasibility has been CONFIRMED (the strong
 * per-item costing gate that replaces the inquiry-level proceed_to_costing gate).
 * A confirmed line is always locked (confirming requires a lock first).
 */
export async function isItemFeasibilityConfirmed(inquiryItemId: string): Promise<boolean> {
  const [row] = await db
    .select({ confirmed: inquiryItems.feasibilityConfirmed })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  return row?.confirmed === true;
}

/* ── Dimensions & specifications lock gate (Form 04 → Form 05, migration 0062) ── */

/**
 * The per-product-line lock state shown on the Technical Review surface. Each
 * inquiry_item must have its dimensions & specifications *locked* in Primary
 * Feasibility before Costing (Form 05) will consume it — the lock freezes the
 * PF baseline used for the PF-vs-Costing variance report.
 */
export interface ItemLockState {
  inquiryItemId: string;
  sortOrder: number;
  custProductName: string | null;
  gradeCustomer: string | null;
  shape: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionUnit: string | null;
  quantityNos: string | null;
  quantityUom: string;
  isLocked: boolean;
  lockedById: string | null;
  lockedByName: string | null;
  lockedAt: Date | null;
  /** Per-item Feasibility Confirmed state (the step AFTER lock; the costing gate). */
  feasibilityConfirmed: boolean;
  confirmedByName: string | null;
  confirmedAt: Date | null;
}

/** Lock state for every product line on one SM, ordered by the line sort order. */
export async function listItemLockStates(inquiryId: string): Promise<ItemLockState[]> {
  const confirmer = alias(employees, "confirmer");
  const rows = await db
    .select({
      inquiryItemId: inquiryItems.id,
      sortOrder: inquiryItems.sortOrder,
      custProductName: inquiryItems.custProductName,
      gradeCustomer: inquiryItems.gradeCustomer,
      shape: inquiryItems.shape,
      outerDia: inquiryItems.outerDia,
      innerDia: inquiryItems.innerDia,
      length: inquiryItems.length,
      width: inquiryItems.width,
      thickness: inquiryItems.thickness,
      dimensionUnit: inquiryItems.dimensionUnit,
      quantityNos: inquiryItems.quantityNos,
      quantityUom: inquiryItems.quantityUom,
      isLocked: inquiryItems.isDimensionsLocked,
      lockedById: inquiryItems.lockedById,
      lockedByName: employees.name,
      lockedAt: inquiryItems.lockedAt,
      feasibilityConfirmed: inquiryItems.feasibilityConfirmed,
      confirmedByName: confirmer.name,
      confirmedAt: inquiryItems.feasibilityConfirmedAt,
    })
    .from(inquiryItems)
    .leftJoin(employees, eq(employees.id, inquiryItems.lockedById))
    .leftJoin(confirmer, eq(confirmer.id, inquiryItems.feasibilityConfirmedById))
    .where(eq(inquiryItems.inquiryId, inquiryId))
    .orderBy(asc(inquiryItems.sortOrder));

  return rows.map((r) => ({
    inquiryItemId: r.inquiryItemId,
    sortOrder: r.sortOrder,
    custProductName: r.custProductName,
    gradeCustomer: r.gradeCustomer,
    shape: r.shape,
    outerDia: r.outerDia,
    innerDia: r.innerDia,
    length: r.length,
    width: r.width,
    thickness: r.thickness,
    dimensionUnit: r.dimensionUnit,
    quantityNos: r.quantityNos,
    quantityUom: r.quantityUom,
    isLocked: r.isLocked,
    lockedById: r.lockedById ?? null,
    lockedByName: r.lockedByName ?? null,
    lockedAt: r.lockedAt ?? null,
    feasibilityConfirmed: r.feasibilityConfirmed,
    confirmedByName: r.confirmedByName ?? null,
    confirmedAt: r.confirmedAt ?? null,
  }));
}

/* ── Secondary / Technical Feasibility (per-item detailed technical spec) ── */

/**
 * The per-product-line Secondary / Technical Feasibility state shown on the
 * feasibility review surface — the detailed technical-spec stage that sits
 * between Primary Feasibility (5-check review + Lock Dimensions) and Confirm.
 * Carries the live confirmed dimensions (so the section can render a tolerance
 * box only for dims that have a value) plus every saved secondary field and the
 * done stamp (who/when).
 */
export interface SecondaryFeasibilityState {
  inquiryItemId: string;
  sortOrder: number;
  custProductName: string | null;
  gradeCustomer: string | null;
  shape: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionUnit: string | null;
  quantityNos: string | null;
  quantityUom: string;
  /** Per-dimension tolerances (± text, free form e.g. "±0.05"). */
  outerDiaTol: string | null;
  innerDiaTol: string | null;
  lengthTol: string | null;
  widthTol: string | null;
  thicknessTol: string | null;
  secBlockWt: string | null;
  secNetWt: string | null;
  secMaterialWt: string | null;
  gradeInternalProductionId: string | null;
  conditionId: string | null;
  toleranceId: string | null;
  secProcessRoute: string | null;
  secToolingAvailability: string | null;
  secMaterialAvailability: string | null;
  secVerdict: string | null;
  secNotes: string | null;
  secondaryFeasibilityDone: boolean;
  secondaryFeasibilityAt: Date | null;
  secondaryByName: string | null;
  /** House bucket for the line, with the legacy stamps folded in (see
   *  {@link effectiveSecondaryBucket}) — the pill the section header shows. */
  bucket: SecondaryFeasibilityStatus;
  /** A confirmed line's specs are frozen — the section renders read-only. */
  feasibilityConfirmed: boolean;
}

/** Secondary/Technical Feasibility state for every line on one SM, in sort order. */
export async function listSecondaryFeasibilityStates(
  inquiryId: string,
): Promise<SecondaryFeasibilityState[]> {
  const rows = await db
    .select({
      inquiryItemId: inquiryItems.id,
      sortOrder: inquiryItems.sortOrder,
      custProductName: inquiryItems.custProductName,
      gradeCustomer: inquiryItems.gradeCustomer,
      shape: inquiryItems.shape,
      outerDia: inquiryItems.outerDia,
      innerDia: inquiryItems.innerDia,
      length: inquiryItems.length,
      width: inquiryItems.width,
      thickness: inquiryItems.thickness,
      dimensionUnit: inquiryItems.dimensionUnit,
      quantityNos: inquiryItems.quantityNos,
      quantityUom: inquiryItems.quantityUom,
      outerDiaTol: inquiryItems.outerDiaTol,
      innerDiaTol: inquiryItems.innerDiaTol,
      lengthTol: inquiryItems.lengthTol,
      widthTol: inquiryItems.widthTol,
      thicknessTol: inquiryItems.thicknessTol,
      secBlockWt: inquiryItems.secBlockWt,
      secNetWt: inquiryItems.secNetWt,
      secMaterialWt: inquiryItems.secMaterialWt,
      gradeInternalProductionId: inquiryItems.gradeInternalProductionId,
      conditionId: inquiryItems.conditionId,
      toleranceId: inquiryItems.toleranceId,
      secProcessRoute: inquiryItems.secProcessRoute,
      secToolingAvailability: inquiryItems.secToolingAvailability,
      secMaterialAvailability: inquiryItems.secMaterialAvailability,
      secVerdict: inquiryItems.secVerdict,
      secNotes: inquiryItems.secNotes,
      secondaryFeasibilityDone: inquiryItems.secondaryFeasibilityDone,
      secondaryFeasibilityAt: inquiryItems.secondaryFeasibilityAt,
      secondaryByName: employees.name,
      storedBucket: inquiryItems.secondaryFeasibilityStatus,
      feasibilityConfirmed: inquiryItems.feasibilityConfirmed,
    })
    .from(inquiryItems)
    .leftJoin(employees, eq(employees.id, inquiryItems.secondaryFeasibilityById))
    .where(eq(inquiryItems.inquiryId, inquiryId))
    .orderBy(asc(inquiryItems.sortOrder));

  return rows.map((r) => ({
    inquiryItemId: r.inquiryItemId,
    sortOrder: r.sortOrder,
    custProductName: r.custProductName,
    gradeCustomer: r.gradeCustomer,
    shape: r.shape,
    outerDia: r.outerDia,
    innerDia: r.innerDia,
    length: r.length,
    width: r.width,
    thickness: r.thickness,
    dimensionUnit: r.dimensionUnit,
    quantityNos: r.quantityNos,
    quantityUom: r.quantityUom,
    outerDiaTol: r.outerDiaTol,
    innerDiaTol: r.innerDiaTol,
    lengthTol: r.lengthTol,
    widthTol: r.widthTol,
    thicknessTol: r.thicknessTol,
    secBlockWt: r.secBlockWt,
    secNetWt: r.secNetWt,
    secMaterialWt: r.secMaterialWt,
    gradeInternalProductionId: r.gradeInternalProductionId,
    conditionId: r.conditionId,
    toleranceId: r.toleranceId,
    secProcessRoute: r.secProcessRoute,
    secToolingAvailability: r.secToolingAvailability,
    secMaterialAvailability: r.secMaterialAvailability,
    secVerdict: r.secVerdict,
    secNotes: r.secNotes,
    secondaryFeasibilityDone: r.secondaryFeasibilityDone,
    secondaryFeasibilityAt: r.secondaryFeasibilityAt ?? null,
    secondaryByName: r.secondaryByName ?? null,
    bucket: effectiveSecondaryBucket({
      storedStatus: r.storedBucket,
      secondaryDone: r.secondaryFeasibilityDone,
      secVerdict: r.secVerdict,
      hasSecondaryData: hasSecondaryData(r),
    }),
    feasibilityConfirmed: r.feasibilityConfirmed,
  }));
}

/* ── Secondary / Technical Feasibility queue (product lines past Primary) ── */

/**
 * A single product LINE that has cleared Primary Feasibility and therefore needs
 * (or already has) its Secondary / Technical Feasibility done. `inquiryId` links
 * the row to `/feasibility/[inquiryId]` where the Secondary section lives.
 */
export interface SecondaryFeasibilityQueueRow {
  inquiryItemId: string;
  inquiryId: string;
  smNumber: string;
  companyName: string;
  productName: string | null;
  /** "Done" once the line's Secondary/Technical Feasibility is stamped. */
  secondaryDone: boolean;
  secVerdict: string | null;
  feasibilityConfirmed: boolean;
  createdAt: Date;
  /** The bucket the register groups + counts by (legacy stamps folded in). */
  bucket: SecondaryFeasibilityStatus;
  /** The raw column value, before the legacy fallback (for debugging/export). */
  storedBucket: SecondaryFeasibilityStatus;
  secondaryAt: Date | null;
  /** True when the line carries a frozen Primary baseline to compare against. */
  hasBaseline: boolean;
  /** Spec fields that drifted from the frozen Primary baseline (0 when none). */
  varianceCount: number;
  /**
   * Display-ready variance rows — attached ONLY for lines that actually differ,
   * so the register can open the report without a second round trip while
   * unchanged lines add nothing to the payload.
   */
  varianceRows: SpecVarianceRow[] | null;
}

/** True when ANY Secondary technical field on the line carries a value. */
function hasSecondaryData(r: {
  outerDiaTol: string | null;
  innerDiaTol: string | null;
  lengthTol: string | null;
  widthTol: string | null;
  thicknessTol: string | null;
  secBlockWt: string | null;
  secNetWt: string | null;
  secMaterialWt: string | null;
  secProcessRoute: string | null;
  secToolingAvailability: string | null;
  secMaterialAvailability: string | null;
  secVerdict: string | null;
  secNotes: string | null;
}): boolean {
  return [
    r.outerDiaTol, r.innerDiaTol, r.lengthTol, r.widthTol, r.thicknessTol,
    r.secBlockWt, r.secNetWt, r.secMaterialWt,
    r.secProcessRoute, r.secToolingAvailability, r.secMaterialAvailability,
    r.secVerdict, r.secNotes,
  ].some((v) => v != null && String(v).trim() !== "");
}

/**
 * The Secondary / Technical Feasibility queue: every product line whose parent
 * enquiry has CLEARED Primary Feasibility. "Cleared primary" = the inquiry's
 * `feasibilityStatus` is post-primary — `draft` (and its deprecated twin
 * `in_review`), `pending_approval`, or `proceed_to_costing` (Feasibility
 * Approved). Lines still `not_started`, `need_info`, or `not_feasible`, and
 * archived enquiries, are excluded — they have not reached this stage.
 * Newest-enquiry first.
 *
 * Each row carries its house bucket and its Primary-baseline variance, so the
 * register can show what is LEFT and where the two feasibilities disagree.
 */
export async function listSecondaryFeasibilityQueue(): Promise<SecondaryFeasibilityQueueRow[]> {
  // `in_review` is the deprecated spelling of `draft` — both count as started.
  const primaryCleared: FeasibilityStatus[] = [
    "draft",
    "in_review",
    "pending_approval",
    "proceed_to_costing",
  ];
  const rows = await db
    .select({
      inquiryItemId: inquiryItems.id,
      inquiryId: inquiryItems.inquiryId,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      custProductName: inquiryItems.custProductName,
      description: inquiryItems.description,
      secondaryDone: inquiryItems.secondaryFeasibilityDone,
      secondaryAt: inquiryItems.secondaryFeasibilityAt,
      storedBucket: inquiryItems.secondaryFeasibilityStatus,
      secVerdict: inquiryItems.secVerdict,
      secNotes: inquiryItems.secNotes,
      outerDiaTol: inquiryItems.outerDiaTol,
      innerDiaTol: inquiryItems.innerDiaTol,
      lengthTol: inquiryItems.lengthTol,
      widthTol: inquiryItems.widthTol,
      thicknessTol: inquiryItems.thicknessTol,
      secBlockWt: inquiryItems.secBlockWt,
      secNetWt: inquiryItems.secNetWt,
      secMaterialWt: inquiryItems.secMaterialWt,
      secProcessRoute: inquiryItems.secProcessRoute,
      secToolingAvailability: inquiryItems.secToolingAvailability,
      secMaterialAvailability: inquiryItems.secMaterialAvailability,
      feasibilityConfirmed: inquiryItems.feasibilityConfirmed,
      baseline: inquiryItems.feasibilityBaseline,
      enquiryDate: inquiries.enquiryDate,
      createdAt: inquiryItems.createdAt,
      sortOrder: inquiryItems.sortOrder,
      ...SPEC_SELECT,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiryItems.inquiryId, inquiries.id))
    .where(
      and(
        eq(inquiries.isArchived, false),
        inArray(inquiries.feasibilityStatus, primaryCleared),
      ),
    )
    .orderBy(desc(inquiries.enquiryDate), desc(inquiries.createdAt), asc(inquiryItems.sortOrder));

  // Resolve the master-option labels the variance report displays — one lookup
  // for the whole queue, over the lines that actually have a baseline.
  const withBaseline = rows.filter((r) => r.baseline != null);
  const idSet = new Set<string>();
  for (const r of withBaseline) {
    for (const id of collectMasterIds(r.baseline as SpecSnapshot, r)) idSet.add(id);
  }
  const labels: Record<string, string> = {};
  if (idSet.size > 0) {
    const opts = await db
      .select({ id: masterOptions.id, name: masterOptions.name })
      .from(masterOptions)
      .where(inArray(masterOptions.id, [...idSet]));
    for (const o of opts) labels[o.id] = o.name;
  }

  return rows.map((r) => {
    const variance =
      r.baseline != null ? computeSpecVariance(r.baseline as SpecSnapshot, r, labels) : null;
    const varianceCount = variance ? countChanged(variance) : 0;
    return {
      inquiryItemId: r.inquiryItemId,
      inquiryId: r.inquiryId,
      smNumber: r.smNumber,
      companyName: r.companyName,
      productName: (r.custProductName ?? r.description ?? "").trim() || null,
      secondaryDone: r.secondaryDone,
      secVerdict: r.secVerdict,
      feasibilityConfirmed: r.feasibilityConfirmed,
      createdAt: r.createdAt,
      bucket: effectiveSecondaryBucket({
        storedStatus: r.storedBucket,
        secondaryDone: r.secondaryDone,
        secVerdict: r.secVerdict,
        hasSecondaryData: hasSecondaryData(r),
      }),
      storedBucket: r.storedBucket,
      secondaryAt: r.secondaryAt ?? null,
      hasBaseline: r.baseline != null,
      varianceCount,
      varianceRows: varianceCount > 0 ? variance : null,
    };
  });
}

/**
 * The Confirmed Feasibility Register: every product line whose feasibility has
 * been confirmed (across all SMs), newest confirmation first. These are the
 * ONLY lines eligible for Costing.
 */
export interface ConfirmedFeasibilityItem {
  inquiryItemId: string;
  inquiryId: string;
  smNumber: string;
  companyName: string;
  custProductName: string | null;
  confirmedByName: string | null;
  confirmedAt: Date | null;
  isLocked: boolean;
}

export async function listConfirmedFeasibilityItems(): Promise<ConfirmedFeasibilityItem[]> {
  const confirmer = alias(employees, "confirmer");
  const rows = await db
    .select({
      inquiryItemId: inquiryItems.id,
      inquiryId: inquiryItems.inquiryId,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      custProductName: inquiryItems.custProductName,
      confirmedByName: confirmer.name,
      confirmedAt: inquiryItems.feasibilityConfirmedAt,
      isLocked: inquiryItems.isDimensionsLocked,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiryItems.inquiryId, inquiries.id))
    .leftJoin(confirmer, eq(confirmer.id, inquiryItems.feasibilityConfirmedById))
    .where(eq(inquiryItems.feasibilityConfirmed, true))
    .orderBy(desc(inquiryItems.feasibilityConfirmedAt));

  return rows.map((r) => ({
    inquiryItemId: r.inquiryItemId,
    inquiryId: r.inquiryId,
    smNumber: r.smNumber,
    companyName: r.companyName,
    custProductName: r.custProductName,
    confirmedByName: r.confirmedByName ?? null,
    confirmedAt: r.confirmedAt ?? null,
    isLocked: r.isLocked,
  }));
}

/**
 * The Confirmed Feasibility Register (inquiry level): every enquiry whose
 * Primary Feasibility landed on `proceed_to_costing` — i.e. Feasibility
 * Confirmed and ready for Costing. Newest-confirmed first (updatedAt proxy — the
 * inquiry has no dedicated approval timestamp). Two queries total (no N+1): the
 * confirmed inquiries, then all their product lines reduced to count + first
 * line description.
 */
/**
 * Aggregated Secondary/Technical Feasibility eligibility across an inquiry's
 * lines: "done" (all lines' Secondary done), "partial" (some), "pending"
 * (none / no lines).
 */
export type SecondaryEligibility = "done" | "partial" | "pending";

export interface ConfirmedFeasibilityRow {
  id: string;
  smNumber: string;
  companyName: string;
  /** First product line's name/description (or null when the SM has no lines). */
  productDesc: string | null;
  productCount: number;
  /** No inquiry-level approval timestamp exists — falls back to updatedAt. */
  confirmedAt: Date;
  /** Aggregated Secondary/Technical Feasibility state across the SM's lines. */
  secondaryEligibility: SecondaryEligibility;
  /** How many lines have Secondary done (for the "2/3" chip subtext). */
  secondaryDoneCount: number;
}

export async function listConfirmedFeasibility(): Promise<ConfirmedFeasibilityRow[]> {
  const rows = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      confirmedAt: inquiries.updatedAt,
    })
    .from(inquiries)
    .where(
      sql`${inquiries.feasibilityStatus} = 'proceed_to_costing' and ${inquiries.isArchived} = false`,
    )
    .orderBy(desc(inquiries.updatedAt));

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          inquiryId: inquiryItems.inquiryId,
          sortOrder: inquiryItems.sortOrder,
          custProductName: inquiryItems.custProductName,
          description: inquiryItems.description,
          secondaryFeasibilityDone: inquiryItems.secondaryFeasibilityDone,
        })
        .from(inquiryItems)
        .where(inArray(inquiryItems.inquiryId, ids))
        .orderBy(asc(inquiryItems.sortOrder))
    : [];

  const countBy = new Map<string, number>();
  const secDoneBy = new Map<string, number>();
  const firstDescBy = new Map<string, string>();
  for (const it of items) {
    countBy.set(it.inquiryId, (countBy.get(it.inquiryId) ?? 0) + 1);
    if (it.secondaryFeasibilityDone) {
      secDoneBy.set(it.inquiryId, (secDoneBy.get(it.inquiryId) ?? 0) + 1);
    }
    if (!firstDescBy.has(it.inquiryId)) {
      const desc = (it.custProductName ?? it.description ?? "").trim();
      if (desc) firstDescBy.set(it.inquiryId, desc);
    }
  }

  return rows.map((r) => {
    const total = countBy.get(r.id) ?? 0;
    const secDone = secDoneBy.get(r.id) ?? 0;
    const secondaryEligibility: SecondaryEligibility =
      total > 0 && secDone >= total ? "done" : secDone > 0 ? "partial" : "pending";
    return {
      id: r.id,
      smNumber: r.smNumber,
      companyName: r.companyName,
      productDesc: firstDescBy.get(r.id) ?? null,
      productCount: total,
      confirmedAt: r.confirmedAt,
      secondaryEligibility,
      secondaryDoneCount: secDone,
    };
  });
}

/**
 * Per-locked-item PF-vs-Costing variance rows for one SM, keyed by inquiry_item
 * id. Only lines that are LOCKED and carry a frozen `feasibility_baseline` get
 * an entry — those are the only lines with a PF baseline to compare against the
 * live/costing-revised spec columns. Master-id fields (tolerance/condition/
 * grades) are resolved to labels in one master_options lookup. The rows are
 * display-ready and feed the shared {@link SpecVarianceRow} report component.
 */
export async function getInquiryVarianceRows(
  inquiryId: string,
): Promise<Record<string, SpecVarianceRow[]>> {
  const items = await db
    .select({
      id: inquiryItems.id,
      isLocked: inquiryItems.isDimensionsLocked,
      baseline: inquiryItems.feasibilityBaseline,
      shape: inquiryItems.shape,
      outerDia: inquiryItems.outerDia,
      innerDia: inquiryItems.innerDia,
      length: inquiryItems.length,
      width: inquiryItems.width,
      thickness: inquiryItems.thickness,
      dimensionUnit: inquiryItems.dimensionUnit,
      gradeCustomer: inquiryItems.gradeCustomer,
      gradeCustomerFacingId: inquiryItems.gradeCustomerFacingId,
      gradeInternalProductionId: inquiryItems.gradeInternalProductionId,
      toleranceId: inquiryItems.toleranceId,
      conditionId: inquiryItems.conditionId,
      quantityNos: inquiryItems.quantityNos,
      quantityUom: inquiryItems.quantityUom,
    })
    .from(inquiryItems)
    .where(eq(inquiryItems.inquiryId, inquiryId));

  const eligible = items.filter((it) => it.isLocked && it.baseline != null);
  if (eligible.length === 0) return {};

  // Collect every master id referenced across all baselines + current rows, then
  // resolve them to names in a single lookup.
  const idSet = new Set<string>();
  for (const it of eligible) {
    const current: SpecSnapshot = it;
    for (const id of collectMasterIds(it.baseline as SpecSnapshot, current)) idSet.add(id);
  }
  const labels: Record<string, string> = {};
  if (idSet.size > 0) {
    const opts = await db
      .select({ id: masterOptions.id, name: masterOptions.name })
      .from(masterOptions)
      .where(inArray(masterOptions.id, [...idSet]));
    for (const o of opts) labels[o.id] = o.name;
  }

  const out: Record<string, SpecVarianceRow[]> = {};
  for (const it of eligible) {
    const current: SpecSnapshot = it;
    out[it.id] = computeSpecVariance(it.baseline as SpecSnapshot, current, labels);
  }
  return out;
}

/**
 * Bucket counts for the Primary Feasibility sidebar.
 *
 * A dedicated GROUP BY rather than `listFeasibilityQueue().length`: the sidebar
 * lives in the module LAYOUT, which renders on every route in the module, while
 * the full queue is only needed by the queue page itself. Counting in SQL keeps
 * the layout cheap on the detail pages.
 */
export async function getFeasibilityBucketCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: inquiries.feasibilityStatus, n: sql<number>`count(*)::int` })
    .from(inquiries)
    .where(eq(inquiries.isArchived, false))
    .groupBy(inquiries.feasibilityStatus);

  const out: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    // Legacy statuses fold onto the bucket that superseded them, exactly as the
    // queue page does — otherwise the sidebar would under-count.
    const bucket = feasibilityBucketOf(r.status);
    out[bucket] = (out[bucket] ?? 0) + r.n;
    total += r.n;
  }
  out.all = total;
  return out;
}

/**
 * Bucket counts for the Secondary Feasibility sidebar. Counts LINES (the stage's
 * unit is the product line, not the enquiry), over the same population the
 * queue lists, so the sidebar and the table can never disagree.
 */
export async function getSecondaryFeasibilityBucketCounts(): Promise<Record<string, number>> {
  const rows = await listSecondaryFeasibilityQueue();
  const out: Record<string, number> = { all: rows.length };
  // `bucket`, not the raw column: legacy stamps fold in there, so the sidebar
  // counts exactly what the register groups by.
  for (const r of rows) out[r.bucket] = (out[r.bucket] ?? 0) + 1;
  // Spec Variance is cross-cutting — a line with drift is ALSO in a bucket.
  out.variance = rows.reduce((n, r) => (r.varianceCount > 0 ? n + 1 : n), 0);
  return out;
}
