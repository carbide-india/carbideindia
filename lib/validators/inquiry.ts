import { z } from "zod";
import {
  INQUIRY_PRIORITIES, INQUIRY_SOURCES, INQUIRY_CURRENCIES, INQUIRY_COUNTRIES,
  CHECK_STATES, QUANTITY_UOMS, DOC_GIVEN_OPTIONS, INQUIRY_SHAPES,
  ENQUIRY_STATUSES, FEAS_VERDICTS, RECHECK_STATES, FEASIBILITY_STATUSES, FEAS_PRIORITIES,
} from "@/db/enums";

const Trimmed = (max: number) => z.string().trim().max(max);
/**
 * Optional free-text field: trims, caps length, and folds empty strings to
 * `undefined` so half-filled form inputs never persist as `""`.
 */
const OptionalText = (max = 500) =>
  Trimmed(max).transform((s) => (s === "" ? undefined : s)).optional();

// ── Per-product item schema (used by inquiry_items child table) ──────────────
const ItemNum = z.coerce.number().nonnegative().optional();
export const ProductItemSchema = z.object({
  custProductName:   OptionalText(240),
  custDrawingNo:     OptionalText(120),
  drawingRevisionNo: OptionalText(60),
  shape:             z.enum(INQUIRY_SHAPES).optional(),
  outerDia: ItemNum, innerDia: ItemNum, length: ItemNum, width: ItemNum, thickness: ItemNum,
  dimensionNotes: OptionalText(2000),
  gradeId:     z.string().uuid().optional(),
  gradeCustomer: OptionalText(120),
  toleranceId:  z.string().uuid().optional(),
  conditionId:  z.string().uuid().optional(),
  quantityNos:  ItemNum,
  quantityUom:  z.string().trim().max(20).optional(),
});
export type ProductItemInput = z.input<typeof ProductItemSchema>;

/**
 * Base field set shared by Create/Update. Kept as a plain `z.object` because
 * zod v4's `.refine()` result has no `.innerType()` — Create adds the
 * clientMode refinement on top, Update derives a partial patch from here.
 */
const InquiryFieldsSchema = z.object({
  clientMode: z.enum(["new", "old"]),
  clientId: z.string().uuid().optional(),
  enquiryDate: z.string().optional(),                 // ISO date; defaults server-side to now
  priority: z.enum(INQUIRY_PRIORITIES),
  source: z.enum(INQUIRY_SOURCES).optional(),
  companyName: Trimmed(160).min(1, "Company name is required"),
  export: z.boolean().optional(),
  currency: z.enum(INQUIRY_CURRENCIES),
  country: z.enum(INQUIRY_COUNTRIES),
  state: OptionalText(80), city: OptionalText(80),
  addressLine1: OptionalText(240), addressLine2: OptionalText(240),
  addressLine3: OptionalText(240), addressLine4: OptionalText(240),
  pinCode: OptionalText(20),
  contactFirstName: OptionalText(80), contactLastName: OptionalText(80),
  contactNo: OptionalText(40), contactEmail: OptionalText(160), ccEmails: OptionalText(500),
  productDescription: Trimmed(2000).min(1, "Product description is required"),
  quantityStatus: z.enum(CHECK_STATES).optional(),
  quantityNos: z.number().positive("Quantity must be positive").optional(),
  quantityUom: z.enum(QUANTITY_UOMS).default("Nos"),
  docsGiven: z.array(z.enum(DOC_GIVEN_OPTIONS)).optional(),
  shapeDimensionCheck: z.enum(CHECK_STATES).optional(),
  gradeCheck: z.enum(CHECK_STATES).optional(),
  toleranceCheck: z.enum(CHECK_STATES).optional(),
  conditionCheck: z.enum(CHECK_STATES).optional(),
  sampleReceived: z.boolean().optional(),
  shape: z.enum(INQUIRY_SHAPES).optional(),
  outerDia: z.number().nonnegative().optional(), innerDia: z.number().nonnegative().optional(),
  length: z.number().nonnegative().optional(), width: z.number().nonnegative().optional(),
  thickness: z.number().nonnegative().optional(),
  dimensionNotes: OptionalText(1000),
  gradeId: z.string().uuid().optional(), toleranceId: z.string().uuid().optional(),
  conditionId: z.string().uuid().optional(),
  smFolderLink: OptionalText(500),
  enquiryNotes: OptionalText(2000),
  assignedSalesPersonId: z.string().uuid().optional(),
  products: z.array(ProductItemSchema).optional(),
});

export const CreateInquirySchema = InquiryFieldsSchema.refine(
  (v) => v.clientMode === "new" || !!v.clientId,
  { message: "Pick the existing client", path: ["clientId"] },
);
export type CreateInquiryInput = z.infer<typeof CreateInquirySchema>;

/**
 * Patch-shaped schema for edits — every field optional, unknown keys
 * rejected, empty patches rejected. `quantityUom` is re-declared without its
 * default: otherwise `.partial()` would inject `"Nos"` into every patch and
 * an empty `{}` would sail past the nonempty refine.
 */
export const UpdateInquirySchema = InquiryFieldsSchema
  // Product edits are not yet wired to inquiry_items (Phase B). Omit `products`
  // so the strict update schema rejects it instead of accepting-then-ignoring it.
  .omit({ products: true })
  .extend({ quantityUom: z.enum(QUANTITY_UOMS) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });

export const SetEnquiryStatusSchema = z.object({ status: z.enum(ENQUIRY_STATUSES) });

export const SaveFeasibilitySchema = z
  .object({
    feasShapeDimensionVerdict: z.enum(FEAS_VERDICTS).optional(),
    feasGradeVerdict: z.enum(FEAS_VERDICTS).optional(),
    feasToleranceVerdict: z.enum(FEAS_VERDICTS).optional(),
    feasConditionVerdict: z.enum(FEAS_VERDICTS).optional(),
    feasPriority: z.enum(FEAS_PRIORITIES).optional(),
    feasExport: z.boolean().optional(),
    feasSizeDrawingCheck: z.enum(RECHECK_STATES).optional(),
    feasSizeDrawingNotes: OptionalText(1000),
    feasToleranceCheck: z.enum(RECHECK_STATES).optional(),
    feasToleranceNotes: OptionalText(1000),
    feasGradeAppCheck: z.enum(RECHECK_STATES).optional(),
    feasGradeAppNotes: OptionalText(1000),
    feasQuantityCheck: z.enum(RECHECK_STATES).optional(),
    feasQuantityNotes: OptionalText(1000),
    feasConditionCheck: z.enum(RECHECK_STATES).optional(),
    feasConditionNotes: OptionalText(1000),
    feasActionsList: OptionalText(2000),
    feasibilityCheckedById: z.string().uuid().optional(),
    assignedSalesPersonId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type SaveFeasibilityInput = z.infer<typeof SaveFeasibilitySchema>;

export const SetFeasibilityStatusSchema = z.object({ status: z.enum(FEASIBILITY_STATUSES) });
