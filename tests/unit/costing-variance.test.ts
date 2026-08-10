import { describe, expect, it } from "vitest";
import {
  computeCostingVariance,
  countCostingVarianceChanges,
  type CostingVarianceInput,
} from "@/lib/costing/costing-variance";

/** Costing 1 — a minimal but realistic in-house sheet. */
const REV1: CostingVarianceInput = {
  costingType: "inhouse",
  qty: "25",
  blockWtPerPiece: "84.00",
  directWtPerPiece: "70",
  totalWtOrderKg: "2.10",
  lossPct: "0.15",
  rmPricePerKg: "17000",
  overheadPct: "0.25",
  finalCostPerPiece: "1234.5600",
  quoteValue: "30864.00",
  paymentTerms: "30 days",
};

describe("computeCostingVariance", () => {
  it("flags only the fields that actually moved", () => {
    const rev2: CostingVarianceInput = { ...REV1, blockWtPerPiece: "88", finalCostPerPiece: "1300" };
    const rows = computeCostingVariance(REV1, rev2);
    const changed = rows.filter((r) => r.changed).map((r) => r.field);
    expect(changed).toEqual(["blockWtPerPiece", "finalCostPerPiece"]);
    expect(countCostingVarianceChanges(rows)).toBe(2);
  });

  it("treats '84.00' and '84' as the same number, not a change", () => {
    const rows = computeCostingVariance(REV1, { ...REV1, blockWtPerPiece: "84" });
    expect(rows.find((r) => r.field === "blockWtPerPiece")?.changed).toBe(false);
  });

  it("reports the signed delta on numeric fields", () => {
    const rows = computeCostingVariance(REV1, { ...REV1, blockWtPerPiece: "88" });
    expect(rows.find((r) => r.field === "blockWtPerPiece")?.delta).toBeCloseTo(4, 9);
    const down = computeCostingVariance(REV1, { ...REV1, finalCostPerPiece: "1200" });
    expect(down.find((r) => r.field === "finalCostPerPiece")?.delta).toBeCloseTo(-34.56, 6);
  });

  it("renders percents as percents and money to 2dp", () => {
    const rows = computeCostingVariance(REV1, REV1);
    expect(rows.find((r) => r.field === "lossPct")?.feasibilityValue).toBe("15%");
    expect(rows.find((r) => r.field === "finalCostPerPiece")?.costingValue).toBe("1234.56");
  });

  it("resolves the route enum to its human label", () => {
    const rows = computeCostingVariance(REV1, { ...REV1, costingType: "bought_out" });
    const route = rows.find((r) => r.field === "costingType");
    expect(route?.feasibilityValue).toBe("In-house");
    expect(route?.costingValue).toBe("Bought-Out");
    expect(route?.changed).toBe(true);
  });

  it("drops fields that are empty on BOTH sides rather than printing dashes", () => {
    const rows = computeCostingVariance(REV1, REV1);
    expect(rows.some((r) => r.field === "vendorOhPct")).toBe(false);
    expect(rows.some((r) => r.field === "blockWtPerPiece")).toBe(true);
  });

  it("counts a value appearing from nothing as a change", () => {
    const rows = computeCostingVariance(REV1, { ...REV1, developmentCost: "5000" });
    const dev = rows.find((r) => r.field === "developmentCost");
    expect(dev?.feasibilityValue).toBe("—");
    expect(dev?.changed).toBe(true);
    expect(dev?.delta).toBeNull();
  });

  it("treats a missing previous revision as an all-new sheet", () => {
    const rows = computeCostingVariance(null, REV1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.changed)).toBe(true);
  });

  it("compares text fields by trimmed value", () => {
    const rows = computeCostingVariance(REV1, { ...REV1, paymentTerms: "  30 days " });
    expect(rows.find((r) => r.field === "paymentTerms")?.changed).toBe(false);
  });

  it("groups rows so the report can be sectioned", () => {
    const rows = computeCostingVariance(REV1, REV1);
    expect(rows.find((r) => r.field === "blockWtPerPiece")?.group).toBe("Weights");
    expect(rows.find((r) => r.field === "finalCostPerPiece")?.group).toBe("Outputs");
  });
});
