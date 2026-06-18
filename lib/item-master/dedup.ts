/**
 * Item Master uniqueness fingerprint. Two products are "the same item" when
 * their shape, internal grade, condition, tolerance and all dimensions match
 * (Manan: "if [the dimensions are] unique create a new S.No; if not unique copy
 * from old data"). A UNIQUE index on this key makes reuse atomic.
 */
export interface DedupParts {
  shapeId?: string | null;
  internalGradeId?: string | null;
  conditionId?: string | null;
  toleranceId?: string | null;
  outerDia?: number | null;
  innerDia?: number | null;
  length?: number | null;
  width?: number | null;
  thickness?: number | null;
}

export function itemDedupKey(p: DedupParts): string {
  const ref = (v?: string | null) => (v ?? "").trim().toLowerCase();
  const dim = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "";
  return [
    ref(p.shapeId), ref(p.internalGradeId), ref(p.conditionId), ref(p.toleranceId),
    dim(p.outerDia), dim(p.innerDia), dim(p.length), dim(p.width), dim(p.thickness),
  ].join("|");
}
