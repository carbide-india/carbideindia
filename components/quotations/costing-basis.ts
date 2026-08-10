/**
 * Cost-basis freshness for quoted lines - pure helpers.
 *
 * A quotation snapshots its per-line cost basis (`quotation_items.final_cost`)
 * from the approved + locked chosen costing at the moment it is created
 * (app/(app)/quotations/actions.ts). Costings are now REVISED by inserting a new
 * row (Costing 1 / 2 / 3 per product, `is_latest_revision` on the newest) rather
 * than being edited in place, so a quote written against revision 1 keeps
 * showing revision 1's number even after revision 3 exists.
 *
 * That is exactly what the quotation stage has to surface: which revision each
 * line was priced from, and whether a newer one has since landed. The revision
 * MODEL is owned by the costing workstream - this only consumes it.
 */

/** A numeric-string money column → number, or null when unset/unparseable. */
export function moneyOrNull(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Paise-level tolerance: below this two costs are the same number. */
const COST_EPSILON = 0.005;

/**
 * Is a line's frozen cost basis out of date against the latest costing
 * revision? Returns false whenever either side is missing - an unknown is NOT
 * reported as stale, because a false "stale" flag would be read as a real
 * pricing problem.
 */
export function isCostBasisStale(
  lineFinalCost: string | null | undefined,
  latestUnitCost: string | null | undefined,
): boolean {
  const a = moneyOrNull(lineFinalCost);
  const b = moneyOrNull(latestUnitCost);
  if (a === null || b === null) return false;
  return Math.abs(a - b) > COST_EPSILON;
}

/** Signed delta (latest − quoted basis), or null when either side is missing. */
export function costBasisDelta(
  lineFinalCost: string | null | undefined,
  latestUnitCost: string | null | undefined,
): number | null {
  const a = moneyOrNull(lineFinalCost);
  const b = moneyOrNull(latestUnitCost);
  if (a === null || b === null) return null;
  return b - a;
}

/** "Costing 3 · In-house" style label for a consumed costing revision. */
export function revisionLabel(
  revisionNo: number | null | undefined,
  typeLabel: string | null | undefined,
): string | null {
  if (revisionNo == null) return null;
  const base = `Costing ${revisionNo}`;
  return typeLabel ? `${base} · ${typeLabel}` : base;
}
