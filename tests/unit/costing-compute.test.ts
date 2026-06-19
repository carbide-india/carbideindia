import { describe, it, expect } from "vitest";
import { computeInhouseCosting, computeBoCosting } from "@/lib/costing/compute";

// Helper: round to 4 dp to compare with the sheet's cached values.
const r = (n: number) => Math.round(n * 1e4) / 1e4;

describe("computeInhouseCosting — Case A (perfect tool / previously made)", () => {
  // Sheet inputs (Calculator Inhouse, column D): qty 25, flat tool 12000,
  // pressing 84g, loss 0, RM 17000/kg, VA 30%, shaping 2min @7, machining 10 @25% OH, nego 3%.
  const out = computeInhouseCosting({
    qty: 25, toolFlatCost: 12000, weightUsed: "pressing",
    blockWt: 0, theoreticalWt: 0, pressingWt: 84, lossPct: 0,
    rmPricePerKg: 17000, vaPct: 0.3, vaFloorPerKg: 2000,
    shapingMins: 2, shapingRatePerMin: 7,
    machiningRate: 10, overheadPct: 0.25, negotiationPct: 0.03,
  });
  it("RM/gm 17, VA/gm 5.1, sintered/gm 502.1", () => {
    expect(r(out.rmPerGm)).toBe(17);
    expect(r(out.vaPerGm)).toBe(5.1);
    expect(r(out.sinteredCostPerGm)).toBe(502.1);
  });
  it("sintered price/pc 42176.4, cost-after-machining 42202.9", () => {
    expect(r(out.sinteredPricePerPiece)).toBe(42176.4);
    expect(r(out.costAfterMachining)).toBe(42202.9);
  });
  it("final cost/pc 43468.987, quote value 1086724.675", () => {
    expect(r(out.finalCostPerPiece)).toBe(43468.987);
    expect(r(out.quoteValue)).toBe(1086724.675);
  });
});

describe("computeInhouseCosting — Case B (tooling available)", () => {
  // Calculator Inhouse column F: qty 2, no tool cost, block 13603g, theoretical 4820g,
  // pressing 15310g, loss 15%, RM 19000/kg, VA 25%, shaping 2@7, machining 10 @25%, nego 3%.
  const out = computeInhouseCosting({
    qty: 2, toolFlatCost: 0, weightUsed: "pressing",
    blockWt: 13603, theoreticalWt: 4820, pressingWt: 15310, lossPct: 0.15,
    rmPricePerKg: 19000, vaPct: 0.25, vaFloorPerKg: 2000,
    shapingMins: 2, shapingRatePerMin: 7,
    machiningRate: 10, overheadPct: 0.25, negotiationPct: 0.03,
  });
  it("loss wt 1.5735 (kg), sintered/gm 23.75", () => {
    expect(r(out.lossWtKg)).toBe(1.5735);
    expect(r(out.sinteredCostPerGm)).toBe(23.75);
  });
  it("sintered price/pc 363649.8706 (uses weight + lossWtKg)", () => {
    expect(r(out.sinteredPricePerPiece)).toBe(363649.8706);
  });
  it("final cost/pc 374586.6617, quote value 749173.3235", () => {
    expect(r(out.finalCostPerPiece)).toBe(374586.6617);
    expect(r(out.quoteValue)).toBe(749173.3235);
  });
});

describe("computeBoCosting — vendor model", () => {
  // Final = vendorCost + vendorCost*OH + developmentCost.
  const out = computeBoCosting({ qty: 10, outsourcedVendorCost: 500, vendorOhPct: 0.2, developmentCost: 1000 });
  it("final cost/pc = 500 + 100 + 1000 = 1600; quote value 16000", () => {
    expect(r(out.finalCostPerPiece)).toBe(1600);
    expect(r(out.quoteValue)).toBe(16000);
  });
});
