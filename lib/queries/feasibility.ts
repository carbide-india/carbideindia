import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  inquiries,
  inquiryItems,
  inquiryFeasibility,
  feasibilityDimensions,
  inquiryFeasibilityScores,
  employees,
  type InquiryFeasibility,
  type InquiryItemFeasibility,
} from "@/db/schema";
import { FEASIBILITY_DIMENSIONS } from "@/lib/feasibility/dimensions";
import type {
  FeasibilityStatus,
  FeasCheckVerdict,
  FeasRisk,
  FeasPriority,
} from "@/db/enums";
import type { InquiryPriority } from "@/db/enums";
import {
  getInquiryWorkspaceHeader,
  getInquiryProducts,
  getInquiryItemFeasibility,
  type InquiryWorkspaceHeader,
  type InquiryProductCard,
} from "@/lib/queries/sm-workspace";

/**
 * Primary-Feasibility module queries. The queue lists every live enquiry with
 * its feasibility review state (LEFT joined — an enquiry with no review row is
 * simply `not_started`). The review loader composes the existing SM header +
 * product cards + per-product feasibility with the new SM-level record.
 */

export interface FeasibilityQueueItem {
  id: string;
  smNumber: string;
  companyName: string;
  enquiryDate: Date;
  createdAt: Date;
  priority: InquiryPriority;
  feasPriority: FeasPriority | null;
  status: FeasibilityStatus;
  overallVerdict: FeasCheckVerdict | null;
  riskRating: FeasRisk | null;
  /** v2 weighted feasibility index 0–100 (null when never scored). */
  overallScore: number | null;
  /** v2 count of critical veto blockers driving Not-feasible. */
  blockerCount: number;
  engineerName: string | null;
  productCount: number;
  submittedAt: Date | null;
  approvedAt: Date | null;
}

/**
 * The feasibility queue: every live enquiry with its review state (LEFT joined —
 * an enquiry with no review row is `not_started`). Carries the v2 scorecard
 * roll-up (index, verdict, risk, blockerCount) so the queue can sort/KPI on it.
 */
export async function listFeasibilityQueue(): Promise<FeasibilityQueueItem[]> {
  const rows = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      enquiryDate: inquiries.enquiryDate,
      createdAt: inquiries.createdAt,
      priority: inquiries.priority,
      feasPriority: inquiryFeasibility.priority,
      status: inquiryFeasibility.status,
      overallVerdict: inquiryFeasibility.overallVerdict,
      riskRating: inquiryFeasibility.riskRating,
      overallScore: inquiryFeasibility.overallScore,
      blockerCount: inquiryFeasibility.blockerCount,
      engineerName: employees.name,
      submittedAt: inquiryFeasibility.submittedAt,
      approvedAt: inquiryFeasibility.approvedAt,
    })
    .from(inquiries)
    .leftJoin(inquiryFeasibility, eq(inquiryFeasibility.inquiryId, inquiries.id))
    .leftJoin(employees, eq(employees.id, inquiryFeasibility.engineerId))
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
    status: (r.status ?? "not_started") as FeasibilityStatus,
    overallVerdict: r.overallVerdict ?? null,
    riskRating: r.riskRating ?? null,
    overallScore: r.overallScore != null ? Number(r.overallScore) : null,
    blockerCount: r.blockerCount ?? 0,
    engineerName: r.engineerName ?? null,
    productCount: countBy.get(r.id) ?? 0,
    submittedAt: r.submittedAt ?? null,
    approvedAt: r.approvedAt ?? null,
  }));
}

/** @deprecated Alias of {@link listFeasibilityQueue} kept for existing callers. */
export const listFeasibilityReviews = listFeasibilityQueue;

export interface FeasibilityReview {
  header: InquiryWorkspaceHeader;
  products: InquiryProductCard[];
  itemFeasibility: Record<string, InquiryItemFeasibility>;
  review: InquiryFeasibility | null;
}

/** Everything the review workspace needs for one enquiry (null if not found). */
export async function getFeasibilityReview(
  inquiryId: string,
): Promise<FeasibilityReview | null> {
  const header = await getInquiryWorkspaceHeader(inquiryId);
  if (!header) return null;

  const [products, itemFeasibility, reviewRows] = await Promise.all([
    getInquiryProducts(inquiryId),
    getInquiryItemFeasibility(inquiryId),
    db
      .select()
      .from(inquiryFeasibility)
      .where(eq(inquiryFeasibility.inquiryId, inquiryId))
      .limit(1),
  ]);

  return { header, products, itemFeasibility, review: reviewRows[0] ?? null };
}

// ── v2 decision-scorecard ────────────────────────────────────────────────────

export interface FeasibilityDimensionRow {
  key: string;
  label: string;
  hint: string;
  weight: number;
  sortOrder: number;
}

/**
 * The active feasibility dimensions (admin-editable master), ordered by sort.
 * Falls back to the built-in `FEASIBILITY_DIMENSIONS` defaults when the master
 * table has not been seeded yet, so the scorecard always has dimensions to show.
 */
export async function listFeasibilityDimensions(): Promise<FeasibilityDimensionRow[]> {
  const rows = await db
    .select({
      key: feasibilityDimensions.key,
      label: feasibilityDimensions.label,
      hint: feasibilityDimensions.hint,
      weight: feasibilityDimensions.weight,
      sortOrder: feasibilityDimensions.sortOrder,
    })
    .from(feasibilityDimensions)
    .where(eq(feasibilityDimensions.isActive, true))
    .orderBy(feasibilityDimensions.sortOrder);

  if (rows.length === 0) {
    return FEASIBILITY_DIMENSIONS.map((d) => ({
      key: d.key,
      label: d.label,
      hint: d.hint,
      weight: d.defaultWeight,
      sortOrder: d.sortOrder,
    }));
  }

  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    hint: r.hint ?? "",
    weight: Number(r.weight),
    sortOrder: r.sortOrder,
  }));
}

export interface FeasibilityScorecardScore {
  score: number | null;
  risk: FeasRisk | null;
  isCritical: boolean;
  verdict: FeasCheckVerdict | null;
  note: string | null;
  weightSnapshot: number;
}

export interface FeasibilityScorecard {
  review: InquiryFeasibility | null;
  dimensions: FeasibilityDimensionRow[];
  scores: Record<string, FeasibilityScorecardScore>;
}

/**
 * Everything the v2 scorecard workspace needs for one enquiry: the SM-level
 * review record, the active dimension catalogue, and the saved per-dimension
 * scores keyed by `dimensionKey`.
 */
export async function getFeasibilityScorecard(
  inquiryId: string,
): Promise<FeasibilityScorecard> {
  const [dimensions, reviewRows, scoreRows] = await Promise.all([
    listFeasibilityDimensions(),
    db
      .select()
      .from(inquiryFeasibility)
      .where(eq(inquiryFeasibility.inquiryId, inquiryId))
      .limit(1),
    db
      .select()
      .from(inquiryFeasibilityScores)
      .where(eq(inquiryFeasibilityScores.inquiryId, inquiryId)),
  ]);

  const scores: Record<string, FeasibilityScorecardScore> = {};
  for (const s of scoreRows) {
    scores[s.dimensionKey] = {
      score: s.score ?? null,
      risk: s.risk ?? null,
      isCritical: s.isCritical,
      verdict: s.verdict ?? null,
      note: s.note ?? null,
      weightSnapshot: Number(s.weightSnapshot),
    };
  }

  return { review: reviewRows[0] ?? null, dimensions, scores };
}

/** The feasibility status for one enquiry (costing gate reads this). */
export async function getFeasibilityStatus(
  inquiryId: string,
): Promise<FeasibilityStatus> {
  const [row] = await db
    .select({ status: inquiryFeasibility.status })
    .from(inquiryFeasibility)
    .where(eq(inquiryFeasibility.inquiryId, inquiryId))
    .limit(1);
  return (row?.status ?? "not_started") as FeasibilityStatus;
}

/** True once an admin has approved the review (costing hard-gate helper). */
export async function isFeasibilityApproved(inquiryId: string): Promise<boolean> {
  const status = await getFeasibilityStatus(inquiryId);
  return status === "proceed_to_costing";
}

/** Bulk statuses for a set of inquiries (queue defaults absent rows to not_started). */
export async function getFeasibilityStatuses(
  inquiryIds: string[],
): Promise<Map<string, FeasibilityStatus>> {
  if (inquiryIds.length === 0) return new Map();
  const rows = await db
    .select({ inquiryId: inquiryFeasibility.inquiryId, status: inquiryFeasibility.status })
    .from(inquiryFeasibility)
    .where(and(inArray(inquiryFeasibility.inquiryId, inquiryIds)));
  return new Map(rows.map((r) => [r.inquiryId, r.status as FeasibilityStatus]));
}
