import { z } from "zod";
import { COSTING_TYPES } from "@/db/enums";

const OptText = (max: number) =>
  z.string().trim().max(max).transform((s) => (s === "" ? undefined : s)).optional();
const Num = z.coerce.number().nonnegative().optional();

/**
 * Create-an-Item input. Almost everything is optional — most descriptive
 * fields auto-pull from the source enquiry, and the item code is generated
 * server-side from the classification + dimensions.
 */
export const CreateItemSchema = z.object({
  inquiryId: z.string().uuid().optional(),
  smNumber: OptText(40),
  customerName: OptText(200),
  custProductName: OptText(240),
  custDrawingNo: OptText(120),
  drawingRevisionNo: OptText(60),
  qty: Num,
  // Classification (code-bearing masters). sizeCode is derived when omitted.
  sizeCode: OptText(4),
  shapeId: z.string().uuid().optional(),
  internalGradeId: z.string().uuid().optional(),
  toleranceId: z.string().uuid().optional(),
  conditionId: z.string().uuid().optional(),
  gradeCustomer: OptText(120),
  gradeNameForCust: OptText(120),
  // Dimensions + the unit they're expressed in (mm / cm / m / inch).
  outerDia: Num, innerDia: Num, length: Num, width: Num, thickness: Num,
  dimensionUnit: OptText(8),
  dimensionNotes: OptText(2000),
  // Part identity + quotation lines.
  partNo: OptText(120),
  partDescription1: OptText(240),
  partDescription2: OptText(240),
  partDescription3: OptText(240),
  partDescription4: OptText(240),
  partTag: OptText(120),
  costingType: z.enum(COSTING_TYPES).optional(),
  // Tax & units (ERP Phase 3). Excluded from the dedup fingerprint.
  hsnCode: OptText(20),
  uom: OptText(20),
  altUom: OptText(20),
  altUomConversion: Num,
});
export type CreateItemInput = z.input<typeof CreateItemSchema>;
