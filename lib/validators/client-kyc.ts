import { z } from "zod";
import {
  INQUIRY_CURRENCIES,
  INQUIRY_COUNTRIES,
  GST_REGISTRATION_TYPES,
  ADDRESS_TYPES,
} from "@/db/enums";

const Trimmed = (max: number) => z.string().trim().max(max);
/**
 * Optional free-text field: trims, caps length, and folds empty strings to
 * `undefined` so half-filled form inputs never persist as `""`.
 */
const OptionalText = (max = 500) =>
  Trimmed(max).transform((s) => (s === "" ? undefined : s)).optional();

/** "HH:MM" wall-clock time, stored as text on clients (sheet-true). */
const MeetingTime = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional();

/**
 * One normalized client address (ERP Phase 2 — Customer Master). Mirrors the
 * `client_addresses` child table: a typed address (registered / bill_to /
 * ship_to / consignee), optionally flagged primary, with free-text lines.
 */
export const ClientAddressSchema = z.object({
  addressType: z.enum(ADDRESS_TYPES),
  isPrimary: z.coerce.boolean().optional(),
  label: OptionalText(80),
  line1: OptionalText(240),
  line2: OptionalText(240),
  line3: OptionalText(240),
  line4: OptionalText(240),
  city: OptionalText(120),
  state: OptionalText(120),
  country: OptionalText(120),
  pinCode: OptionalText(20),
  gstin: OptionalText(40),
  notes: OptionalText(500),
});
export type ClientAddressInput = z.input<typeof ClientAddressSchema>;

/**
 * One normalized client bank account (ERP Phase 2 — Customer Master). Mirrors
 * the `client_bank_accounts` child table; each row optionally flagged primary.
 */
export const ClientBankAccountSchema = z.object({
  isPrimary: z.coerce.boolean().optional(),
  bankName: OptionalText(120),
  accountNo: OptionalText(60),
  ifsc: OptionalText(20),
  branch: OptionalText(120),
  accountHolder: OptionalText(120),
  accountType: OptionalText(40),
  notes: OptionalText(500),
});
export type ClientBankAccountInput = z.input<typeof ClientBankAccountSchema>;

/**
 * Base field set shared by Create/Update — same base-object + derive pattern
 * as lib/validators/inquiry.ts (zod v4 has no `.innerType()` to unwrap).
 * Address/contact fields mirror the inquiry form's client block; the
 * customer/industry/product ids point at admin-managed master options.
 */
const ClientKycFieldsSchema = z.object({
  name: Trimmed(160).min(1, "Client name is required"),
  customerTypeId: z.string().uuid().optional(),
  industryTypeId: z.string().uuid().optional(),
  productTypeIds: z.array(z.string().uuid()).optional(),
  export: z.boolean().optional(),
  currency: z.enum(INQUIRY_CURRENCIES).default("INR"),
  country: z.enum(INQUIRY_COUNTRIES).default("India"),
  state: OptionalText(80), city: OptionalText(80),
  addressLine1: OptionalText(240), addressLine2: OptionalText(240),
  addressLine3: OptionalText(240), addressLine4: OptionalText(240),
  pinCode: OptionalText(20),
  // ── Commercial / tax (Customer Master) ──
  gstin: OptionalText(40), panNo: OptionalText(20),
  // ── GST normalization (ERP Phase 2) ──
  gstRegistrationType: z.enum(GST_REGISTRATION_TYPES).optional(),
  placeOfSupply: OptionalText(60),
  isTransporter: z.coerce.boolean().optional(),
  // Normalized multi-address / multi-bank children (optional).
  addresses: z.array(ClientAddressSchema).optional(),
  bankAccounts: z.array(ClientBankAccountSchema).optional(),
  billToAddress: OptionalText(1000),
  paymentTerms: OptionalText(240), freightCharges: OptionalText(240),
  qtyDeviation: OptionalText(80),
  // Open, multi-value, optional categorization tags (Mining / Defense / …).
  tags: z.array(z.string().trim().min(1).max(40)).optional(),
  contactFirstName: OptionalText(80), contactLastName: OptionalText(80),
  contactDesignation: OptionalText(120),
  contactNo: OptionalText(40), contactEmail: OptionalText(160),
  // Client-level notes.
  notes: OptionalText(2000),
  // Primary contact notes.
  contactNotes: OptionalText(2000),
  // Additional (non-primary) contacts — optional array.
  additionalContacts: z.array(z.object({
    firstName: z.string().trim().max(80),
    lastName: OptionalText(80),
    designation: OptionalText(120),
    contactNo: OptionalText(40),
    email: OptionalText(160),
    notes: OptionalText(2000),
  })).optional(),
  // ── Credit & banking ──
  creditDays: z.coerce.number().int().nonnegative().optional(),
  creditLimit: z.coerce.number().nonnegative().optional(),
  bankName: OptionalText(120), bankAccountNo: OptionalText(60),
  bankIfsc: OptionalText(20), bankBranch: OptionalText(120),
  bankAccountHolder: OptionalText(120),
  // ── Logistics & compliance ──
  shipToAddress: OptionalText(1000),
  transporter: OptionalText(160),
  otherReferences: OptionalText(500),
  msmeUdyamNo: OptionalText(40),
  meetingDate: z.string().optional(),                 // ISO date
  meetingStart: MeetingTime,
  meetingEnd: MeetingTime,
  meetingNotes: OptionalText(2000),
  kycSalesPersonId: z.string().uuid().optional(),
  businessCardFrontUrl: OptionalText(2000),
  businessCardBackUrl: OptionalText(2000),
});

export const CreateClientKycSchema = ClientKycFieldsSchema;
export type CreateClientKycInput = z.input<typeof CreateClientKycSchema>;

/**
 * Patch-shaped schema for edits — every field optional, unknown keys
 * rejected, empty patches rejected. `currency`/`country` are re-declared
 * without their defaults: otherwise `.partial()` would inject INR/India into
 * every patch and an empty `{}` would sail past the nonempty refine.
 */
export const UpdateClientKycSchema = ClientKycFieldsSchema
  .extend({
    currency: z.enum(INQUIRY_CURRENCIES),
    country: z.enum(INQUIRY_COUNTRIES),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateClientKycInput = z.input<typeof UpdateClientKycSchema>;
