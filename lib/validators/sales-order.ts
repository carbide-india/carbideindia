import { z } from "zod";

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
 * link (autofills price/timeline); soNo is the auto-number fallback. A Sales
 * Order has no status *enum* — its only state toggle is `customerSoSent`.
 */
const SalesOrderFieldsSchema = z.object({
  inquiryId: z.string().uuid(),
  quotationId: z.string().uuid().optional(),
  soNo: OptionalText(60), // blank → auto-derived `<SM>-SO01`
  // Product (editable snapshot from the SM — form value wins over autofetch)
  custProductName: OptionalText(300),
  qty: Qty,
  partNo: OptionalText(120),
  // Pricing / timeline (autofilled from the linked quotation)
  quotePrice: Money,
  developmentTime: OptionalText(120),
  deliveryTime: OptionalText(120),
  validity: OptionalText(120),
  quotationLink: OptionalText(2000),
  // Customer PO
  customerPoNo: OptionalText(120),
  customerPoDate: z.string().optional(), // ISO date
  customerPoLink: OptionalText(2000),
  // Sales Order docs
  customerSoLink: OptionalText(2000),
  customerSoSent: z.boolean().default(false),
  productionSoLink: OptionalText(2000),
});

export const CreateSalesOrderSchema = SalesOrderFieldsSchema;
export type CreateSalesOrderInput = z.input<typeof CreateSalesOrderSchema>;

export const UpdateSalesOrderSchema = SalesOrderFieldsSchema.extend({
  inquiryId: z.string().uuid().optional(),
  customerSoSent: z.boolean(),
})
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateSalesOrderInput = z.input<typeof UpdateSalesOrderSchema>;

/** The SO has no status enum — the only "status" toggle is SO-sent. */
export const SetSalesOrderSentSchema = z.object({ sent: z.boolean() });
