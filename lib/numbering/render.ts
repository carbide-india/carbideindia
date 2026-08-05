/**
 * Pure rendering + financial-year helpers for Admin → Document Numbering.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM lib/series/next-number.ts
 * -------------------------------------------------------------
 * The admin register renders a LIVE PREVIEW of the next number for every
 * document family, and that preview is drawn in the browser as the admin types.
 * `lib/series/next-number.ts` is server-only (it imports drizzle's `sql` and the
 * pg transaction types), so the client cannot import it. These functions are a
 * deliberate, byte-for-byte mirror of the three minting paths that exist in the
 * app today; `tests/unit/numbering-format.test.ts` pins that parity against the
 * real allocator so a future change to either side fails the suite rather than
 * silently making the admin preview lie.
 *
 * The three minting paths:
 *   fy_series → lib/series/next-number.ts `formatDocNumber` (invoice, DN, CN)
 *   sequence  → the column DEFAULT SQL in db/schema.ts, e.g.
 *               `'CL-' || lpad(nextval('clients_client_code_seq')::text, 4, '0')`
 *   sm_suffix → `${smNumber}-${prefix}${nn}` built in the quotation /
 *               negotiation / sales-order / PI / sample server actions
 */
import type { DocNumberStrategy } from "@/db/enums";

/** Zero-pad `value`; `padTo <= 0` means "no padding" (raw digits). */
export function padValue(value: number, padTo: number): string {
  const digits = String(Math.trunc(value));
  return padTo > 0 ? digits.padStart(padTo, "0") : digits;
}

/**
 * Mirror of `formatDocNumber` in lib/series/next-number.ts.
 * ("INV", "2026-27", 4, 42) → "INV/2026-27/0042". The separator is "/" in the
 * allocator and is NOT configurable — see `separatorIsHonoured`.
 */
export function renderFySeriesNumber(
  prefix: string,
  fyLabel: string,
  padTo: number,
  value: number,
): string {
  const padded = padValue(value, padTo);
  return prefix ? `${prefix}/${fyLabel}/${padded}` : `${fyLabel}/${padded}`;
}

/**
 * Mirror of the `'<prefix>' || nextval(...)` / `lpad(...)` column DEFAULTs.
 * ("CL-", 4, 7) → "CL-0007"; ("SM", 0, 9601) → "SM9601".
 */
export function renderSequenceNumber(
  prefix: string,
  padTo: number,
  value: number,
): string {
  return `${prefix}${padValue(value, padTo)}`;
}

/**
 * Mirror of `${smNumber}-${prefix}${String(n).padStart(padTo, "0")}`.
 * ("SM9601", "Q", 2, 1) → "SM9601-Q01".
 */
export function renderSmSuffixNumber(
  smNumber: string,
  prefix: string,
  padTo: number,
  index: number,
): string {
  return `${smNumber}-${prefix}${padValue(index, padTo)}`;
}

/** The shape the preview needs — satisfied by a `doc_number_formats` row. */
export interface NumberingFormatShape {
  strategy: DocNumberStrategy;
  prefix: string;
  padTo: number;
}

export interface PreviewContext {
  /** Financial year for fy_series previews, e.g. "2026-27". */
  fyLabel: string;
  /** The counter value that would be assigned next (already +1'd). */
  nextValue: number;
  /** A real SM number to hang an sm_suffix preview off. */
  sampleSmNumber: string;
}

/** Render the number this family would mint next, exactly as the app would. */
export function previewNumber(
  fmt: NumberingFormatShape,
  ctx: PreviewContext,
): string {
  switch (fmt.strategy) {
    case "fy_series":
      return renderFySeriesNumber(fmt.prefix, ctx.fyLabel, fmt.padTo, ctx.nextValue);
    case "sequence":
      return renderSequenceNumber(fmt.prefix, fmt.padTo, ctx.nextValue);
    case "sm_suffix":
      return renderSmSuffixNumber(
        ctx.sampleSmNumber,
        fmt.prefix,
        fmt.padTo,
        ctx.nextValue,
      );
  }
}

/**
 * Can an admin change this family's prefix/padding and have it actually take
 * effect? Only `fy_series` reads them at mint time (off the `doc_number_series`
 * counter row). `sequence` prefixes are baked into the column DEFAULT SQL in
 * db/schema.ts and `sm_suffix` prefixes are string literals in the server
 * actions — editing those rows would change the register display but NOT the
 * numbers, so the UI shows them read-only rather than lying.
 */
export function prefixIsEditable(strategy: DocNumberStrategy): boolean {
  return strategy === "fy_series";
}

/** The allocator hardcodes "/" — the stored `separator` is display metadata. */
export function separatorIsHonoured(_strategy: DocNumberStrategy): boolean {
  return false;
}

/** Where this family's number is actually minted — shown next to each row. */
export function mintedBy(
  strategy: DocNumberStrategy,
  sequenceName: string | null,
): string {
  switch (strategy) {
    case "fy_series":
      return "lib/series/next-number.ts → doc_number_series";
    case "sequence":
      return sequenceName
        ? `Postgres sequence ${sequenceName}`
        : "Postgres sequence (not configured)";
    case "sm_suffix":
      return "Derived from the parent SM number at insert time";
  }
}

// ── Indian financial year ────────────────────────────────────────────────────

/**
 * Mirror of `financialYearLabel` in lib/series/next-number.ts: Apr 1 → Mar 31,
 * written "YYYY-YY". Uses the UTC parts exactly like the allocator does, so the
 * admin preview and the minted number never disagree about which FY it is.
 */
export function financialYear(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0 = Jan … 3 = Apr
  const startYear = m >= 3 ? y : y - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYY}`;
}

/** "2026-27" → "2027-28". Returns null for a malformed label. */
export function nextFinancialYear(fyLabel: string): string | null {
  const start = financialYearStart(fyLabel);
  if (start === null) return null;
  const endYY = String((start + 2) % 100).padStart(2, "0");
  return `${start + 1}-${endYY}`;
}

/** Start year of a well-formed FY label, else null. Validates the check digits. */
export function financialYearStart(fyLabel: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(fyLabel);
  if (!m) return null;
  const start = Number(m[1]);
  const endYY = Number(m[2]);
  if (!Number.isInteger(start) || start < 1990 || start > 2200) return null;
  if ((start + 1) % 100 !== endYY) return null;
  return start;
}

/** True when the label is a syntactically valid Indian FY label. */
export function isFinancialYearLabel(fyLabel: string): boolean {
  return financialYearStart(fyLabel) !== null;
}

/**
 * Sort comparator for FY labels, oldest first. Falls back to a string compare
 * for anything malformed so a stray row still sorts deterministically.
 */
export function compareFinancialYears(a: string, b: string): number {
  const sa = financialYearStart(a);
  const sb = financialYearStart(b);
  if (sa === null || sb === null) return a.localeCompare(b);
  return sa - sb;
}
