import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, employees, masterOptions } from "@/db/schema";
import type {
  FeasibilityStatus,
  FeasPriority,
  InquiryPriority,
  RecheckState,
} from "@/db/enums";
import {
  computeSpecVariance,
  collectMasterIds,
  type SpecSnapshot,
  type SpecVarianceRow,
} from "@/lib/feasibility/spec-variance";

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
}

const notDone = (v: RecheckState | null | undefined) => v != null && v !== "not_done";

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

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ inquiryId: inquiryItems.inquiryId, n: sql<number>`count(*)::int` })
        .from(inquiryItems)
        .where(inArray(inquiryItems.inquiryId, ids))
        .groupBy(inquiryItems.inquiryId)
    : [];
  const countBy = new Map(counts.map((c) => [c.inquiryId, c.n]));

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
}

/** Lock state for every product line on one SM, ordered by the line sort order. */
export async function listItemLockStates(inquiryId: string): Promise<ItemLockState[]> {
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
    })
    .from(inquiryItems)
    .leftJoin(employees, eq(employees.id, inquiryItems.lockedById))
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
  }));
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
