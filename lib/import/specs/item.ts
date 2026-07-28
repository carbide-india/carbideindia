import type { ImportSpec } from "@/lib/import/engine/spec";
import { COSTING_TYPES, COSTING_TYPE_LABELS } from "@/db/enums";

const costingEnum = COSTING_TYPES.map((v) => ({ value: v, label: COSTING_TYPE_LABELS[v] }));

/**
 * Item Master bulk-import spec. Mirrors the single-record New Item form: the
 * classification masters (Shape/Grade/Tolerance/Condition) resolve by name,
 * dimensions and descriptive fields map straight onto CreateItemSchema, and
 * the internal item code is generated server-side by createItem.
 */
export const itemImportSpec: ImportSpec = {
  formKey: "item", title: "Item", basePath: "/masters/product_master",
  fields: [
    { key: "shapeId", header: "Shape", type: "ref", ref: { kind: "shape", allowCreate: true }, example: "Round" },
    { key: "internalGradeId", header: "Internal Grade", type: "ref", ref: { kind: "grade", allowCreate: true }, example: "CIF06" },
    { key: "toleranceId", header: "Tolerance", type: "ref", ref: { kind: "tolerance", allowCreate: true }, example: "h6" },
    { key: "conditionId", header: "Condition", type: "ref", ref: { kind: "condition", allowCreate: true }, example: "Sintered" },
    { key: "outerDia", header: "Outer Dia", type: "number", min: 0, example: "12.5" },
    { key: "innerDia", header: "Inner Dia", type: "number", min: 0, example: "4" },
    { key: "length", header: "Length", type: "number", min: 0, example: "50" },
    { key: "width", header: "Width", type: "number", min: 0 },
    { key: "thickness", header: "Thickness", type: "number", min: 0 },
    { key: "dimensionNotes", header: "Dimension Notes", type: "text", maxLen: 2000 },
    { key: "gradeCustomer", header: "Customer Grade", type: "text", maxLen: 120 },
    { key: "gradeNameForCust", header: "Grade For Customer", type: "text", maxLen: 120 },
    { key: "partNo", header: "Part No", type: "text", maxLen: 120 },
    { key: "partDescription1", header: "Part Desc 1", type: "text", maxLen: 240 },
    { key: "partDescription2", header: "Part Desc 2", type: "text", maxLen: 240 },
    { key: "partDescription3", header: "Part Desc 3", type: "text", maxLen: 240 },
    { key: "partDescription4", header: "Part Desc 4", type: "text", maxLen: 240 },
    { key: "partTag", header: "Part Tag", type: "text", maxLen: 120 },
    { key: "costingType", header: "Costing Type", type: "enum", enumValues: costingEnum, example: "In-house" },
    { key: "hsnCode", header: "HSN", type: "text", maxLen: 20 },
    { key: "uom", header: "UoM", type: "text", maxLen: 20, example: "Nos" },
    { key: "altUom", header: "Alt UoM", type: "text", maxLen: 20 },
    { key: "customerName", header: "Customer", type: "text", maxLen: 200 },
    { key: "smNumber", header: "SM Number", type: "text", maxLen: 40 },
    { key: "custProductName", header: "Cust Product Name", type: "text", maxLen: 240 },
    { key: "custDrawingNo", header: "Drawing No", type: "text", maxLen: 120 },
    { key: "drawingRevisionNo", header: "Drawing Rev", type: "text", maxLen: 60 },
    { key: "qty", header: "Qty", type: "number", min: 0 },
  ],
};
