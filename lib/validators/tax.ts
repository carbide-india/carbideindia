import { z } from "zod";

/**
 * Zod contracts for admin → Tax & GST.  Lives outside the "use server" file so
 * the dialogs can reuse the inferred input types (a "use server" module may
 * only export async functions).
 *
 * The CGST/SGST/IGST relationship is not a UI nicety — it is Indian GST law:
 * an intra-state supply splits the rate exactly in half across CGST and SGST,
 * an inter-state supply puts the whole rate on IGST.  Both invariants are
 * enforced here so a hostile client cannot persist a rate that would make an
 * invoice arithmetically wrong.
 */

/** Percent equality with a paisa-safe tolerance (numeric(…) round-trips). */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

const Percent = z
  .number({ message: "Enter a percentage" })
  .refine((n) => Number.isFinite(n), { message: "Enter a percentage" })
  .refine((n) => n >= 0, { message: "Percentage cannot be negative" })
  .refine((n) => n <= 100, { message: "Percentage cannot exceed 100" });

export const TaxRateIdSchema = z.string().uuid("Invalid tax rate id");
export const HsnCodeIdSchema = z.string().uuid("Invalid HSN code id");

const TaxRateFields = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label is required")
    .max(48, "Label is too long"),
  ratePercent: Percent,
  cgstPercent: Percent,
  sgstPercent: Percent,
  igstPercent: Percent,
  sortOrder: z.number().int().min(0).max(9999),
});

/** Same shape for create and update — the dialog always submits every field. */
const TaxRateSchema = TaxRateFields.refine(
  (v) => near(v.cgstPercent + v.sgstPercent, v.ratePercent),
  { message: "CGST + SGST must add up to the total rate.", path: ["cgstPercent"] },
).refine((v) => near(v.igstPercent, v.ratePercent), {
  message: "IGST must equal the total rate.",
  path: ["igstPercent"],
});

export const CreateTaxRateSchema = TaxRateSchema;
export type CreateTaxRateInput = z.infer<typeof CreateTaxRateSchema>;

export const UpdateTaxRateSchema = TaxRateSchema;
export type UpdateTaxRateInput = z.infer<typeof UpdateTaxRateSchema>;

/** HSN / SAC codes are 4, 6 or 8 digits; we accept 4-8 and strip separators. */
export const HsnCodeStringSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^0-9A-Za-z]/g, "").toUpperCase())
  .refine((v) => /^[0-9]{4,8}$/.test(v), {
    message: "HSN / SAC must be 4 to 8 digits.",
  });

export const HsnFieldsSchema = z.object({
  code: HsnCodeStringSchema,
  description: z
    .string()
    .trim()
    .max(240, "Description is too long")
    .nullable()
    .optional(),
  /** null = deliberately unmapped (falls back to the org default rate). */
  taxRateId: z.string().uuid("Invalid tax rate id").nullable().optional(),
  defaultUom: z
    .string()
    .trim()
    .max(20, "Unit is too long")
    .nullable()
    .optional(),
});
export type HsnFieldsInput = z.infer<typeof HsnFieldsSchema>;

/** Derive the statutory split from a total rate (half/half, IGST = full). */
export function deriveSplit(ratePercent: number): {
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
} {
  const half = Math.round((ratePercent / 2) * 1000) / 1000;
  return {
    cgstPercent: half,
    sgstPercent: Math.round((ratePercent - half) * 1000) / 1000,
    igstPercent: ratePercent,
  };
}
