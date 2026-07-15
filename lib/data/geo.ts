/**
 * Country + Indian-state lists for the address dropdowns. Country names use the
 * short spellings that match `INQUIRY_COUNTRIES` (USA / UAE / UK …) so the KYC
 * form's "country auto-fills from registration" propagation lands on a real
 * option. State list is India's 28 states + 8 union territories (the primary
 * market); it's the searchable default for the State picker.
 */

export const COUNTRIES: readonly string[] = [
  "India",
  "USA",
  "UK",
  "UAE",
  "Australia",
  "Canada",
  "China",
  "Germany",
  "France",
  "Italy",
  "Spain",
  "Belgium",
  "Netherlands",
  "Switzerland",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Poland",
  "Portugal",
  "Ireland",
  "Austria",
  "Greece",
  "Russia",
  "Ukraine",
  "Turkey",
  "Japan",
  "South Korea",
  "Singapore",
  "Malaysia",
  "Indonesia",
  "Thailand",
  "Vietnam",
  "Philippines",
  "Bangladesh",
  "Sri Lanka",
  "Nepal",
  "Pakistan",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Oman",
  "Bahrain",
  "Israel",
  "Egypt",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Ethiopia",
  "Tanzania",
  "Morocco",
  "Brazil",
  "Argentina",
  "Chile",
  "Colombia",
  "Peru",
  "Mexico",
  "New Zealand",
  "Czech Republic",
  "Hungary",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Croatia",
  "Serbia",
  "Bulgaria",
  "Luxembourg",
  "Iceland",
  "Estonia",
  "Latvia",
  "Lithuania",
  "Others",
];

export const INDIAN_STATES: readonly string[] = [
  // States
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  // Union Territories
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

/**
 * Indian PIN → State autofill. India Post's first two digits identify the
 * postal circle, which maps to a state / UT. Boundary PINs (Haryana/Punjab,
 * Bihar/Jharkhand, the NE circles) are approximate, so callers should treat the
 * result as a suggestion and only fill when the field is still empty. Names
 * match INDIAN_STATES above so the value lands on a real dropdown option.
 */
const PIN2_TO_STATE: Record<string, string> = {
  11: "Delhi",
  12: "Haryana", 13: "Haryana",
  14: "Punjab", 15: "Punjab", 16: "Punjab",
  17: "Himachal Pradesh",
  18: "Jammu and Kashmir", 19: "Jammu and Kashmir",
  20: "Uttar Pradesh", 21: "Uttar Pradesh", 22: "Uttar Pradesh", 23: "Uttar Pradesh",
  24: "Uttar Pradesh", 25: "Uttar Pradesh", 26: "Uttar Pradesh", 27: "Uttar Pradesh", 28: "Uttar Pradesh",
  30: "Rajasthan", 31: "Rajasthan", 32: "Rajasthan", 33: "Rajasthan", 34: "Rajasthan",
  36: "Gujarat", 37: "Gujarat", 38: "Gujarat", 39: "Gujarat",
  40: "Maharashtra", 41: "Maharashtra", 42: "Maharashtra", 43: "Maharashtra", 44: "Maharashtra",
  45: "Madhya Pradesh", 46: "Madhya Pradesh", 47: "Madhya Pradesh", 48: "Madhya Pradesh",
  49: "Chhattisgarh",
  50: "Telangana",
  51: "Andhra Pradesh", 52: "Andhra Pradesh", 53: "Andhra Pradesh",
  56: "Karnataka", 57: "Karnataka", 58: "Karnataka", 59: "Karnataka",
  60: "Tamil Nadu", 61: "Tamil Nadu", 62: "Tamil Nadu", 63: "Tamil Nadu", 64: "Tamil Nadu",
  67: "Kerala", 68: "Kerala", 69: "Kerala",
  70: "West Bengal", 71: "West Bengal", 72: "West Bengal", 73: "West Bengal", 74: "West Bengal",
  75: "Odisha", 76: "Odisha", 77: "Odisha",
  78: "Assam",
  80: "Bihar", 84: "Bihar", 85: "Bihar",
  81: "Jharkhand", 82: "Jharkhand", 83: "Jharkhand",
};

// Finer 3-digit overrides where a 2-digit circle straddles states.
const PIN3_TO_STATE: Record<string, string> = {
  160: "Chandigarh", 682: "Kerala", 737: "Sikkim",
  744: "Andaman and Nicobar Islands",
  605: "Puducherry", 673: "Kerala",
  790: "Arunachal Pradesh", 791: "Arunachal Pradesh", 792: "Arunachal Pradesh",
  793: "Meghalaya", 794: "Meghalaya",
  795: "Manipur", 796: "Mizoram",
  797: "Nagaland", 798: "Nagaland", 799: "Tripura",
  // Uttarakhand pockets inside the 24x UP circle.
  246: "Uttarakhand", 247: "Uttarakhand", 248: "Uttarakhand", 249: "Uttarakhand",
};

/** Best-effort state for a 6-digit Indian PIN, or null when unresolved. */
export function pinToState(pin: string): string | null {
  const digits = pin.replace(/\D/g, "");
  if (digits.length < 3) return null;
  return PIN3_TO_STATE[digits.slice(0, 3)] ?? PIN2_TO_STATE[digits.slice(0, 2)] ?? null;
}

/** Map a GST state name ("Jammu & Kashmir") to the address-dropdown spelling
 *  ("Jammu and Kashmir"). Returns the input unchanged when already aligned. */
export function toAddressStateName(gstStateName: string): string {
  const mapped = gstStateName.replace(/ & /g, " and ");
  return (INDIAN_STATES as readonly string[]).includes(mapped) ? mapped : gstStateName;
}
