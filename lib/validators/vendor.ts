import { z } from "zod";

/**
 * Vendor Master validators (Form 05). Mirrors the client validators' shape:
 * a trimmed required name, optional-text fields that fold `""` → `undefined`
 * (so a blank input never writes an empty string), and a coerced integer for
 * the default credit-days term the BO matrix pre-fills from.
 */

const NameSchema = z
  .string()
  .trim()
  .min(1, "Vendor name is required")
  .max(160, "Vendor name is too long");

export const VendorIdSchema = z.string().uuid("Invalid vendor id");

/** Optional single-line text: blank → undefined, otherwise trimmed + capped. */
const OptionalText = (max: number, msg = "Too long") =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, msg).optional(),
  );

/** Optional email: blank → undefined, otherwise a validated address. */
const OptionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().email("Enter a valid email").max(200).optional(),
);

/** Optional whole-number credit days: blank/NaN → undefined. */
const OptionalCreditDays = z.preprocess(
  (v) => {
    if (v === "" || v == null) return undefined;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isNaN(n) ? v : n;
    }
    return v;
  },
  z
    .number()
    .int("Credit days must be a whole number")
    .min(0, "Credit days can't be negative")
    .max(3650, "Credit days is too large")
    .optional(),
);

const VendorFields = {
  name: NameSchema,
  contactPerson: OptionalText(120, "Contact person is too long"),
  contactNo: OptionalText(40, "Contact number is too long"),
  email: OptionalEmail,
  address: OptionalText(500, "Address is too long"),
  defaultCreditDays: OptionalCreditDays,
  paymentTerms: OptionalText(200, "Payment terms are too long"),
  // Toggle for non-GST vendors (migration 0062). Optional — omitted leaves it
  // undefined so createVendor can fold to the `true` default and updateVendor
  // only writes it when a caller actually sent the toggle.
  isGstApplicable: z.boolean().optional(),
  notes: OptionalText(2000, "Notes are too long"),
  sortOrder: z.number().int().min(0).max(9999).optional(),
};

export const CreateVendorSchema = z.object(VendorFields);
export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

export const UpdateVendorSchema = z.object(VendorFields);
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;
