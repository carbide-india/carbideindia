/**
 * PF-vs-Costing spec variance engine (pure, no I/O).
 *
 * At Feasibility "Lock Dimensions & Specifications" time we freeze a JSON
 * snapshot of the tracked spec fields into `inquiry_items.feasibility_baseline`
 * (see `lockItemDimensions`). Costing (Form 05) then edits the LIVE
 * inquiry_item columns. The variance report diffs the frozen baseline (PF)
 * against the live/costing-revised values (C).
 *
 * This module is deliberately pure so it can run on either side (Form 04 /
 * Form 05) and both server and client. Master-id fields (tolerance, condition,
 * grades) are resolved to their human labels through a caller-supplied
 * id → name map so the module never touches the DB.
 */

/** The tracked spec fields, shared by the frozen baseline and the live row. */
export interface SpecSnapshot {
  shape?: string | null;
  outerDia?: string | null;
  innerDia?: string | null;
  length?: string | null;
  width?: string | null;
  thickness?: string | null;
  dimensionUnit?: string | null;
  /** Raw customer grade name from the drawing (text). */
  gradeCustomer?: string | null;
  /** Grade we give the customer (external_grade master id). */
  gradeCustomerFacingId?: string | null;
  /** Internal shop-floor production grade (internal_grade master id). */
  gradeInternalProductionId?: string | null;
  toleranceId?: string | null;
  conditionId?: string | null;
  quantityNos?: string | null;
  quantityUom?: string | null;
}

/** One row of the variance report. Values are already display-ready strings. */
export interface SpecVarianceRow {
  /** Stable field key (for React keys / tests). */
  field: string;
  /** Human label shown in the report. */
  label: string;
  /** Frozen Primary-Feasibility value (display string; "—" when empty). */
  feasibilityValue: string;
  /** Live/costing-revised value (display string; "—" when empty). */
  costingValue: string;
  /** True when the underlying value differs from the baseline. */
  changed: boolean;
}

/** A resolver for master-option labels: option id → display name. */
export type LabelResolver = Map<string, string> | Record<string, string | undefined>;

const EMPTY = "—";

function resolveLabel(id: string | null | undefined, labels: LabelResolver): string | null {
  if (!id) return null;
  const name = labels instanceof Map ? labels.get(id) : labels[id];
  return name && name.trim() ? name : null;
}

/** Numeric comparison tolerant of "10.00" vs "10" vs " 10 ". Null-safe. */
function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = a == null || a === "" ? null : Number(a);
  const nb = b == null || b === "" ? null : Number(b);
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  if (Number.isNaN(na) || Number.isNaN(nb)) return (a ?? "").trim() === (b ?? "").trim();
  return na === nb;
}

/** Trim a numeric string for display: "10.00" → "10", "10.50" → "10.5". */
function fmtNum(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return v.trim() || null;
  // Strip trailing zeros while keeping meaningful decimals.
  return String(n);
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function textOrEmpty(v: string | null | undefined): string {
  return v && v.trim() ? v.trim() : EMPTY;
}

/**
 * Diff the tracked spec fields between the frozen PF baseline and the current
 * (costing-revised) values, returning display-ready rows in report order.
 *
 * @param baseline The frozen `feasibility_baseline` snapshot (may be null).
 * @param current  The live inquiry_item spec columns.
 * @param labels   Master-option id → name map (for tolerance/condition/grades).
 */
export function computeSpecVariance(
  baseline: SpecSnapshot | null | undefined,
  current: SpecSnapshot,
  labels: LabelResolver = {},
): SpecVarianceRow[] {
  const b = baseline ?? {};
  const unitB = (b.dimensionUnit ?? "mm").trim() || "mm";
  const unitC = (current.dimensionUnit ?? "mm").trim() || "mm";

  const rows: SpecVarianceRow[] = [];

  // ── Shape (text) ──────────────────────────────────────────────────────
  rows.push({
    field: "shape",
    label: "Shape",
    feasibilityValue: textOrEmpty(b.shape),
    costingValue: textOrEmpty(current.shape),
    changed: !sameText(b.shape, current.shape),
  });

  // ── Dimensions (numeric + unit) ───────────────────────────────────────
  const dims: Array<[keyof SpecSnapshot, string]> = [
    ["outerDia", "Outer Dia"],
    ["innerDia", "Inner Dia"],
    ["length", "Length"],
    ["width", "Width"],
    ["thickness", "Thickness"],
  ];
  for (const [key, label] of dims) {
    const bv = b[key] as string | null | undefined;
    const cv = current[key] as string | null | undefined;
    const bNum = fmtNum(bv);
    const cNum = fmtNum(cv);
    const bothEmpty = bNum == null && cNum == null;
    // A unit change is only a variance where a value actually exists.
    const unitChanged = !bothEmpty && unitB !== unitC;
    rows.push({
      field: key,
      label,
      feasibilityValue: bNum == null ? EMPTY : `${bNum} ${unitB}`,
      costingValue: cNum == null ? EMPTY : `${cNum} ${unitC}`,
      changed: !sameNumber(bv, cv) || unitChanged,
    });
  }

  // ── Tolerance / Condition (master ids) ────────────────────────────────
  rows.push({
    field: "tolerance",
    label: "Tolerance",
    feasibilityValue: textOrEmpty(resolveLabel(b.toleranceId, labels)),
    costingValue: textOrEmpty(resolveLabel(current.toleranceId, labels)),
    changed: !sameText(b.toleranceId, current.toleranceId),
  });
  rows.push({
    field: "condition",
    label: "Condition",
    feasibilityValue: textOrEmpty(resolveLabel(b.conditionId, labels)),
    costingValue: textOrEmpty(resolveLabel(current.conditionId, labels)),
    changed: !sameText(b.conditionId, current.conditionId),
  });

  // ── Grades (three tiers) ──────────────────────────────────────────────
  rows.push({
    field: "gradeCustomer",
    label: "Grade (from Customer)",
    feasibilityValue: textOrEmpty(b.gradeCustomer),
    costingValue: textOrEmpty(current.gradeCustomer),
    changed: !sameText(b.gradeCustomer, current.gradeCustomer),
  });
  rows.push({
    field: "gradeCustomerFacing",
    label: "Grade (to Customer)",
    feasibilityValue: textOrEmpty(resolveLabel(b.gradeCustomerFacingId, labels)),
    costingValue: textOrEmpty(resolveLabel(current.gradeCustomerFacingId, labels)),
    changed: !sameText(b.gradeCustomerFacingId, current.gradeCustomerFacingId),
  });
  rows.push({
    field: "gradeInternalProduction",
    label: "Grade (Internal Production)",
    feasibilityValue: textOrEmpty(resolveLabel(b.gradeInternalProductionId, labels)),
    costingValue: textOrEmpty(resolveLabel(current.gradeInternalProductionId, labels)),
    changed: !sameText(b.gradeInternalProductionId, current.gradeInternalProductionId),
  });

  // ── Quantity (value + UoM) ────────────────────────────────────────────
  const qtyB = fmtNum(b.quantityNos);
  const qtyC = fmtNum(current.quantityNos);
  const uomB = (b.quantityUom ?? "").trim();
  const uomC = (current.quantityUom ?? "").trim();
  const qtyBothEmpty = qtyB == null && qtyC == null;
  rows.push({
    field: "quantity",
    label: "Quantity",
    feasibilityValue: qtyB == null ? EMPTY : `${qtyB}${uomB ? ` ${uomB}` : ""}`,
    costingValue: qtyC == null ? EMPTY : `${qtyC}${uomC ? ` ${uomC}` : ""}`,
    changed: !sameNumber(b.quantityNos, current.quantityNos) || (!qtyBothEmpty && uomB !== uomC),
  });

  return rows;
}

/** Convenience: how many rows differ from the baseline. */
export function countChanged(rows: SpecVarianceRow[]): number {
  return rows.filter((r) => r.changed).length;
}

/**
 * Collect every master-option id referenced by a baseline/current snapshot so a
 * caller can fetch just the labels it needs in one query.
 */
export function collectMasterIds(...snapshots: Array<SpecSnapshot | null | undefined>): string[] {
  const ids = new Set<string>();
  for (const s of snapshots) {
    if (!s) continue;
    for (const id of [
      s.toleranceId,
      s.conditionId,
      s.gradeCustomerFacingId,
      s.gradeInternalProductionId,
    ]) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}
