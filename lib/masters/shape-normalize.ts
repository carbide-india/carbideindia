/**
 * Shape name normalization (ERP redesign — Phase 0).
 *
 * Maps legacy / free-text enquiry `shape` strings to the canonical
 * `master_options` shape NAMES (kind = 'shape'). The six seeded shapes are:
 *
 *   Cylinder - Reg    Cylinder - Spl
 *   H. Cylinder - Reg H. Cylinder - Spl
 *   Flat - Reg        Flat - Spl
 *
 * The mapping is decomposed into a FAMILY (Cylinder / H. Cylinder / Flat) and a
 * VARIANT (Reg / Spl):
 *   - family is inferred from geometry synonyms (rod/bar → cylinder; ring/bush/
 *     hollow → hollow cylinder; plate/block/strip → flat);
 *   - variant is Spl if the string mentions special/spl, else Reg (default).
 *
 * Returns the canonical name, or `null` when the family is unrecognizable
 * (e.g. "Special", "Assembly", free-text noise) so the caller can flag it for
 * master cleanup. Pure (no db / no server-only) — shared by scripts, actions,
 * and unit tests.
 *
 * NOTE: this does NOT check the DB — it only produces a *candidate* canonical
 * name. `scripts/report-unresolvable-shapes.ts` confirms the candidate against
 * the actual active shape masters.
 */

/** The six canonical shape master names (must match scripts/seed-defaults.ts). */
export const CANONICAL_SHAPE_NAMES = [
  "Cylinder - Reg",
  "Cylinder - Spl",
  "H. Cylinder - Reg",
  "H. Cylinder - Spl",
  "Flat - Reg",
  "Flat - Spl",
] as const;

export type CanonicalShapeName = (typeof CANONICAL_SHAPE_NAMES)[number];

type Family = "Cylinder" | "H. Cylinder" | "Flat";
type Variant = "Reg" | "Spl";

/** Collapse case + punctuation + runs of whitespace to a comparable token string. */
function canon(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[._\-/\\]+/g, " ") // dots, underscores, dashes, slashes → space
    .replace(/\s+/g, " ")
    .trim();
}

/** Decide the Reg/Spl variant from the raw string (default Reg). */
function variantOf(n: string): Variant {
  // word-ish match so "specification" doesn't false-positive
  if (/\b(spl|special|splcl|spcl)\b/.test(n)) return "Spl";
  return "Reg";
}

/**
 * Infer the geometry family. Order matters: hollow-cylinder synonyms must be
 * tested before the plain-cylinder ones (a "hollow cylinder" also contains
 * "cylinder").
 */
function familyOf(n: string): Family | null {
  // Hollow cylinder / ring / bush / tube: has an inner bore.
  if (
    /\bh cylinder\b/.test(n) || // "H. Cylinder" → "h cylinder" after canon()
    /\bhollow\b/.test(n) ||
    /\bring\b/.test(n) ||
    /\bbush(ing)?\b/.test(n) ||
    /\btube\b/.test(n) ||
    /\bhc\b/.test(n)
  ) {
    return "H. Cylinder";
  }
  // Solid cylinder / rod / bar / pin / cyl.
  if (
    /\bcylinder\b/.test(n) ||
    /\bcyl\b/.test(n) ||
    /\brod\b/.test(n) ||
    /\bbar\b/.test(n) ||
    /\bpin\b/.test(n) ||
    /\bround\b/.test(n)
  ) {
    return "Cylinder";
  }
  // Flat / plate / block / strip / sheet / slab.
  if (
    /\bflat\b/.test(n) ||
    /\bplate\b/.test(n) ||
    /\bblock\b/.test(n) ||
    /\bstrip\b/.test(n) ||
    /\bsheet\b/.test(n) ||
    /\bslab\b/.test(n)
  ) {
    return "Flat";
  }
  return null;
}

/**
 * Map a legacy/free-text shape string to a canonical shape master name, or
 * `null` if the family cannot be determined.
 *
 * Examples:
 *   "flat"            → "Flat - Reg"
 *   "Flat Special"    → "Flat - Spl"
 *   "cyl"             → "Cylinder - Reg"
 *   "H. Cylinder-Spl" → "H. Cylinder - Spl"
 *   "Assembly"        → null
 */
export function normalizeShapeName(raw: string): CanonicalShapeName | null {
  if (typeof raw !== "string") return null;
  const n = canon(raw);
  if (n === "") return null;

  // Fast path: already an exact canonical name (case-insensitive).
  for (const name of CANONICAL_SHAPE_NAMES) {
    if (canon(name) === n) return name;
  }

  const family = familyOf(n);
  if (family === null) return null;
  const variant = variantOf(n);
  const result = `${family} - ${variant}` as CanonicalShapeName;
  // Guard: the composed name must be one of the canonical six.
  return CANONICAL_SHAPE_NAMES.includes(result) ? result : null;
}
