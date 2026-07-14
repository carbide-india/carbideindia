/**
 * Pure form-helper utilities - no React dependency so they can be imported by
 * both client components and server-side unit tests without issue.
 */

/** Empty/null/NaN number inputs must reach zod as `undefined`, never NaN or "". */
export function toOptionalNumber(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}
