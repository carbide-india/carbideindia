/**
 * Primary Feasibility v2 — the decision-scorecard dimension catalogue.
 *
 * Pure config (no DB / server-only import) so it is safe on client + server and
 * seeds the admin-editable `feasibility_dimensions` master. Each enquiry scores
 * every ACTIVE dimension 0–100 + risk; a weighted roll-up produces the overall
 * feasibility index that gates costing. Weights are AHP-style defaults (sum 100)
 * and Carbide's engineers tune them in the master against historical jobs.
 */

export interface FeasibilityDimensionDef {
  /** Stable key stored on score rows + the master (never rename). */
  key: string;
  /** Human label shown on the scorecard. */
  label: string;
  /** One-line description of what the dimension judges. */
  hint: string;
  /** AHP-style default weight (the 8 defaults sum to 100). */
  defaultWeight: number;
  /** Display order on the scorecard + master. */
  sortOrder: number;
}

/** The 8 seeded dimensions (weights sum to 100). */
export const FEASIBILITY_DIMENSIONS: FeasibilityDimensionDef[] = [
  { key: "tolerance", label: "Tolerance achievability", hint: "Can our process hold the specified tolerances (Cp/Cpk-informed).", defaultWeight: 22, sortOrder: 1 },
  { key: "geometry", label: "Geometry / Shape (DFM)", hint: "Shape manufacturability, features, aspect ratios.", defaultWeight: 20, sortOrder: 2 },
  { key: "material", label: "Grade / Material supply", hint: "Grade suitability and raw-material availability.", defaultWeight: 16, sortOrder: 3 },
  { key: "tooling", label: "Tooling / Process capability", hint: "Press / tooling / process route availability.", defaultWeight: 14, sortOrder: 4 },
  { key: "quantity", label: "Quantity / Lot economics", hint: "Lot size vs economic / press capacity.", defaultWeight: 10, sortOrder: 5 },
  { key: "surface", label: "Surface / Condition finish", hint: "Achievable surface finish / delivered condition.", defaultWeight: 8, sortOrder: 6 },
  { key: "drawing", label: "Drawing / Spec completeness", hint: "Is the part adequately defined to judge feasibility.", defaultWeight: 6, sortOrder: 7 },
  { key: "export", label: "Export / Regulatory", hint: "Export / compliance clearance.", defaultWeight: 4, sortOrder: 8 },
];

/** Fast lookup of a dimension def by key. */
export const FEASIBILITY_DIMENSION_BY_KEY: Record<string, FeasibilityDimensionDef> =
  Object.fromEntries(FEASIBILITY_DIMENSIONS.map((d) => [d.key, d]));

/**
 * Score → per-dimension verdict bands (Stephen Few's rule: a score always
 * carries its threshold + state, never a bare number).
 *   ≥75 Feasible · 55–74 Feasible-with-deviation · <55 Not-feasible.
 */
export const FEAS_SCORE_BANDS = { feasible: 75, deviation: 55 } as const;

/**
 * Overall-index verdict thresholds (admin-tunable defaults). An index at/above
 * `feasible` with risk ≤ medium and no blocker → Feasible; at/above `deviation`
 * → Feasible-with-deviation; below → Not-feasible.
 */
export const FEAS_INDEX_THRESHOLDS = { feasible: 75, deviation: 55 } as const;

/**
 * Cpk → tolerance-dimension helper band (guidance shown on the Tolerance row):
 * <1.0 fail · 1.0–1.33 marginal · ≥1.33 good. Maps to a suggested score + risk.
 */
export function cpkBand(cpk: number): { band: "fail" | "marginal" | "good"; suggestedScore: number } {
  if (cpk < 1.0) return { band: "fail", suggestedScore: 40 };
  if (cpk < 1.33) return { band: "marginal", suggestedScore: 65 };
  return { band: "good", suggestedScore: 90 };
}
