/**
 * Primary Feasibility v2 — the pure scoring engine.
 *
 * No DB / server-only import (mirrors the costing-engine pattern): all the
 * decision math lives here so it is unit-testable and identical on client
 * (live scorecard preview) and server (authoritative recompute on save).
 *
 * Given the per-dimension scores an engineer entered, it computes:
 *   • the weighted feasibility INDEX (0–100),
 *   • each dimension's VERDICT band,
 *   • the OVERALL VERDICT (with blocker/veto logic),
 *   • the OVERALL RISK, and
 *   • the BLOCKER count.
 */

import { FEAS_SCORE_BANDS, FEAS_INDEX_THRESHOLDS } from "./dimensions";

export type FeasRisk = "low" | "medium" | "high";
export type FeasVerdict = "feasible" | "feasible_with_deviation" | "need_info" | "not_feasible";

const RISK_RANK: Record<FeasRisk, number> = { low: 0, medium: 1, high: 2 };

/** One dimension's engineer input. `score` null = not yet scored. */
export interface DimensionScore {
  key: string;
  /** Snapshot of the dimension weight at scoring time (survives later master edits). */
  weight: number;
  /** 0–100, or null when the engineer hasn't scored it yet. */
  score: number | null;
  /** Engineer-set risk for this dimension (null when unscored). */
  risk: FeasRisk | null;
  /** Marked a critical/veto dimension for this enquiry. */
  isCritical: boolean;
}

export interface FeasibilityScoreResult {
  /** Weighted 0–100 index over the SCORED dimensions (0 when none scored). */
  index: number;
  overallVerdict: FeasVerdict;
  overallRisk: FeasRisk;
  /** Count of critical dimensions that are not-feasible or high-risk (veto drivers). */
  blockerCount: number;
  /** Whether any active dimension is still unscored (drives Needs-info). */
  hasUnscored: boolean;
  /** Derived band verdict per dimension key. */
  perDimensionVerdict: Record<string, FeasVerdict>;
}

/** Score band → dimension verdict. `null` score → needs-info. */
export function verdictForScore(score: number | null): FeasVerdict {
  if (score == null) return "need_info";
  if (score >= FEAS_SCORE_BANDS.feasible) return "feasible";
  if (score >= FEAS_SCORE_BANDS.deviation) return "feasible_with_deviation";
  return "not_feasible";
}

function clamp100(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Roll up per-dimension scores into the overall feasibility outcome.
 *
 * Rules (from the v2 spec, grounded in weighted aggregation + AIAG-VDA action
 * priority + an explicit business veto):
 *  - index = Σ(score·weight) / Σ(weight) over SCORED dimensions.
 *  - overall risk = worst dimension risk, escalated to High if ≥2 are High.
 *  - blocker = a Critical dimension that is Not-feasible OR High-risk.
 *  - overall verdict:
 *      • any unscored dimension            → Needs-info
 *      • blocker present OR index < 55     → Not-feasible
 *      • index ≥ 75 and risk ≤ Medium      → Feasible
 *      • otherwise (55–74, or ≥75 w/ High) → Feasible-with-deviation
 */
export function computeFeasibility(dimensions: DimensionScore[]): FeasibilityScoreResult {
  const perDimensionVerdict: Record<string, FeasVerdict> = {};
  for (const d of dimensions) perDimensionVerdict[d.key] = verdictForScore(d.score);

  const scored = dimensions.filter((d) => d.score != null);
  const hasUnscored = scored.length < dimensions.length;

  // Weighted index over scored dimensions.
  const totalWeight = scored.reduce((s, d) => s + (d.weight || 0), 0);
  const index =
    totalWeight > 0
      ? clamp100(scored.reduce((s, d) => s + clamp100(d.score as number) * (d.weight || 0), 0) / totalWeight)
      : 0;

  // Overall risk: worst risk, escalate to High when ≥2 dimensions are High.
  const risks = scored.map((d) => d.risk).filter((r): r is FeasRisk => r != null);
  const highCount = risks.filter((r) => r === "high").length;
  let overallRisk: FeasRisk = "low";
  for (const r of risks) if (RISK_RANK[r] > RISK_RANK[overallRisk]) overallRisk = r;
  if (highCount >= 2) overallRisk = "high";

  // Blocker (veto): a Critical dimension that is Not-feasible or High-risk.
  const blockerCount = dimensions.filter(
    (d) => d.isCritical && (perDimensionVerdict[d.key] === "not_feasible" || d.risk === "high"),
  ).length;

  let overallVerdict: FeasVerdict;
  if (hasUnscored) {
    overallVerdict = "need_info";
  } else if (blockerCount > 0 || index < FEAS_INDEX_THRESHOLDS.deviation) {
    overallVerdict = "not_feasible";
  } else if (index >= FEAS_INDEX_THRESHOLDS.feasible && RISK_RANK[overallRisk] <= RISK_RANK.medium) {
    overallVerdict = "feasible";
  } else {
    overallVerdict = "feasible_with_deviation";
  }

  return {
    index: Math.round(index),
    overallVerdict,
    overallRisk,
    blockerCount,
    hasUnscored,
    perDimensionVerdict,
  };
}

/** Only Feasible / Feasible-with-deviation are eligible for approval → costing. */
export function isVerdictCostable(v: FeasVerdict | null | undefined): boolean {
  return v === "feasible" || v === "feasible_with_deviation";
}
