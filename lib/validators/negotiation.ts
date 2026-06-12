import { z } from "zod";
import { NEGOTIATION_STATUSES } from "@/db/enums";

const Trimmed = (max: number) => z.string().trim().max(max);
const OptionalText = (max = 500) =>
  Trimmed(max)
    .transform((s) => (s === "" ? undefined : s))
    .optional();
const Money = z.number().nonnegative().optional();
/** Quantity: the form sends a number; stored numeric. Non-negative, optional. */
const Qty = z.number().nonnegative().optional();

/**
 * Base field set shared by Create/Update — base-object + derive pattern
 * (zod v4 has no `.innerType()`). inquiryId required; quotationId optional
 * link (autofills price/timeline); negotiationNo is the auto-number fallback.
 */
const NegotiationFieldsSchema = z.object({
  inquiryId: z.string().uuid(),
  quotationId: z.string().uuid().optional(),
  negotiationNo: OptionalText(60), // blank → auto-derived `<SM>-N01`
  // Product (editable snapshot from the SM — form value wins over autofetch)
  custProductName: OptionalText(300),
  qty: Qty,
  partNo: OptionalText(120),
  // Pricing
  finalCost: Money,
  negotiation: Money,
  quotePrice: Money,
  // Timeline & validity
  developmentTime: OptionalText(120),
  deliveryTime: OptionalText(120),
  validity: OptionalText(120),
  // Status & notes
  quotationLink: OptionalText(2000),
  negotiationStatus: z.enum(NEGOTIATION_STATUSES).default("to_start"),
  negotiationNotes: OptionalText(2000),
});

export const CreateNegotiationSchema = NegotiationFieldsSchema;
export type CreateNegotiationInput = z.input<typeof CreateNegotiationSchema>;

export const UpdateNegotiationSchema = NegotiationFieldsSchema.extend({
  inquiryId: z.string().uuid().optional(),
  negotiationStatus: z.enum(NEGOTIATION_STATUSES),
})
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateNegotiationInput = z.input<typeof UpdateNegotiationSchema>;

export const SetNegotiationStatusSchema = z.object({
  status: z.enum(NEGOTIATION_STATUSES),
});
