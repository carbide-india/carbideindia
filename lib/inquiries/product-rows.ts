import type { ProductItemInput } from "@/lib/validators/inquiry";
import type { CheckState } from "@/db/enums";

/** The subset of CreateInquiry input the product rows are built from. */
interface Src {
  products?: ProductItemInput[];
  productDescription?: string;
  shape?: string | null;
  outerDia?: number; innerDia?: number; length?: number; width?: number; thickness?: number;
  dimensionNotes?: string;
  gradeId?: string; toleranceId?: string; conditionId?: string;
  quantityNos?: number; quantityUom?: string;
  sampleId?: string;
}

const numStr = (v: unknown): string | null =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const txt = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

export interface BuiltProductRow {
  sortOrder: number;
  custProductName: string | null; custDrawingNo: string | null; drawingRevisionNo: string | null;
  shape: string | null;
  outerDia: string | null; innerDia: string | null; length: string | null; width: string | null; thickness: string | null;
  dimensionUnit: string;
  dimensionNotes: string | null;
  gradeId: string | null; gradeCustomer: string | null; toleranceId: string | null; conditionId: string | null;
  quantityNos: string | null; quantityUom: string;
  // ── Per-product checklist (real inquiry_items columns) ──
  quantityStatus: CheckState | null; shapeDimensionCheck: CheckState | null; gradeCheck: CheckState | null;
  toleranceCheck: CheckState | null; conditionCheck: CheckState | null;
  assumedQuantity: string | null; assumedShapeDimension: string | null; assumedGrade: string | null;
  assumedTolerance: string | null; assumedCondition: string | null;
  docsGiven: string[] | null; sampleReceived: boolean | null; description: string | null;
  /** NOT an inquiry_items column - carried through so the create action can
   *  back-link the chosen sample (samples.inquiry_item_id / inquiry_id). */
  sampleId: string | null;
}

/** Build the inquiry_items rows for an inquiry. Prefers products[]; otherwise
 *  synthesises one row from the legacy flat product fields (back-compat with
 *  the bulk importer + any caller that still sends a single product). */
export function productRowsForInquiry(v: Src): BuiltProductRow[] {
  const list = v.products && v.products.length
    ? v.products
    : [{
        custProductName: v.productDescription, shape: v.shape ?? undefined,
        outerDia: v.outerDia, innerDia: v.innerDia, length: v.length, width: v.width, thickness: v.thickness,
        dimensionNotes: v.dimensionNotes, gradeId: v.gradeId, toleranceId: v.toleranceId,
        conditionId: v.conditionId, quantityNos: v.quantityNos, quantityUom: v.quantityUom,
      } as ProductItemInput];
  return list.map((p, i) => ({
    sortOrder: i,
    custProductName: txt(p.custProductName), custDrawingNo: txt(p.custDrawingNo), drawingRevisionNo: txt(p.drawingRevisionNo),
    shape: txt(p.shape),
    outerDia: numStr(p.outerDia), innerDia: numStr(p.innerDia), length: numStr(p.length), width: numStr(p.width), thickness: numStr(p.thickness),
    dimensionUnit: txt(p.dimensionUnit) ?? "mm",
    dimensionNotes: txt(p.dimensionNotes),
    gradeId: txt(p.gradeId), gradeCustomer: txt(p.gradeCustomer), toleranceId: txt(p.toleranceId), conditionId: txt(p.conditionId),
    quantityNos: numStr(p.quantityNos), quantityUom: txt(p.quantityUom) ?? "Nos",
    quantityStatus: p.quantityStatus ?? null, shapeDimensionCheck: p.shapeDimensionCheck ?? null,
    gradeCheck: p.gradeCheck ?? null, toleranceCheck: p.toleranceCheck ?? null, conditionCheck: p.conditionCheck ?? null,
    assumedQuantity: txt(p.assumedQuantity), assumedShapeDimension: txt(p.assumedShapeDimension),
    assumedGrade: txt(p.assumedGrade), assumedTolerance: txt(p.assumedTolerance), assumedCondition: txt(p.assumedCondition),
    docsGiven: p.docsGiven && p.docsGiven.length ? p.docsGiven : null,
    sampleReceived: typeof p.sampleReceived === "boolean" ? p.sampleReceived : null,
    description: txt(p.description),
    sampleId: txt(p.sampleId),
  }));
}
