// Manufacturing (In-House) costing engine — pure, framework-free compute.
//
// Reproduces the client's "Costing Master" Google Sheet, tab "Calculator
// Inhouse" / "Calculator BO" (Mfd path), decoded in
// docs/superpowers/specs/2026-07-30-costing-master-engine-v3.md (§§1-9).
//
// ADDITIVE: this module does NOT touch lib/costing/compute.ts. A later UI phase
// rewires the calculator/saveCosting onto this engine. Everything here is a pure
// function of its input — no I/O, no framework, deterministic.
//
// Units: weights in grams unless a name ends in "Kg"; money in rupees (Rs).
// Full precision is preserved internally; round to 2dp only at display
// boundaries (use `roundMoney`).

/** Which weight the sinter/price basis is taken from (Calculator Inhouse "Select Method", §3). */
export type WeightMethod = 1 | 2 | 3 | 4;

/** Tooling Chart tool type (Notes + Flow Chart, §2) — drives how loss weight is derived. */
export type ToolType = "perfect" | "block" | "big";

export interface ManufacturingCostInput {
  /** Order quantity (pieces). */
  qty: number;
  /**
   * Weight-selection method (§3):
   *   1 — previously made?  → Pressing Wt + Loss Wt
   *   2 — tooling available? → Pressing Wt + Loss Wt
   *   3 — tooling to be made? → Theoretical Wt + Loss Wt
   *   4 — no tooling?        → Theoretical Wt + Loss Wt
   */
  method: WeightMethod;
  /**
   * Tool type (§2) — decides the loss-weight *base*:
   *   perfect → 0 (no loss)
   *   block   → Block Wt − Theoretical Wt
   *   big     → Pressing Wt − Theoretical Wt
   * Omit for the "general" loss base: Block Wt − (method weight).
   */
  toolType?: ToolType;

  /** Weight of the theoretical square/rectangle block the piece is cut from (gms). */
  blockWt?: number;
  /** Product / Direct / Theoretical (AutoCAD) weight (gms). */
  theoreticalWt?: number;
  /** Actual weight measured during pressing (gms). */
  pressingWt?: number;

  /**
   * Loss percentage. Default 15%. When it applies it is clamped to 10%–20%.
   * A value of 0 (or ≤0) means "no loss" and is passed through as 0.
   */
  lossPct?: number;

  /** Raw-material price (Rs/kg) — manual, Alok decides per batch. */
  rmPerKg: number;
  /** Value-addition percentage of RM (e.g. 0.30). Clamp is a UI concern, not enforced here. */
  vaPct: number;
  /** VA floor (Rs/kg). VA/kg = max(vaFloorPerKg, vaPct × rmPerKg). Default 2000. */
  vaFloorPerKg?: number;

  /** Shaping/forming rate (Rs/min). Compulsory when shapingMins > 0. */
  shapingRatePerMin?: number;
  /** Shaping/forming minutes. Default 0. */
  shapingMins?: number;

  /** Decided machining rate (internal or picked vendor). */
  machiningRate?: number;
  /** Machining minutes. Default 1. */
  machiningMins?: number;
  /** Overhead percentage — applied to MACHINING ONLY (§6 locked finding). */
  overheadPct?: number;

  /** Negotiation percentage applied to the running total. */
  negotiationPct?: number;
}

export interface ManufacturingCostOutput {
  // --- weight ---
  /** Base weight selected by method (pressing for 1/2, theoretical for 3/4), gms. */
  baseWeightGms: number;
  /** Loss-weight base (the weight difference before applying loss%), gms, clamped ≥0. */
  lossBaseGms: number;
  /** Effective loss percentage actually applied (0, or clamped to 0.10–0.20). */
  effectiveLossPct: number;
  /** Loss weight per piece (gms). */
  lossWtGms: number;
  /** Loss weight per piece (kg). */
  lossWtKg: number;
  /** Effective per-piece weight fed to sintering = baseWeight + loss (gms). */
  chosenWeight: number;
  /** Total order weight = baseWeight × qty (gms). */
  totalWtGms: number;
  /** Total order weight (kg). */
  totalWtKg: number;

  // --- raw material + value addition (till sintering) ---
  /** RM price per gram = rmPerKg / 1000. */
  rmPerGm: number;
  /** VA per kg = max(vaFloorPerKg, vaPct × rmPerKg). */
  vaPerKg: number;
  /** VA per gram = vaPerKg / 1000. */
  vaPerGm: number;
  /** Sintered cost per gram = "Ratio" = rmPerGm + vaPerGm. */
  sinteredCostPerGm: number;
  /** Sintered price per piece = chosenWeight × sinteredCostPerGm. */
  sinteredPricePerPiece: number;

  // --- shaping / forming ---
  /** Shaping cost per piece = shapingRatePerMin × shapingMins. */
  shapingCostPerPiece: number;
  /** Running total = sinteredPricePerPiece + shapingCostPerPiece. */
  sinteredPlusShaping: number;

  // --- machining (overhead applies here only) ---
  /** Machining cost per piece = machiningRate × machiningMins. */
  machiningCostPerPiece: number;
  /** Machining cost with overhead = machiningCostPerPiece × (1 + overheadPct). */
  machiningWithOverhead: number;
  /** Cost after machining = sinteredPlusShaping + machiningWithOverhead. */
  costAfterMachining: number;

  // --- negotiation + quote ---
  /** Negotiation amount = costAfterMachining × negotiationPct. */
  negotiationAmount: number;
  /** Quote price per piece = costAfterMachining + negotiationAmount. */
  quotePricePerPiece: number;
  /** Quote value = quotePricePerPiece × qty. */
  quoteValue: number;
}

/** Coerce to a finite number; anything else (undefined/NaN/Infinity) → 0. */
const num = (v: number | undefined | null): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** Round a rupee amount to 2 decimals for display. Keep full precision internally. */
export const roundMoney = (v: number): number => Math.round((num(v) + Number.EPSILON) * 100) / 100;

/**
 * Clamp the loss percentage. A value ≤0 is treated as "no loss" and returned as
 * 0; any positive value is clamped into the allowed 10%–20% band (§1).
 */
export function clampLossPct(pct: number | undefined): number {
  const p = num(pct);
  if (p <= 0) return 0;
  return Math.min(0.2, Math.max(0.1, p));
}

/** Base (pre-loss) weight selected by the method (§3). */
function baseWeightForMethod(i: ManufacturingCostInput): number {
  // Methods 1 & 2 → pressing weight; methods 3 & 4 → theoretical weight.
  return i.method === 1 || i.method === 2 ? num(i.pressingWt) : num(i.theoreticalWt);
}

/**
 * Loss-weight base in grams (before applying loss%), per tool type (§2).
 * Clamped to ≥0 so a missing block weight (or a nonsensical negative difference)
 * yields no loss — "If Block Weight is empty → there cannot be loss weight."
 */
function lossBaseForTool(i: ManufacturingCostInput, baseWeightGms: number): number {
  let raw: number;
  switch (i.toolType) {
    case "perfect":
      raw = 0;
      break;
    case "block":
      raw = num(i.blockWt) - num(i.theoreticalWt);
      break;
    case "big":
      raw = num(i.pressingWt) - num(i.theoreticalWt);
      break;
    default:
      // General form (§1): Block Wt − (the method weight, i.e. pressing/theoretical).
      raw = num(i.blockWt) - baseWeightGms;
      break;
  }
  return Math.max(0, raw);
}

/**
 * Compute the full manufacturing (In-House) cost breakdown for one line item.
 * Pure: identical input → identical output. All money kept at full precision.
 */
export function computeManufacturingCost(input: ManufacturingCostInput): ManufacturingCostOutput {
  const qty = num(input.qty);

  // --- weight selection + loss (§§2-3) ---
  const baseWeightGms = baseWeightForMethod(input);
  const effectiveLossPct = clampLossPct(input.lossPct);
  const lossBaseGms = lossBaseForTool(input, baseWeightGms);
  const lossWtGms = lossBaseGms * effectiveLossPct;
  const lossWtKg = lossWtGms / 1000;

  // Effective per-piece weight fed to sintering = base + loss (§2 "Weight + Loss Weight").
  const chosenWeight = baseWeightGms + lossWtGms;
  // Total order weight uses the base weight only (§1: Qty × one of the weights).
  const totalWtGms = baseWeightGms * qty;
  const totalWtKg = totalWtGms / 1000;

  // --- RM + VA → Ratio (sintered cost/gm) (§4) ---
  const rmPerKg = num(input.rmPerKg);
  const rmPerGm = rmPerKg / 1000;
  const vaFloorPerKg = input.vaFloorPerKg === undefined ? 2000 : num(input.vaFloorPerKg);
  const vaPerKg = Math.max(vaFloorPerKg, num(input.vaPct) * rmPerKg);
  const vaPerGm = vaPerKg / 1000;
  const sinteredCostPerGm = rmPerGm + vaPerGm; // "Ratio"
  const sinteredPricePerPiece = chosenWeight * sinteredCostPerGm;

  // --- shaping / forming (§5) ---
  const shapingMins = num(input.shapingMins);
  const shapingCostPerPiece = shapingMins * num(input.shapingRatePerMin);
  const sinteredPlusShaping = sinteredPricePerPiece + shapingCostPerPiece;

  // --- machining, overhead applies here ONLY (§6 locked finding) ---
  const machiningMins = input.machiningMins === undefined ? 1 : num(input.machiningMins);
  const machiningCostPerPiece = num(input.machiningRate) * machiningMins;
  const machiningWithOverhead = machiningCostPerPiece * (1 + num(input.overheadPct));
  const costAfterMachining = sinteredPlusShaping + machiningWithOverhead;

  // --- negotiation + quote (§6) ---
  const negotiationAmount = costAfterMachining * num(input.negotiationPct);
  const quotePricePerPiece = costAfterMachining + negotiationAmount;
  const quoteValue = quotePricePerPiece * qty;

  return {
    baseWeightGms,
    lossBaseGms,
    effectiveLossPct,
    lossWtGms,
    lossWtKg,
    chosenWeight,
    totalWtGms,
    totalWtKg,
    rmPerGm,
    vaPerKg,
    vaPerGm,
    sinteredCostPerGm,
    sinteredPricePerPiece,
    shapingCostPerPiece,
    sinteredPlusShaping,
    machiningCostPerPiece,
    machiningWithOverhead,
    costAfterMachining,
    negotiationAmount,
    quotePricePerPiece,
    quoteValue,
  };
}
