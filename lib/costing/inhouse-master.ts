// In-House "Costing Master" value + wrapper compute — pure, framework-free.
//
// The CORE math lives in `lib/costing/mfg-engine.ts` (computeManufacturingCost,
// golden-tested to the rupee). This module is the thin WRAPPER around it that the
// Costing Master screen needs:
//   • the canonical `InhouseCalculatorValue` UI value object (percents held as
//     WHOLE numbers, numeric cells as `number | ""`),
//   • the machining "decided rate" fold (per-op / internal / external vendor),
//   • the separately-levied add-ons (tool levy / mandril / other dev costs) that
//     the engine itself does not model.
//
// It is imported by BOTH the client calculator panel/shell (live recompute) AND
// the server action (authoritative recompute on save) so there is exactly ONE
// source of truth for the In-House quote number. No React, no I/O.

import {
  computeManufacturingCost,
  type ManufacturingCostOutput,
  type WeightMethod,
  type ToolType,
} from "@/lib/costing/mfg-engine";

// ─────────────────────────────────────────────────────────────────────────────
// Value object (the shell owns this; the panel edits it; the server persists it).
// ─────────────────────────────────────────────────────────────────────────────

/** How a levied cost is charged onto the quote. */
export type LevyMode = "flat" | "per_piece" | "none";

/** Tooling Chart tool type (drives the engine's loss-weight base, §2 of the spec). */
export type CalcToolType = ToolType; // "perfect" | "block" | "big"

/** Weight-selection method 1-4 (§3 of the spec). */
export type CalcWeightMethod = WeightMethod; // 1 | 2 | 3 | 4

/** One "Any other Development Cost" row (§5). `amount` is auto = qty × rate. */
export interface DevCostRow {
  id: string;
  description: string;
  qty: number | "";
  rate: number | "";
  amount: number | "";
  levyMode: LevyMode;
}

/** One machining operation row (§7) — an Admin-Master op + its minutes & rate. */
export interface MachiningOpRow {
  id: string;
  /** master `machining_op` option id, or "" until picked. */
  optionId: string;
  minutes: number | "";
  /** Rs / min for this operation (used when the "By operation" rate source is chosen). */
  rate: number | "";
}

/** One external machining-vendor rate (§7) — up to 5. */
export interface ExternalMachiningVendorRow {
  id: string;
  /** vendor option id, or "" until picked. */
  vendorId: string;
  /** Rs / min quoted by this vendor. */
  rate: number | "";
}

/**
 * The complete In-House calculator value. Self-describing so the shell can
 * serialise it straight into the `costings` columns added by migration 0064.
 * Percentages are WHOLE NUMBERS (15 = 15 %); the compute boundary divides by 100.
 */
export interface InhouseCalculatorValue {
  // Sizes (transferred from the Tolerance Calculator, else typed) — §10.2
  finishedSize: string;
  toleranceSize: string;
  sinteredSize: string;
  greenSize: string;
  shrinkage: string;

  // Tooling — §10.3
  /** master `tooling_chart` option id, or the sentinel `NEW_TOOL` for a new tool. */
  toolingChartId: string;
  toolType: CalcToolType;
  levyToolMode: LevyMode;
  /** flat total (levyToolMode="flat") or per-piece amount (levyToolMode="per_piece"). */
  levyToolAmount: number | "";

  // Weight selection — §10.4
  weightMethod: CalcWeightMethod;
  blockWt: number | "";
  theoreticalWt: number | "";
  pressingWt: number | "";
  /** Manual total-weight capture; the engine derives its own total from base × qty. */
  totalWt: number | "";
  /** Loss %, whole number, clamped 10-20 by the engine (0 = no loss). */
  lossPct: number | "";

  // RM + VA — §10.5
  rmPerKg: number | "";
  batchDetails: string;
  /** VA %, whole number (20-40). VA/kg = max(floor, VA% × RM). */
  vaPct: number | "";
  vaFloorPerKg: number | "";

  // Shaping / Forming — §10.5
  shapingMins: number | "";
  shapingRatePerMin: number | "";

  // Mandril — §10.5
  mandrilRate: number | "";
  mandrilSize: number | "";

  // Other development costs — §10.5
  devCosts: DevCostRow[];

  // Machining — §7 / §10.6
  machiningOps: MachiningOpRow[];
  /** Internal machining rate, Rs / min. */
  internalMachiningRate: number | "";
  externalVendors: ExternalMachiningVendorRow[];
  /**
   * Which rate source drives machining cost:
   *   "per_op"   — sum of each op's (minutes × rate)
   *   "internal" — internal rate × total minutes
   *   <rowId>    — that external vendor's rate × total minutes
   */
  machiningChoice: string;
  /** Overhead %, whole number (15-150), applied to MACHINING ONLY. */
  overheadPct: number | "";

  // Negotiation — §10.7
  /** Negotiation %, whole number, applied to the running total. */
  negotiationPct: number | "";

  // Quantity (carried from the enquiry / previous form).
  qty: number | "";
}

/** Sentinel value for the "New Tool to be Developed" tooling-chart choice. */
export const NEW_TOOL = "__new_tool__" as const;

/** A fresh, fully-defaulted value — the shell uses this to initialise create mode. */
export function emptyInhouseCalculatorValue(
  overrides?: Partial<InhouseCalculatorValue>,
): InhouseCalculatorValue {
  return {
    finishedSize: "",
    toleranceSize: "",
    sinteredSize: "",
    greenSize: "",
    shrinkage: "",
    toolingChartId: "",
    toolType: "perfect",
    levyToolMode: "none",
    levyToolAmount: "",
    weightMethod: 1,
    blockWt: "",
    theoreticalWt: "",
    pressingWt: "",
    totalWt: "",
    lossPct: 15,
    rmPerKg: "",
    batchDetails: "",
    vaPct: 30,
    vaFloorPerKg: 2000,
    shapingMins: 0,
    shapingRatePerMin: "",
    mandrilRate: 0,
    mandrilSize: 0,
    devCosts: [],
    machiningOps: [],
    internalMachiningRate: "",
    externalVendors: [],
    machiningChoice: "internal",
    overheadPct: 25,
    negotiationPct: 3,
    qty: "",
    ...overrides,
  };
}

// ── numeric helpers (shared) ──────────────────────────────────────────────────

/** number | "" → finite number, else fallback. */
export function numOr(v: number | "" | undefined | null, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
/** number | "" → finite number, else undefined (for optional engine inputs). */
export function numOrU(v: number | "" | undefined | null): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
/** Whole-number percent → fraction ("" → 0). */
export function pct(v: number | "" | undefined | null): number {
  return typeof v === "number" && Number.isFinite(v) ? v / 100 : 0;
}

// ── compute ───────────────────────────────────────────────────────────────────

/** Total machining minutes across all operation rows. */
export function totalMachiningMinutes(value: InhouseCalculatorValue): number {
  return value.machiningOps.reduce((s, o) => s + numOr(o.minutes, 0), 0);
}

/**
 * The "decided" machining base cost per piece, per the machiningChoice source:
 *   per_op   → Σ (minutes × rate)
 *   internal → internal rate × total minutes
 *   <rowId>  → that external vendor's rate × total minutes
 */
export function resolveMachiningBase(value: InhouseCalculatorValue): number {
  const totalMins = totalMachiningMinutes(value);
  const choice = value.machiningChoice;
  if (choice === "per_op") {
    return value.machiningOps.reduce(
      (s, o) => s + numOr(o.minutes, 0) * numOr(o.rate, 0),
      0,
    );
  }
  if (choice === "internal") {
    return numOr(value.internalMachiningRate, 0) * totalMins;
  }
  const vend = value.externalVendors.find((e) => e.id === choice);
  return vend ? numOr(vend.rate, 0) * totalMins : 0;
}

/** Everything the panel / shell / server need from one In-House value. */
export interface InhouseMasterTotals {
  /** The raw tested-engine breakdown (all §6 intermediates). */
  engine: ManufacturingCostOutput;
  /** The decided machining base (before overhead). */
  machiningBase: number;
  // Separately-levied add-ons (the engine does not fold these).
  toolLevyPerPiece: number;
  mandrilPerPiece: number;
  devPerPiece: number;
  addOnPerPiece: number;
  /** Engine quote + add-ons, per piece — the number that feeds the quotation. */
  quoteInclPerPiece: number;
  /** quoteInclPerPiece × qty. */
  quoteInclValue: number;
}

/**
 * Compute the full In-House Costing Master totals from one value object. Pure:
 * identical input → identical output. The core cost chain comes from the
 * golden-tested `computeManufacturingCost`; this wrapper folds the machining
 * rate-source choice into the engine's `machiningRate` and adds the levied
 * tool / mandril / dev-cost add-ons on top.
 */
export function computeInhouseMaster(value: InhouseCalculatorValue): InhouseMasterTotals {
  const qty = numOr(value.qty, 0);
  const machiningBase = resolveMachiningBase(value);

  const engine = computeManufacturingCost({
    qty,
    method: value.weightMethod,
    toolType: value.toolType,
    blockWt: numOrU(value.blockWt),
    theoreticalWt: numOrU(value.theoreticalWt),
    pressingWt: numOrU(value.pressingWt),
    lossPct: pct(value.lossPct),
    rmPerKg: numOr(value.rmPerKg, 0),
    vaPct: pct(value.vaPct),
    vaFloorPerKg: numOr(value.vaFloorPerKg, 2000),
    shapingRatePerMin: numOrU(value.shapingRatePerMin),
    shapingMins: numOr(value.shapingMins, 0),
    // Fold the decided machining base into the engine's rate×mins model.
    machiningRate: machiningBase,
    machiningMins: 1,
    overheadPct: pct(value.overheadPct),
    negotiationPct: pct(value.negotiationPct),
  });

  // Add-ons the engine does not model (levied on top of its quote).
  const toolLevyPerPiece =
    value.levyToolMode === "flat"
      ? numOr(value.levyToolAmount, 0) / (qty > 0 ? qty : 1)
      : value.levyToolMode === "per_piece"
        ? numOr(value.levyToolAmount, 0)
        : 0;
  const mandrilPerPiece = numOr(value.mandrilRate, 0);
  const devPerPiece = value.devCosts.reduce((s, d) => {
    const amount = numOr(d.amount, numOr(d.qty, 0) * numOr(d.rate, 0));
    if (d.levyMode === "flat") return s + amount / (qty > 0 ? qty : 1);
    if (d.levyMode === "per_piece") return s + amount;
    return s;
  }, 0);

  const addOnPerPiece = toolLevyPerPiece + mandrilPerPiece + devPerPiece;
  const quoteInclPerPiece = engine.quotePricePerPiece + addOnPerPiece;
  const quoteInclValue = quoteInclPerPiece * qty;

  return {
    engine,
    machiningBase,
    toolLevyPerPiece,
    mandrilPerPiece,
    devPerPiece,
    addOnPerPiece,
    quoteInclPerPiece,
    quoteInclValue,
  };
}
