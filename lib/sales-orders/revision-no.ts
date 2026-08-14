/**
 * Sales-order revision numbering.
 *
 * A revision is written as `<base>-R<n>`, so revising SM9579-SO01 twice gives
 * SM9579-SO01-R2 and then SM9579-SO01-R3 — never SM9579-SO01-R2-R3.
 *
 * The obvious implementation, `soNo.split("-R")[0]`, is wrong on any order
 * number that legitimately contains "-R": SM9579-RUSH-SO01 would collapse to
 * "SM9579" and the second revision would be minted against a base that does not
 * exist. Anchoring at the END and requiring digits is what makes the difference,
 * and it is why this lives here with a test rather than inline in the action.
 */

/** Matches a revision suffix at the very end: -R2, -R17. Not -RUSH, not -R. */
const SUFFIX_RE = /-R(\d+)$/;

/** The order number without its revision suffix. Already-base numbers are
 *  returned unchanged. */
export function baseSoNo(soNo: string): string {
  return soNo.replace(SUFFIX_RE, "");
}

/** The revision a number already carries; 1 when it has no suffix (the
 *  original IS revision 1). */
export function revisionOfSoNo(soNo: string): number {
  const m = SUFFIX_RE.exec(soNo);
  return m?.[1] ? Number(m[1]) : 1;
}

/**
 * The number for revision `n` of this order. `n <= 1` returns the base, because
 * "SM9579-SO01-R1" is a name for a thing that is just called SM9579-SO01.
 */
export function revisionSoNo(soNo: string, n: number): string {
  const base = baseSoNo(soNo);
  return n > 1 ? `${base}-R${n}` : base;
}
