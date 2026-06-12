import { z } from "zod";
import { COSTING_DONE_STATUSES } from "@/db/enums";

const Trimmed = (max: number) => z.string().trim().max(max);
/**
 * Optional free-text field: trims, caps length, and folds empty strings to
 * `undefined` so half-filled form inputs never persist as `""`.
 */
const OptionalText = (max = 500) =>
  Trimmed(max)
    .transform((s) => (s === "" ? undefined : s))
    .optional();
/** Money: the form sends a number; stored numeric. Non-negative, optional. */
const Money = z.number().nonnegative().optional();
/** Quantity: the form sends a number; stored numeric. Non-negative, optional. */
const Qty = z.number().nonnegative().optional();

/**
 * Base field set shared by Create/Update — same base-object + derive pattern
 * as lib/validators/sample.ts (zod v4 has no `.innerType()` to unwrap).
 * inquiryId is required (a quote is always keyed to an SM); quoteNo is the
 * optional auto-number fallback. Enum fields default to their first option.
 */
const QuotationFieldsSchema = z.object({
  inquiryId: z.string().uuid(),
  quoteNo: OptionalText(60), // blank → auto-derived `<SM>-Q01`
  // Product / drawing / grade (editable snapshot from the SM)
  custProductName: OptionalText(300),
  qty: Qty,
  custDrawingNo: OptionalText(120),
  drawingRevisionNo: OptionalText(60),
  gradeCustomer: OptionalText(120),
  gradeNameForCust: OptionalText(120),
  tolerance: OptionalText(120),
  condition: OptionalText(120),
  partNo: OptionalText(120),
  // Pricing
  finalCost: Money,
  negotiation: Money,
  quotePrice: Money,
  // Timeline & validity
  developmentTime: OptionalText(120),
  deliveryTime: OptionalText(120),
  validity: OptionalText(120),
  // Status
  costingDoneStatus: z.enum(COSTING_DONE_STATUSES).default("not_done"),
  quotationLink: OptionalText(2000),
  quoteSent: z.boolean().default(false),
});

export const CreateQuotationSchema = QuotationFieldsSchema;
export type CreateQuotationInput = z.input<typeof CreateQuotationSchema>;

/**
 * Patch-shaped schema for edits — every field optional, unknown keys rejected,
 * empty patches rejected. Defaulted fields are re-declared without their
 * defaults: otherwise `.partial()` would inject the first-option defaults into
 * every patch and an empty `{}` would sail past the nonempty refine.
 */
export const UpdateQuotationSchema = QuotationFieldsSchema.extend({
  inquiryId: z.string().uuid().optional(),
  costingDoneStatus: z.enum(COSTING_DONE_STATUSES),
  quoteSent: z.boolean(),
})
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateQuotationInput = z.input<typeof UpdateQuotationSchema>;

export const SetQuotationStatusSchema = z.object({
  status: z.enum(COSTING_DONE_STATUSES),
});
