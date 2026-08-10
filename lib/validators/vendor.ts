import { z } from "zod";
import { normalizeGstin, parseGstin } from "@/lib/data/gst";

/**
 * Vendor Master validators (Form 05). Mirrors the client validators' shape:
 * a trimmed required name, optional-text fields that fold `""` → `undefined`
 * (so a blank input never writes an empty string), and a coerced integer for
 * the default credit-days term the BO matrix pre-fills from.
 *
 * Client-safe on purpose (the vendor form imports the schema for its resolver),
 * so everything here stays pure — no server-only imports.
 */

// ── Website ────────────────────────────────────────────────────────────────
// Explicitly NOT compulsory. People type "carbideindia.com", "www.x.in" or a
// full URL; we store one canonical form so the record page can hyperlink it
// without guessing. Anything that isn't a plausible host is rejected rather
// than silently stored as a dead link.

/**
 * Canonicalize a typed website into a storable absolute URL, or null when the
 * input is blank / unusable. Adds `https://` when no scheme was typed, lowercases
 * the host, and drops a trailing slash on a bare-host URL.
 *   "carbideindia.com"        → "https://carbideindia.com"
 *   "WWW.Example.CO.IN/about" → "https://www.example.co.in/about"
 *   "not a url"               → null
 */
export function normalizeVendorWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // Reject anything with whitespace inside — that's prose, not a URL.
  if (/\s/.test(trimmed)) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A host must have a dot and a 2+ char TLD ("localhost", "foo" are not
  // vendor websites). Punycode/IDN hosts arrive already encoded by URL.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null;

  const out = url.toString();
  return url.pathname === "/" && !url.search && !url.hash ? out.replace(/\/$/, "") : out;
}

/** Optional website: blank → undefined, otherwise the canonical absolute URL. */
const OptionalWebsite = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    return v.trim() === "" ? undefined : v;
  },
  z
    .string()
    .max(300, "Website is too long")
    // Validate first, then store the canonical form — so the refine message is
    // what a bad value surfaces, never a null slipping through the transform.
    .refine(
      (v) => normalizeVendorWebsite(v) !== null,
      "Enter a valid website, e.g. carbideindia.com",
    )
    .transform((v) => normalizeVendorWebsite(v) ?? v.trim())
    .optional(),
);

// ── GSTIN ──────────────────────────────────────────────────────────────────
// Same number and the same checker the client KYC form uses (lib/data/gst.ts):
// normalize (uppercase, strip spaces/hyphens on paste) then format + state-code
// + checksum. The DB column is plain text by design — this is the ONLY place the
// 15-character shape is enforced, so overseas/legacy rows saved before this
// existed are never invalidated retroactively.

/** Optional GSTIN: blank → undefined, otherwise a normalized, checksum-valid GSTIN. */
const OptionalGstin = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    return v.trim() === "" ? undefined : normalizeGstin(v);
  },
  z
    .string()
    .refine((v) => parseGstin(v).valid, {
      message: "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5",
    })
    .optional(),
);

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
  // Legacy free-text address (hidden round-trip); structured fields below.
  address: OptionalText(500, "Address is too long"),
  addressLine1: OptionalText(200, "Address line is too long"),
  addressLine2: OptionalText(200, "Address line is too long"),
  addressLine3: OptionalText(200, "Address line is too long"),
  addressLine4: OptionalText(200, "Address line is too long"),
  city: OptionalText(120, "City is too long"),
  state: OptionalText(120, "State is too long"),
  pinCode: OptionalText(12, "PIN code is too long"),
  defaultCreditDays: OptionalCreditDays,
  paymentTerms: OptionalText(200, "Payment terms are too long"),
  // Toggle for non-GST vendors (migration 0062). Optional — omitted leaves it
  // undefined so createVendor can fold to the `true` default and updateVendor
  // only writes it when a caller actually sent the toggle.
  isGstApplicable: z.boolean().optional(),
  // The GST NUMBER itself (migration 0072). `isGstApplicable` only ever said
  // WHETHER GST applies; this is the number. Never compulsory — a vendor can be
  // saved before its GSTIN is known.
  gstin: OptionalGstin,
  // Vendor website. Explicitly NOT compulsory.
  website: OptionalWebsite,
  notes: OptionalText(2000, "Notes are too long"),
  sortOrder: z.number().int().min(0).max(9999).optional(),
};

export const CreateVendorSchema = z.object(VendorFields);
export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

export const UpdateVendorSchema = z.object(VendorFields);
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;
