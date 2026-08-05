import { z } from "zod";

/**
 * Rates older than this are flagged for review — nothing is auto-fetched. Lives
 * here rather than in the query module so the client table can quote the same
 * number without pulling a `server-only` import into the browser bundle.
 */
export const RATE_STALE_DAYS = 30;

/** ISO-4217 shape: exactly three letters, always stored upper-case. */
const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

const CodeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(
    z
      .string()
      .regex(CURRENCY_CODE_RE, "Currency code must be three letters (e.g. USD)"),
  );

const NameSchema = z
  .string()
  .trim()
  .min(1, "Currency name is required")
  .max(60, "Currency name is too long");

const SymbolSchema = z.string().trim().max(6, "Symbol is too long");

/**
 * Rates travel as decimal STRINGS because postgres-js hands `numeric` back as a
 * string and we write it straight back — parsing once on the server keeps the
 * stored precision exactly as the admin typed it.
 */
const RateSchema = z
  .string()
  .trim()
  .min(1, "Exchange rate is required")
  .refine((v) => Number.isFinite(Number(v)), {
    message: "Exchange rate must be a number",
  })
  .refine((v) => Number(v) > 0, {
    message: "Exchange rate must be greater than zero",
  })
  .refine((v) => Number(v) < 1_000_000, {
    message: "Exchange rate is out of range",
  });

const SortOrderSchema = z.number().int().min(0).max(9999);

export const CurrencyIdSchema = z.string().uuid("Invalid currency id");

export const CreateCurrencySchema = z.object({
  code: CodeSchema,
  name: NameSchema,
  symbol: SymbolSchema.optional(),
  exchangeRateToInr: RateSchema,
  sortOrder: SortOrderSchema.optional(),
});
export type CreateCurrencyInput = z.input<typeof CreateCurrencySchema>;

export const UpdateCurrencySchema = z
  .object({
    code: CodeSchema.optional(),
    name: NameSchema.optional(),
    symbol: SymbolSchema.optional(),
    exchangeRateToInr: RateSchema.optional(),
    sortOrder: SortOrderSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateCurrencyInput = z.input<typeof UpdateCurrencySchema>;

/**
 * Optional money field on the wire: `null` or `""` both mean "clear it", a
 * non-empty value must parse as a non-negative number.
 */
const OptionalMoneySchema = z
  .string()
  .trim()
  .max(20, "Amount is too long")
  .nullable()
  .refine(
    (v) =>
      v === null ||
      v === "" ||
      (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1e15),
    { message: "Credit limit must be a non-negative amount" },
  );

export const UpdateCreditPolicySchema = z.object({
  defaultCreditDays: z
    .number()
    .int("Credit days must be a whole number")
    .min(0, "Credit days cannot be negative")
    .max(365, "Credit days cannot exceed 365"),
  defaultCreditLimit: OptionalMoneySchema,
  defaultPaymentTerms: z
    .string()
    .trim()
    .max(200, "Payment terms are too long")
    .nullable(),
});
export type UpdateCreditPolicyInput = z.input<typeof UpdateCreditPolicySchema>;

/**
 * Backfill is opt-in per field and only ever fills NULLs — an existing
 * per-client override is never overwritten.
 */
export const BackfillCreditDefaultsSchema = z
  .object({
    creditDays: z.boolean(),
    creditLimit: z.boolean(),
    paymentTerms: z.boolean(),
  })
  .refine((v) => v.creditDays || v.creditLimit || v.paymentTerms, {
    message: "Pick at least one field to backfill.",
  });
export type BackfillCreditDefaultsInput = z.input<
  typeof BackfillCreditDefaultsSchema
>;
