export interface FieldChange { field: string; old: unknown; new: unknown }
/** Shallow per-field diff over the given keys; null/undefined treated equal. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of fields) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    const eq = a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));
    if (!eq) out.push({ field: f, old: before[f] ?? null, new: after[f] ?? null });
  }
  return out;
}
