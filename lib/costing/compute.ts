// Re-export the pure BO vendor-comparison engine so callers can import the whole
// costing math surface from one module (`@/lib/costing/compute`).
export {
  vendorLandedCost,
  compareVendors,
  type VendorQuoteLike,
  type VendorComparison,
  type VendorRanks,
  type CriterionRank,
} from "@/lib/costing/compare";

export interface InhouseInput {
  qty: number;
  toolFlatCost?: number;        // folded as toolFlatCost/qty into sintered/gm (sheet E17)
  weightUsed: "pressing" | "theoretical" | "block";
  blockWt?: number; theoreticalWt?: number; pressingWt?: number;  // grams
  lossPct: number;              // 0..0.20
  rmPricePerKg: number;
  vaPct: number;                // e.g. 0.3
  vaFloorPerKg?: number;        // VA/kg = max(rm*vaPct, vaFloorPerKg); default 2000
  shapingMins: number; shapingRatePerMin: number;
  machiningRate: number; overheadPct: number;
  negotiationPct: number;
}
export interface InhouseOutput {
  weightUsedGms: number; lossWtKg: number;
  rmPerGm: number; vaPerGm: number; toolCostFolded: number;
  sinteredCostPerGm: number; sinteredPricePerPiece: number;
  shapingCostPerPiece: number; machiningCostPerPiece: number;
  costAfterMachining: number; negotiationAmount: number;
  finalCostPerPiece: number; quoteValue: number;
}
const num = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function computeInhouseCosting(i: InhouseInput): InhouseOutput {
  const weightUsedGms =
    i.weightUsed === "pressing" ? num(i.pressingWt)
    : i.weightUsed === "theoretical" ? num(i.theoreticalWt)
    : num(i.blockWt);
  // Loss weight (kg): lossPct * (max(block, pressing) - theoretical) / 1000  [sheet Notes R52 / G25]
  const lossBase = Math.max(num(i.blockWt), num(i.pressingWt)) - num(i.theoreticalWt);
  const lossWtKg = num(i.lossPct) * lossBase / 1000;
  const rmPerGm = i.rmPricePerKg / 1000;
  const vaPerKg = Math.max(i.rmPricePerKg * i.vaPct, num(i.vaFloorPerKg));
  const vaPerGm = vaPerKg / 1000;
  const toolCostFolded = i.qty > 0 ? num(i.toolFlatCost) / i.qty : 0;   // sheet E17 = D16/D4
  const sinteredCostPerGm = rmPerGm + vaPerGm + toolCostFolded;          // E30
  // E31 (Case A): C * pressing; Case B: C * (pressing + lossWtKg). Unified: C * (weightUsed + lossWtKg).
  const sinteredPricePerPiece = sinteredCostPerGm * (weightUsedGms + lossWtKg);
  const shapingCostPerPiece = num(i.shapingMins) * num(i.shapingRatePerMin);  // E35
  const sinteredPlusShaping = sinteredPricePerPiece + shapingCostPerPiece;     // E36
  const machiningCostPerPiece = i.machiningRate + i.machiningRate * i.overheadPct;  // E44
  const costAfterMachining = machiningCostPerPiece + sinteredPlusShaping;      // E45
  const negotiationAmount = costAfterMachining * i.negotiationPct;             // E46
  const finalCostPerPiece = costAfterMachining + negotiationAmount;            // E47
  const quoteValue = finalCostPerPiece * i.qty;                               // E48
  return { weightUsedGms, lossWtKg, rmPerGm, vaPerGm, toolCostFolded, sinteredCostPerGm,
    sinteredPricePerPiece, shapingCostPerPiece, machiningCostPerPiece, costAfterMachining,
    negotiationAmount, finalCostPerPiece, quoteValue };
}

export interface BoInput { qty: number; outsourcedVendorCost: number; vendorOhPct: number; developmentCost: number; }
export interface BoOutput { finalCostPerPiece: number; quoteValue: number; }
export function computeBoCosting(i: BoInput): BoOutput {
  const finalCostPerPiece = i.outsourcedVendorCost + i.outsourcedVendorCost * i.vendorOhPct + i.developmentCost;
  return { finalCostPerPiece, quoteValue: finalCostPerPiece * i.qty };
}
