/**
 * GSTIN intelligence — a GSTIN is the "master key" for the KYC form. From the
 * 15-character number we normalize, validate (format + checksum), and extract
 * the state (Place of Supply), the PAN, and the entity number. No server call.
 * Client-safe (pure functions + constant map).
 *
 * Layout: SS PPPPPPPPPP E Z C
 *   1-2   State code   (numeric)
 *   3-12  PAN          (5 letters, 4 digits, 1 letter)
 *   13    Entity no.   (1-9 or A-Z — Nth registration on this PAN)
 *   14    'Z'          (fixed)
 *   15    Check digit  (base-36 checksum)
 */

/** State code -> state / UT name (GSTN official codes). */
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli & Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

/** All GST state / UT names, sorted — the canonical option list for the State
 *  dropdown so any auto-detected state always matches an option. */
export const GST_STATE_NAMES: string[] = Array.from(
  new Set(Object.values(GST_STATE_CODES)),
).sort((a, b) => a.localeCompare(b));

/** Strip everything but A-Z / 0-9 and uppercase — handles pasted GSTINs with
 *  spaces/hyphens ("27 abcde-1234f1z5" -> "27ABCDE1234F1Z5"). */
export function normalizeGstin(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 15);
}

/** Structural GSTIN pattern (does not check the checksum). */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Official GSTIN check-digit (base-36, alternating 1/2 weights). */
function gstinChecksum(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = CHARSET.indexOf(first14[i]!);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = code * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checkCode = (36 - (sum % 36)) % 36;
  return CHARSET[checkCode]!;
}

export interface GstinParse {
  /** Normalized (uppercased, stripped) input. */
  normalized: string;
  /** true only when 15 chars, format + state code + checksum all pass. */
  valid: boolean;
  /** State code (first 2). */
  stateCode: string | null;
  /** State / UT name, or null if the code is unknown. */
  stateName: string | null;
  /** Chars 3-12. */
  pan: string | null;
  /** Char 13 — Nth registration on this PAN. */
  entityNumber: string | null;
  /** User-facing status: idle (still typing) / valid / a short error. */
  status: "idle" | "valid" | "invalid";
  error: string | null;
}

/**
 * Parse a raw GSTIN progressively. Partial fields are extracted as soon as
 * enough characters exist, so the form can auto-fill step by step:
 *   - 2 chars  -> state code -> state / country / currency
 *   - 12 chars -> PAN (chars 3-12)
 *   - 13 chars -> entity number
 *   - 15 chars -> full validity (format + state + checksum)
 * `status` stays "idle" until all 15 chars are typed; only then does a bad
 * number surface as "invalid".
 */
export function parseGstin(raw: string): GstinParse {
  const normalized = normalizeGstin(raw);
  const len = normalized.length;

  // Progressive extraction - available before the number is complete.
  const stateCode = len >= 2 ? normalized.slice(0, 2) : null;
  const stateName = stateCode ? (GST_STATE_CODES[stateCode] ?? null) : null;
  const pan = len >= 12 ? normalized.slice(2, 12) : null;
  const entityNumber = len >= 13 ? (normalized[12] ?? null) : null;

  const base: GstinParse = {
    normalized,
    valid: false,
    stateCode,
    stateName,
    pan,
    entityNumber,
    status: "idle",
    error: null,
  };

  // Still typing - expose partials but no verdict yet.
  if (len < 15) return base;

  if (!GSTIN_RE.test(normalized)) {
    return { ...base, status: "invalid", error: "Invalid GST format" };
  }
  if (!stateName) {
    return { ...base, status: "invalid", error: "Invalid state code" };
  }
  if (normalized[14] !== gstinChecksum(normalized.slice(0, 14))) {
    return { ...base, status: "invalid", error: "Invalid GST number" };
  }

  return { ...base, valid: true, status: "valid" };
}
