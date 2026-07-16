import { z } from "zod";
import {
  INQUIRY_PRIORITIES, INQUIRY_SOURCES,
  CHECK_STATES, DOC_GIVEN_OPTIONS, INQUIRY_SHAPES,
  ENQUIRY_STATUSES, FEAS_VERDICTS, RECHECK_STATES, FEASIBILITY_STATUSES, FEAS_PRIORITIES,
  FEAS_CHECK_VERDICTS,
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
  dimensionUnit: z.string().trim().max(20).optional(),
  dimensionNotes: OptionalText(2000),
  gradeId:     z.string().uuid().optional(),
  gradeCustomer: OptionalText(120),
  toleranceId:  z.string().uuid().optional(),
  conditionId:  z.string().uuid().optional(),
  quantityNos:  ItemNum,
  quantityUom:  z.string().trim().max(20).optional(),
  /** Pre-registered Sample Register row linked to this product line. Persisted
   *  via the sample's back-link (samples.inquiry_item_id / inquiry_id), not an
   *  inquiry_items column. */
  sampleId:     z.string().uuid().optional(),
  // ── Per-product enquiry checklist (Given / Not Given / Assumed) ──
  quantityStatus:      z.enum(CHECK_STATES).optional(),
  shapeDimensionCheck: z.enum(CHECK_STATES).optional(),
  gradeCheck:          z.enum(CHECK_STATES).optional(),
  toleranceCheck:      z.enum(CHECK_STATES).optional(),
  conditionCheck:      z.enum(CHECK_STATES).optional(),
  assumedQuantity:       OptionalText(200),
  assumedShapeDimension: OptionalText(200),
  assumedGrade:          OptionalText(200),
  assumedTolerance:      OptionalText(200),
  assumedCondition:      OptionalText(200),
  docsGiven:      z.array(z.enum(DOC_GIVEN_OPTIONS)).optional(),
  sampleReceived: z.boolean().optional(),
  /** Per-product "Product Description" (shown at the bottom of each product). */
  description:    OptionalText(2000),
});
export type ProductItemInput = z.input<typeof ProductItemSchema>;

/**
 * Base field set shared by Create/Update. Kept as a plain `z.object` because
 * zod v4's `.refine()` result has no `.innerType()` - Create adds the
 * clientMode refinement on top, Update derives a partial patch from here.
 */
const InquiryFieldsSchema = z.object({
  clientMode: z.enum(["new", "old"]),
  clientId: z.string().uuid().optional(),
  enquiryDate: z.string().optional(),                 // ISO date; defaults server-side to now
  priority: z.enum(INQUIRY_PRIORITIES),
  source: z.enum(INQUIRY_SOURCES).optional(),
  firstEnquiry: z.boolean().optional(),               // is this the client's first enquiry?
  companyName: Trimmed(160).min(1, "Company name is required"),
  export: z.boolean().optional(),
  // Currency / Country are editable dropdowns (ENQ Dropdown Master) - free
  // strings rather than a fixed enum. Defaults keep new enquiries on INR/India.
  currency: z.string().trim().min(1).max(40).default("INR"),
  country: z.string().trim().min(1).max(80).default("India"),
  state: OptionalText(80), city: OptionalText(80),
  addressLine1: OptionalText(240), addressLine2: OptionalText(240),
  addressLine3: OptionalText(240), addressLine4: OptionalText(240),
  pinCode: OptionalText(20),
  contactFirstName: OptionalText(80), contactLastName: OptionalText(80),
  contactNo: OptionalText(40), contactEmail: OptionalText(160), ccEmails: OptionalText(500),
  extraContacts: z
    .array(
      z.object({
        firstName: OptionalText(80),
        lastName: OptionalText(80),
        contactNo: OptionalText(40),
        email: OptionalText(160),
      }),
    )
    .optional(),
  // Header-level description is now derived from the first product's description
  // (the checklist + description moved into each product card). Kept optional so
  // the create action can mirror product[0].description into the inquiry column.
  productDescription: Trimmed(2000).optional(),
  quantityStatus: z.enum(CHECK_STATES).optional(),
  quantityNos: z.number().positive("Quantity must be positive").optional(),
  quantityUom: z.string().trim().min(1).max(20).default("Nos"),
  docsGiven: z.array(z.enum(DOC_GIVEN_OPTIONS)).optional(),
  shapeDimensionCheck: z.enum(CHECK_STATES).optional(),
  gradeCheck: z.enum(CHECK_STATES).optional(),
  toleranceCheck: z.enum(CHECK_STATES).optional(),
  conditionCheck: z.enum(CHECK_STATES).optional(),
  sampleReceived: z.boolean().optional(),
  assumedValues: z
    .object({
      quantity: OptionalText(200),
      shapeDimension: OptionalText(200),
      grade: OptionalText(200),
      tolerance: OptionalText(200),
      condition: OptionalText(200),
    })
    .optional(),
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
  departmentId: z.string().uuid().optional(),
  products: z.array(ProductItemSchema).optional(),
});

export const CreateInquirySchema = InquiryFieldsSchema.refine(
  (v) => v.clientMode === "new" || !!v.clientId,
  { message: "Pick the existing client", path: ["clientId"] },
);
export type CreateInquiryInput = z.infer<typeof CreateInquirySchema>;

/**
 * Patch-shaped schema for edits - every field optional, unknown keys
 * rejected, empty patches rejected. `quantityUom` is re-declared without its
 * default: otherwise `.partial()` would inject `"Nos"` into every patch and
 * an empty `{}` would sail past the nonempty refine.
 */
export const UpdateInquirySchema = InquiryFieldsSchema
  // Product edits are not yet wired to inquiry_items (Phase B). Omit `products`
  // so the strict update schema rejects it instead of accepting-then-ignoring it.
  .omit({ products: true })
  // Re-declare the columns that carry a `.default()` WITHOUT it — otherwise
  // `.partial()` still injects the default on an empty patch, so `{}` would
  // sail past the nonempty refine AND silently reset currency/country/UoM.
  .extend({
    quantityUom: z.string().trim().min(1).max(20),
    currency: z.string().trim().min(1).max(40),
    country: z.string().trim().min(1).max(80),
  })
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

// ── Whole primary-feasibility screen: SM-level fields + per-product verdicts ──
const FeasProduct = z.object({
  inquiryItemId: z.string().uuid(),
  shapeDimVerdict: z.enum(FEAS_CHECK_VERDICTS).optional(),
  gradeVerdict: z.enum(FEAS_CHECK_VERDICTS).optional(),
  toleranceVerdict: z.enum(FEAS_CHECK_VERDICTS).optional(),
  conditionVerdict: z.enum(FEAS_CHECK_VERDICTS).optional(),
  quantityVerdict: z.enum(FEAS_CHECK_VERDICTS).optional(),
  shapeDimNote: OptionalText(1000),
  gradeNote: OptionalText(1000),
  toleranceNote: OptionalText(1000),
  conditionNote: OptionalText(1000),
  quantityNote: OptionalText(1000),
});

export const SaveFeasibilityFullSchema = z.object({
  sm: z
    .object({
      feasPriority: z.enum(FEAS_PRIORITIES).optional(),
      feasExport: z.boolean().optional(),
      feasActionsList: OptionalText(2000),
      feasibilityCheckedById: z.string().uuid().optional(),
    })
    .strict(),
  status: z.enum(FEASIBILITY_STATUSES).optional(),
  products: z.array(FeasProduct),
}).strict();
export type SaveFeasibilityFullInput = z.infer<typeof SaveFeasibilityFullSchema>;
