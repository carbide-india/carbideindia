import { describe, expect, it } from "vitest";
import {
  clampLossPct,
  computeManufacturingCost,
  type ManufacturingCostInput,
} from "@/lib/costing/mfg-engine";

// Golden worked example — Costing Master sheet "Calculator BO" tab (Mfd path),
// spec §6, verified to the rupee.
const GOLDEN: ManufacturingCostInput = {
  qty: 25,
  method: 1, // previously made → pressing weight
  pressingWt: 84,
  lossPct: 0,
  rmPerKg: 17000,
  vaPct: 0.3,
  shapingRatePerMin: 7,
  shapingMins: 2,
  machiningRate: 10,
  machiningMins: 1,
  overheadPct: 0.25,
  negotiationPct: 0.03,
};

describe("computeManufacturingCost — golden example (spec §6)", () => {
  const r = computeManufacturingCost(GOLDEN);

  it("total weight = 84 × 25 = 2100 gms = 2.10 kg", () => {
    expect(r.totalWtGms).toBeCloseTo(2100, 6);
    expect(r.totalWtKg).toBeCloseTo(2.1, 6);
  });

  it("no loss when lossPct is 0", () => {
    expect(r.lossWtGms).toBe(0);
    expect(r.lossWtKg).toBe(0);
    expect(r.chosenWeight).toBeCloseTo(84, 6);
  });

  it("RM/gm = 17.00", () => {
    expect(r.rmPerGm).toBeCloseTo(17.0, 6);
  });

  it("VA/gm = 5.10 (30% of RM beats the 2000/kg floor)", () => {
    expect(r.vaPerKg).toBeCloseTo(5100, 6);
    expect(r.vaPerGm).toBeCloseTo(5.1, 6);
  });

  it("sintered cost/gm (Ratio) = 22.10", () => {
    expect(r.sinteredCostPerGm).toBeCloseTo(22.1, 6);
  });

  it("sintered price/piece = 84 × 22.10 = 1856.40", () => {
    expect(r.sinteredPricePerPiece).toBeCloseTo(1856.4, 4);
  });

  it("shaping = 7 × 2 = 14.00 → sintered+shaping = 1870.40", () => {
    expect(r.shapingCostPerPiece).toBeCloseTo(14.0, 6);
    expect(r.sinteredPlusShaping).toBeCloseTo(1870.4, 4);
  });

  it("machining with overhead = 10 × (1 + 0.25) = 12.50", () => {
    expect(r.machiningCostPerPiece).toBeCloseTo(10.0, 6);
    expect(r.machiningWithOverhead).toBeCloseTo(12.5, 6);
  });

  it("cost after machining = 1870.40 + 12.50 = 1882.90", () => {
    expect(r.costAfterMachining).toBeCloseTo(1882.9, 4);
  });

  it("negotiation 3% ≈ 56.49", () => {
    expect(r.negotiationAmount).toBeCloseTo(56.487, 3);
    expect(r.negotiationAmount).toBeGreaterThan(56.49 - 0.5);
    expect(r.negotiationAmount).toBeLessThan(56.49 + 0.5);
  });

  it("quote price/piece ≈ 1939.39", () => {
    expect(r.quotePricePerPiece).toBeGreaterThan(1939.39 - 0.5);
    expect(r.quotePricePerPiece).toBeLessThan(1939.39 + 0.5);
  });

  it("quote value = quotePrice × 25 ≈ 48484.7 (±0.5)", () => {
    // 1939.387 × 25 = 48484.675
    expect(r.quoteValue).toBeGreaterThan(48484.75 - 0.5);
    expect(r.quoteValue).toBeLessThan(48484.75 + 0.5);
  });
});

describe("clampLossPct — loss% clamped to 10–20% band (spec §1)", () => {
  it("passes 0 through as no-loss", () => {
    expect(clampLossPct(0)).toBe(0);
    expect(clampLossPct(undefined)).toBe(0);
    expect(clampLossPct(-0.5)).toBe(0);
  });
  it("clamps below-band up to 10%", () => {
    expect(clampLossPct(0.05)).toBeCloseTo(0.1, 6);
  });
  it("clamps above-band down to 20%", () => {
    expect(clampLossPct(0.3)).toBeCloseTo(0.2, 6);
  });
  it("passes an in-band value through unchanged", () => {
    expect(clampLossPct(0.15)).toBeCloseTo(0.15, 6);
  });
});

describe("computeManufacturingCost — loss clamping affects the result", () => {
  it("a 5% loss request is applied as 10% (clamped)", () => {
    // block tool: lossBase = blockWt − theoreticalWt = 100 − 80 = 20 gms
    const r = computeManufacturingCost({
      qty: 1,
      method: 3,
      toolType: "block",
      blockWt: 100,
      theoreticalWt: 80,
      lossPct: 0.05, // below band → clamped to 0.10
      rmPerKg: 10000,
      vaPct: 0.3,
    });
    expect(r.effectiveLossPct).toBeCloseTo(0.1, 6);
    expect(r.lossBaseGms).toBeCloseTo(20, 6);
    expect(r.lossWtGms).toBeCloseTo(2.0, 6); // 20 × 0.10
  });

  it("a 30% loss request is applied as 20% (clamped)", () => {
    const r = computeManufacturingCost({
      qty: 1,
      method: 3,
      toolType: "block",
      blockWt: 100,
      theoreticalWt: 80,
      lossPct: 0.3, // above band → clamped to 0.20
      rmPerKg: 10000,
      vaPct: 0.3,
    });
    expect(r.effectiveLossPct).toBeCloseTo(0.2, 6);
    expect(r.lossWtGms).toBeCloseTo(4.0, 6); // 20 × 0.20
  });
});

describe("computeManufacturingCost — VA floor (spec §4)", () => {
  it("2000/kg floor wins when x% of RM is lower", () => {
    // RM 8000, VA 20% → 1600/kg < 2000/kg floor.
    const r = computeManufacturingCost({
      qty: 1,
      method: 1,
      pressingWt: 100,
      lossPct: 0,
      rmPerKg: 8000,
      vaPct: 0.2,
    });
    expect(r.vaPerKg).toBeCloseTo(2000, 6);
    expect(r.vaPerGm).toBeCloseTo(2.0, 6);
  });

  it("x% of RM wins when it beats the floor", () => {
    // RM 21000, VA 20% → 4200/kg > 2000/kg floor.
    const r = computeManufacturingCost({
      qty: 1,
      method: 1,
      pressingWt: 100,
      lossPct: 0,
      rmPerKg: 21000,
      vaPct: 0.2,
    });
    expect(r.vaPerKg).toBeCloseTo(4200, 6);
  });
});

describe("computeManufacturingCost — block-tool loss base (spec §2)", () => {
  it("block-tool loss base = blockWt − theoreticalWt", () => {
    const blockWt = 120;
    const theoreticalWt = 95;
    const r = computeManufacturingCost({
      qty: 1,
      method: 3,
      toolType: "block",
      blockWt,
      theoreticalWt,
      lossPct: 0.15,
      rmPerKg: 10000,
      vaPct: 0.3,
    });
    expect(r.lossBaseGms).toBeCloseTo(blockWt - theoreticalWt, 6); // 25
    expect(r.lossWtGms).toBeCloseTo((blockWt - theoreticalWt) * 0.15, 6); // 3.75
  });

  it("perfect tool → zero loss regardless of loss%", () => {
    const r = computeManufacturingCost({
      qty: 1,
      method: 1,
      toolType: "perfect",
      pressingWt: 84,
      blockWt: 200,
      theoreticalWt: 60,
      lossPct: 0.15,
      rmPerKg: 10000,
      vaPct: 0.3,
    });
    expect(r.lossBaseGms).toBe(0);
    expect(r.lossWtGms).toBe(0);
  });
});

describe("computeManufacturingCost — guards", () => {
  it("survives missing inputs (all zero-ish, no NaN/Infinity)", () => {
    const r = computeManufacturingCost({ qty: 0, method: 1, rmPerKg: 0, vaPct: 0 });
    for (const v of Object.values(r)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // VA floor still applies even with zero RM.
    expect(r.vaPerKg).toBeCloseTo(2000, 6);
    expect(r.quoteValue).toBe(0);
  });

  it("defaults machining minutes to 1 when omitted", () => {
    const r = computeManufacturingCost({
      qty: 1,
      method: 1,
      pressingWt: 10,
      lossPct: 0,
      rmPerKg: 1000,
      vaPct: 0,
      machiningRate: 40,
      // machiningMins omitted → 1
    });
    expect(r.machiningCostPerPiece).toBeCloseTo(40, 6);
  });
});
