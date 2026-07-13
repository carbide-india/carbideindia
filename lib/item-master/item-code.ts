/**
 * Item / Product Master — internal item-code generator.
 *
 * Decoded from Carbide's "Item Master Logic" sheet (+ Manan's 2026-06-17 call):
 *   code = Size – Seq – Shape – InternalGrade – Condition – Tolerance – Dimensions
 *   e.g. S-10001-C-CIF06-S-XXX-100.00x90.80x89.00x4.50x2.25
 *
 * - Size: S/M/L (+ assemblies) — first char; derived from dimensions.
 * - Seq:  5-digit running number (the unique item serial).
 * - Shape/Grade/Condition: short codes from their masters.
 * - Tolerance: from the tolerance chart — defaults to "XXX" until that chart
 *   lands (Jayshree), matching the sheet's own placeholder.
 * - Dimensions: present values at 2 decimals (mm), joined by "x"
 *   (OD x ID x L x W x T — longest is always length).
 *
 * Pure module — no I/O. NOTE: the exact segment order is our reading of the
 * sheet's example; it lives in one place so a tweak from Alok is a one-liner.
 */

export interface ItemCodeParts {
  sizeCode: string;        // S / M / L / SA / MA / LA / Sp / A / P
  seq: number;             // running serial, padded to 5 digits
  shapeCode: string;       // C / HC / F / CSp 
  gradeCode: string;       // CIF06 
  conditionCode: string;   // B / Fi / SF 
  toleranceCode?: string;  // → "XXX" when unknown
  dims: number[];          // present dimension values, in order (OD,ID,L,W,T)
}

/** Format the dimension list: drop blanks, 2 decimals each, "x"-joined. */
export function formatDims(dims: number[]): string {
  return dims
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d))
    .map((d) => d.toFixed(2))
    .join("x");
}

/** Assemble the full item code. */
export function buildItemCode(p: ItemCodeParts): string {
  const tolerance = (p.toleranceCode ?? "").trim() || "XXX";
  const seq = String(Math.trunc(p.seq)).padStart(5, "0");
  return [
    p.sizeCode,
    seq,
    p.shapeCode,
    p.gradeCode,
    p.conditionCode,
    tolerance,
    formatDims(p.dims),
  ].join("-");
}

/**
 * Size class from dimensions (mm):
 *   - ANY dimension < 25            → Small  (S)
 *   - else, largest dimension ≤ 100 → Medium (M)
 *   - else (largest > 100)          → Large  (L)
 * Assemblies/special/powder are chosen explicitly, not derived here.
 */
export function deriveSizeCode(dims: number[]): "S" | "M" | "L" {
  const vals = dims.filter((d): d is number => typeof d === "number" && Number.isFinite(d) && d > 0);
  if (vals.length === 0) return "M";
  if (vals.some((d) => d < 25)) return "S";
  return Math.max(...vals) <= 100 ? "M" : "L";
}
