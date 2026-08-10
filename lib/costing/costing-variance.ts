/**
 * Costing revision-vs-revision variance (pure, no I/O).
 *
 * Manan, on seeing what moved between Costing 1 and Costing 2: "सेम वेरिएंस
 * दिखेगा … ये व्यू वहां पे भी दे, यहां पे भी दे" — the same variance view he
 * already gets for Primary-Feasibility-vs-Costing specs, but for the costing
 * NUMBERS (block weight, net weight, rates, final cost).
 *
 * This is NOT a second spec differ. `lib/feasibility/spec-variance.ts` diffs the
 * SPEC fields, which live on `inquiry_items` and are therefore IDENTICAL across
 * two revisions of the same line — it can say nothing about what changed between
 * Costing 1 and Costing 2. This module diffs the costing row's own inputs and
 * outputs and deliberately emits the SAME `SpecVarianceRow` shape, so the report
 * table renders identically on both surfaces.
 */

import type { SpecVarianceRow } from "@/lib/feasibility/spec-variance";

const EMPTY = "—";

/**
 * The costing columns the variance report tracks. A structural subset of
 * `costings.$inferSelect` — numerics arrive from Drizzle as decimal strings.
 */
export interface CostingVarianceInput {
  costingType?: string | null;
  costingLogic?: string | null;
  qty?: string | null;
  // weights
  blockWtPerPiece?: string | null;
  blockWtOrderKg?: string | null;
  directWtPerPiece?: string | null;
  directWtOrderKg?: string | null;
  totalWtOrderKg?: string | null;
  pressingWt?: string | null;
  theoreticalWt?: string | null;
  blockWt?: string | null;
  lossPct?: string | null;
  // rates
  rmPricePerKg?: string | null;
  vaPct?: string | null;
  shapingRatePerMin?: string | null;
  shapingMins?: string | null;
  machiningRate?: string | null;
  overheadPct?: string | null;
  negotiationPct?: string | null;
  // tooling / development
  toolFlatCost?: string | null;
  toolPerPieceCost?: string | null;
  developmentCost?: string | null;
  // bought-out
  outsourcedVendorCost?: string | null;
  vendorOhPct?: string | null;
  // outputs
  sinteredPricePerPiece?: string | null;
  shapingCostPerPiece?: string | null;
  machiningCostPerPiece?: string | null;
  costAfterMachining?: string | null;
  finalCostPerPiece?: string | null;
  quoteValue?: string | null;
  // commercial terms
  paymentTerms?: string | null;
  deliveryTime?: string | null;
  validity?: string | null;
}

type FieldKind = "number" | "money" | "percent" | "text";

interface FieldDef {
  key: keyof CostingVarianceInput;
  label: string;
  kind: FieldKind;
  /** Report section, used to group the rows in the UI. */
  group: "Identity" | "Weights" | "Rates" | "Vendor & Tooling" | "Outputs" | "Terms";
}

/**
 * Report order — identity first, then the weights Manan named, then the rates
 * that move them, then the money that falls out, then the commercial terms.
 */
const FIELDS: readonly FieldDef[] = [
  { key: "costingType", label: "Route", kind: "text", group: "Identity" },
  { key: "costingLogic", label: "Costing Logic", kind: "text", group: "Identity" },
  { key: "qty", label: "Quantity", kind: "number", group: "Identity" },

  { key: "blockWtPerPiece", label: "Block Wt / pc (gms)", kind: "number", group: "Weights" },
  { key: "blockWtOrderKg", label: "Block Wt — order (kg)", kind: "number", group: "Weights" },
  { key: "directWtPerPiece", label: "Direct Wt / pc (gms)", kind: "number", group: "Weights" },
  { key: "directWtOrderKg", label: "Direct Wt — order (kg)", kind: "number", group: "Weights" },
  { key: "totalWtOrderKg", label: "Total Wt — order (kg)", kind: "number", group: "Weights" },
  { key: "pressingWt", label: "Pressing Wt (gms)", kind: "number", group: "Weights" },
  { key: "theoreticalWt", label: "Net / Theoretical Wt (gms)", kind: "number", group: "Weights" },
  { key: "blockWt", label: "Block Wt (gms)", kind: "number", group: "Weights" },
  { key: "lossPct", label: "Loss %", kind: "percent", group: "Weights" },

  { key: "rmPricePerKg", label: "RM Price / kg", kind: "money", group: "Rates" },
  { key: "vaPct", label: "Value Addition %", kind: "percent", group: "Rates" },
  { key: "shapingRatePerMin", label: "Shaping Rate / min", kind: "money", group: "Rates" },
  { key: "shapingMins", label: "Shaping (mins)", kind: "number", group: "Rates" },
  { key: "machiningRate", label: "Machining Rate", kind: "money", group: "Rates" },
  { key: "overheadPct", label: "Overhead %", kind: "percent", group: "Rates" },
  { key: "negotiationPct", label: "Negotiation %", kind: "percent", group: "Rates" },

  { key: "toolFlatCost", label: "Tool Cost (flat)", kind: "money", group: "Vendor & Tooling" },
  { key: "toolPerPieceCost", label: "Tool Cost / pc", kind: "money", group: "Vendor & Tooling" },
  { key: "developmentCost", label: "Development Cost", kind: "money", group: "Vendor & Tooling" },
  { key: "outsourcedVendorCost", label: "Vendor Cost / pc", kind: "money", group: "Vendor & Tooling" },
  { key: "vendorOhPct", label: "Vendor Overhead %", kind: "percent", group: "Vendor & Tooling" },

  { key: "sinteredPricePerPiece", label: "Sintered Price / pc", kind: "money", group: "Outputs" },
  { key: "shapingCostPerPiece", label: "Shaping Cost / pc", kind: "money", group: "Outputs" },
  { key: "machiningCostPerPiece", label: "Machining Cost / pc", kind: "money", group: "Outputs" },
  { key: "costAfterMachining", label: "Cost After Machining", kind: "money", group: "Outputs" },
  { key: "finalCostPerPiece", label: "Final Cost / pc", kind: "money", group: "Outputs" },
  { key: "quoteValue", label: "Quote Value", kind: "money", group: "Outputs" },

  { key: "paymentTerms", label: "Payment Terms", kind: "text", group: "Terms" },
  { key: "deliveryTime", label: "Delivery Time", kind: "text", group: "Terms" },
  { key: "validity", label: "Validity", kind: "text", group: "Terms" },
];

/** Human labels for the two enum-ish text columns (kept local — display only). */
const TEXT_LABELS: Record<string, string> = {
  inhouse: "In-house",
  bought_out: "Bought-Out",
};

function toNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: string | null | undefined, kind: FieldKind): string {
  if (kind === "text") {
    const t = (v ?? "").trim();
    if (t === "") return EMPTY;
    return TEXT_LABELS[t] ?? t;
  }
  const n = toNum(v);
  if (n == null) return EMPTY;
  if (kind === "percent") return `${Number((n * 100).toFixed(4))}%`;
  if (kind === "money") return n.toFixed(2);
  return String(Number(n.toFixed(6)));
}

/** Numeric equality tolerant of "10.00" vs "10"; falls back to trimmed text. */
function same(
  a: string | null | undefined,
  b: string | null | undefined,
  kind: FieldKind,
): boolean {
  if (kind === "text") return (a ?? "").trim() === (b ?? "").trim();
  const na = toNum(a);
  const nb = toNum(b);
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  // Guard float noise from the decimal→number round-trip.
  return Math.abs(na - nb) < 1e-9;
}

/** A variance row plus the grouping heading and the signed numeric delta. */
export interface CostingVarianceRow extends SpecVarianceRow {
  group: FieldDef["group"];
  /** next − previous, for numeric fields only (null for text / missing values). */
  delta: number | null;
}

/**
 * Diff two costing revisions. `previous` is the older revision (rendered in the
 * left column, mapped to `feasibilityValue` so the shared report table can show
 * it unchanged); `next` is the newer one (`costingValue`).
 *
 * Rows where BOTH sides are empty are dropped — a 30-row report of dashes is
 * noise, and an all-empty field says nothing about what changed.
 */
export function computeCostingVariance(
  previous: CostingVarianceInput | null | undefined,
  next: CostingVarianceInput,
): CostingVarianceRow[] {
  const prev = previous ?? {};
  const rows: CostingVarianceRow[] = [];

  for (const f of FIELDS) {
    const a = prev[f.key] ?? null;
    const b = next[f.key] ?? null;
    const left = fmt(a, f.kind);
    const right = fmt(b, f.kind);
    if (left === EMPTY && right === EMPTY) continue;

    const na = f.kind === "text" ? null : toNum(a);
    const nb = f.kind === "text" ? null : toNum(b);

    rows.push({
      field: f.key,
      label: f.label,
      feasibilityValue: left,
      costingValue: right,
      changed: !same(a, b, f.kind),
      group: f.group,
      delta: na != null && nb != null ? nb - na : null,
    });
  }

  return rows;
}

/** How many rows differ — the headline number on the revision diff panel. */
export function countCostingVarianceChanges(
  rows: readonly CostingVarianceRow[],
): number {
  return rows.filter((r) => r.changed).length;
}
