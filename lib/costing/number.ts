/**
 * Costing human number — the "SM9613-C01 / -R1 / C02" code the owner asked for
 * (2026-09). Pure (no I/O), so it is shared by queries, server actions,
 * components and unit tests alike.
 *
 * Model (mirrors the Quotation module's Q-number):
 *  - A costing SERIES is numbered per product line: C01, C02, C03 … A brand-new
 *    costing (the "New Costing" action) mints the next series number for the line.
 *  - A REVISION keeps the series number and adds an -R suffix. The FIRST revision
 *    is R1 (stored revision_no 2), the next R2 (revision_no 3); the original
 *    (revision_no 1) carries no suffix.
 */

/** Pad a series number to two digits: 1 → "01", 12 → "12". */
export function padCostingNo(n: number): string {
  return String(Math.max(1, Math.trunc(n || 1))).padStart(2, "0");
}

/**
 * Build a costing code from its parts.
 *   buildCostingCode("SM9613", 1, 1) → "SM9613-C01"
 *   buildCostingCode("SM9613", 1, 2) → "SM9613-C01-R1"
 *   buildCostingCode("SM9613", 2, 1) → "SM9613-C02"
 *   buildCostingCode("SM9613", 2, 3) → "SM9613-C02-R2"
 * A missing SM (should not happen for a saved costing) yields just the C-part.
 */
export function buildCostingCode(
  smNumber: string | null | undefined,
  costingNo: number,
  revisionNo: number,
): string {
  const base = `C${padCostingNo(costingNo)}`;
  const withRev = revisionNo > 1 ? `${base}-R${revisionNo - 1}` : base;
  return smNumber ? `${smNumber}-${withRev}` : withRev;
}
