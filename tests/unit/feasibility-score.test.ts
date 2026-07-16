import { describe, it, expect } from "vitest";
import {
  computeFeasibility,
  verdictForScore,
  isVerdictCostable,
  type DimensionScore,
  type FeasRisk,
} from "@/lib/feasibility/score";
import { FEASIBILITY_DIMENSIONS } from "@/lib/feasibility/dimensions";

/**
 * Build a full 8-dimension scorecard from the seeded defaults (weights sum 100),
 * applying a uniform score/risk and optional per-key overrides.
 */
function buildDims(
  uniform: { score: number | null; risk: FeasRisk | null; isCritical?: boolean },
  overrides: Record<string, Partial<DimensionScore>> = {},
): DimensionScore[] {
  return FEASIBILITY_DIMENSIONS.map((d) => ({
    key: d.key,
    weight: d.defaultWeight,
    score: uniform.score,
    risk: uniform.risk,
    isCritical: uniform.isCritical ?? false,
    ...overrides[d.key],
  }));
}

describe("computeFeasibility", () => {
  it("(a) all-high scores → feasible with weighted index ≈ score", () => {
    const r = computeFeasibility(buildDims({ score: 90, risk: "low" }));
    // Every dimension is 90, so the weighted average is exactly 90.
    expect(r.index).toBe(90);
    expect(r.overallVerdict).toBe("feasible");
    expect(r.overallRisk).toBe("low");
    expect(r.blockerCount).toBe(0);
    expect(r.hasUnscored).toBe(false);
  });

  it("computes a genuinely weighted index (heavier dims dominate)", () => {
    // tolerance(22) high, everything else low → index tilts up but stays mid.
    const r = computeFeasibility(
      buildDims(
        { score: 50, risk: "low" },
        { tolerance: { score: 100 } },
      ),
    );
    // Σ = 100*22 + 50*78 = 2200 + 3900 = 6100; /100 = 61.
    expect(r.index).toBe(61);
  });

  it("(b) mid-band scores → feasible_with_deviation", () => {
    const r = computeFeasibility(buildDims({ score: 65, risk: "low" }));
    expect(r.index).toBe(65);
    expect(r.overallVerdict).toBe("feasible_with_deviation");
    expect(r.blockerCount).toBe(0);
  });

  it("(b') high index but High overall risk → feasible_with_deviation (not feasible)", () => {
    // ≥75 index but two high-risk dims escalate overall risk to High.
    const r = computeFeasibility(
      buildDims(
        { score: 90, risk: "low" },
        { geometry: { risk: "high" }, material: { risk: "high" } },
      ),
    );
    expect(r.index).toBeGreaterThanOrEqual(75);
    expect(r.overallRisk).toBe("high");
    // None are critical, so no blocker — but High risk blocks a clean "feasible".
    expect(r.blockerCount).toBe(0);
    expect(r.overallVerdict).toBe("feasible_with_deviation");
  });

  it("(c) an unscored dimension → need_info", () => {
    const r = computeFeasibility(
      buildDims({ score: 90, risk: "low" }, { export: { score: null, risk: null } }),
    );
    expect(r.hasUnscored).toBe(true);
    expect(r.overallVerdict).toBe("need_info");
    expect(r.perDimensionVerdict.export).toBe("need_info");
  });

  it("index is computed only over scored dimensions", () => {
    // Only tolerance scored (90), rest unscored → index over the scored subset = 90.
    const r = computeFeasibility(
      buildDims(
        { score: null, risk: null },
        { tolerance: { score: 90, risk: "low" } },
      ),
    );
    expect(r.index).toBe(90);
    expect(r.hasUnscored).toBe(true);
    expect(r.overallVerdict).toBe("need_info");
  });

  it("(d) index < 55 → not_feasible", () => {
    const r = computeFeasibility(buildDims({ score: 40, risk: "low" }));
    expect(r.index).toBe(40);
    expect(r.overallVerdict).toBe("not_feasible");
  });

  it("(e) a Critical dimension that is Not-feasible vetoes to not_feasible despite a high index", () => {
    // 7 dims at 100, the low-weight export(4) critical + not-feasible.
    const r = computeFeasibility(
      buildDims(
        { score: 100, risk: "low" },
        { export: { score: 20, risk: "low", isCritical: true } },
      ),
    );
    // Σ = 100*96 + 20*4 = 9600 + 80 = 9680; /100 = 96.8 → index high.
    expect(r.index).toBeGreaterThanOrEqual(75);
    expect(r.perDimensionVerdict.export).toBe("not_feasible");
    expect(r.blockerCount).toBeGreaterThanOrEqual(1);
    expect(r.overallVerdict).toBe("not_feasible");
  });

  it("(e') a Critical dimension that is High-risk vetoes to not_feasible despite a high index", () => {
    // Critical dim scores feasible (90) but carries High risk → blocker.
    const r = computeFeasibility(
      buildDims(
        { score: 95, risk: "low" },
        { tolerance: { score: 90, risk: "high", isCritical: true } },
      ),
    );
    expect(r.index).toBeGreaterThanOrEqual(75);
    expect(r.perDimensionVerdict.tolerance).toBe("feasible");
    expect(r.blockerCount).toBeGreaterThanOrEqual(1);
    expect(r.overallVerdict).toBe("not_feasible");
  });

  it("(f) ≥2 high-risk dimensions → overallRisk high", () => {
    const r = computeFeasibility(
      buildDims(
        { score: 80, risk: "low" },
        { tolerance: { risk: "high" }, geometry: { risk: "high" } },
      ),
    );
    expect(r.overallRisk).toBe("high");
  });

  it("a single high-risk dimension only raises overall risk to that dimension's level", () => {
    const r = computeFeasibility(
      buildDims({ score: 80, risk: "low" }, { tolerance: { risk: "high" } }),
    );
    // One High is worst → overall High (worst-of, not escalation), but not via the ≥2 rule.
    expect(r.overallRisk).toBe("high");
  });

  it("overall risk is the worst dimension risk (medium beats low)", () => {
    const r = computeFeasibility(
      buildDims({ score: 80, risk: "low" }, { tolerance: { risk: "medium" } }),
    );
    expect(r.overallRisk).toBe("medium");
  });

  it("empty scorecard → zero index, no unscored, feasible-by-vacuous-index guard", () => {
    const r = computeFeasibility([]);
    expect(r.index).toBe(0);
    expect(r.hasUnscored).toBe(false);
    expect(r.blockerCount).toBe(0);
    // index 0 < 55 → not_feasible.
    expect(r.overallVerdict).toBe("not_feasible");
  });
});

describe("verdictForScore band boundaries", () => {
  it("null → need_info", () => {
    expect(verdictForScore(null)).toBe("need_info");
  });
  it("75 is the feasible boundary (inclusive)", () => {
    expect(verdictForScore(75)).toBe("feasible");
    expect(verdictForScore(74)).toBe("feasible_with_deviation");
  });
  it("55 is the deviation boundary (inclusive)", () => {
    expect(verdictForScore(55)).toBe("feasible_with_deviation");
    expect(verdictForScore(54)).toBe("not_feasible");
  });
  it("100 → feasible, 0 → not_feasible", () => {
    expect(verdictForScore(100)).toBe("feasible");
    expect(verdictForScore(0)).toBe("not_feasible");
  });
});

describe("isVerdictCostable", () => {
  it("feasible and feasible_with_deviation are costable", () => {
    expect(isVerdictCostable("feasible")).toBe(true);
    expect(isVerdictCostable("feasible_with_deviation")).toBe(true);
  });
  it("need_info and not_feasible are not costable", () => {
    expect(isVerdictCostable("need_info")).toBe(false);
    expect(isVerdictCostable("not_feasible")).toBe(false);
  });
  it("null / undefined are not costable", () => {
    expect(isVerdictCostable(null)).toBe(false);
    expect(isVerdictCostable(undefined)).toBe(false);
  });
});
