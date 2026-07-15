/**
 * Per-form "Custom" dropdown lists - the form-scoped option lists that live
 * outside the shared Masters module. Each form family that has custom lists
 * declares them here; this registry drives BOTH the "Custom" editor UI and the
 * seed/fallback defaults used until an admin edits a list.
 *
 * Shared / cross-form lists (Customer Type, Industry Type, …) stay in the
 * Masters module - do NOT add those here.
 *
 * No DB / server-only import - safe on client + server.
 */

import { BANKS, ACCOUNT_TYPES } from "@/lib/data/banks";
import { INDIAN_STATES } from "@/lib/data/geo";
import { INDIA_STATES } from "@/lib/data/india-states-cities";
import { SAMPLE_LOCATIONS, STAGE_LOCATIONS } from "@/db/enums";

/** Convenience default cities for the enquiry City list (the form still merges
 *  these with the built-in per-state cities). */
const MAJOR_CITIES = [
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune",
  "Ahmedabad", "Surat", "Nashik", "Nagpur", "Jaipur", "Indore", "Coimbatore",
  "Ludhiana", "Rajkot", "Faridabad", "Gurugram", "Noida", "Vadodara",
];

export interface CustomListDef {
  /** listKey stored on form_custom_options.list_key. */
  key: string;
  /** Human title shown in the editor + as the field label. */
  label: string;
  hint?: string;
  /** "number" lists format their labels (e.g. credit days/limit). */
  kind?: "text" | "number";
  /** Seed + fallback options (used until the list is edited). */
  defaults: string[];
}

export interface FormCustomListsDef {
  formKey: string;
  formLabel: string;
  /** Route of this form's Custom editor page. */
  editorRoute: string;
  lists: CustomListDef[];
}

export const CUSTOM_LISTS: Record<string, FormCustomListsDef> = {
  kyc: {
    formKey: "kyc",
    formLabel: "Client KYC",
    editorRoute: "/clients/custom",
    lists: [
      {
        key: "designation",
        label: "Designation",
        hint: "Contact person job titles.",
        defaults: [
          "Proprietor",
          "Director",
          "Partner",
          "CEO",
          "General Manager",
          "Purchase Manager",
          "Purchase Executive",
          "Procurement Head",
          "Production Manager",
          "Quality Manager",
          "Design Engineer",
          "Accountant",
          "Store In-charge",
        ],
      },
      {
        key: "payment_terms",
        label: "Payment Terms",
        defaults: [
          "Advance",
          "50% Advance, 50% on Delivery",
          "Against Delivery",
          "30 Days Credit",
          "45 Days Credit",
          "60 Days Credit",
          "As per PO",
        ],
      },
      {
        key: "freight_charges",
        label: "Freight Charges",
        defaults: ["Paid", "To Pay", "Extra at Actuals", "Included", "Ex-Works"],
      },
      {
        key: "credit_days",
        label: "Credit Days",
        kind: "number",
        defaults: ["0", "15", "30", "45", "60", "90"],
      },
      {
        key: "credit_limit",
        label: "Credit Limit",
        kind: "number",
        defaults: ["50000", "100000", "250000", "500000", "1000000"],
      },
      {
        key: "qty_deviation",
        label: "Quantity Deviation",
        defaults: ["±5%", "±10%", "±15%", "±20%", "As per PO"],
      },
      {
        key: "transporter",
        label: "Transporter",
        defaults: [
          "Blue Dart",
          "DTDC",
          "VRL",
          "Gati",
          "Delhivery",
          "Professional Couriers",
          "Other",
        ],
      },
      {
        key: "state",
        label: "State",
        hint: "The State dropdown on client addresses.",
        defaults: [...INDIAN_STATES],
      },
      {
        key: "account_type",
        label: "Account Type",
        hint: "Bank Details → Account Type.",
        defaults: [...ACCOUNT_TYPES],
      },
      {
        key: "bank_name",
        label: "Bank Name",
        hint: "Bank Details → Bank Name (searchable).",
        defaults: [...BANKS],
      },
    ],
  },
  enquiry: {
    formKey: "enquiry",
    formLabel: "New Enquiry",
    editorRoute: "/enquiries/custom",
    lists: [
      {
        key: "unit",
        label: "Unit",
        hint: "Dimension unit on each product.",
        defaults: ["mm", "cm", "m", "inch"],
      },
      {
        key: "state",
        label: "State",
        hint: "The State dropdown (India).",
        defaults: [...INDIA_STATES],
      },
      {
        key: "city",
        label: "City",
        hint: "Extra cities - merged on top of the built-in per-state list.",
        defaults: [...MAJOR_CITIES],
      },
    ],
  },
  sample: {
    formKey: "sample",
    formLabel: "Sample Register",
    editorRoute: "/samples/custom",
    lists: [
      {
        key: "sample_location",
        label: "Sample Location",
        hint: "Where the physical sample is kept.",
        defaults: [...SAMPLE_LOCATIONS],
      },
      {
        key: "stage_location",
        label: "Stage Location",
        hint: "Lab / vendor list used on each tracking stage.",
        defaults: [...STAGE_LOCATIONS],
      },
    ],
  },
};

/**
 * Editor grouping - the category each list sits under, and the section order.
 * Keeps the Custom Dropdown Master organised instead of one flat wall of cards.
 */
export const CUSTOM_LIST_CATEGORIES: Record<
  string,
  { order: string[]; of: Record<string, string> }
> = {
  kyc: {
    order: ["People", "Commercial Terms", "Banking", "Logistics", "Location"],
    of: {
      designation: "People",
      payment_terms: "Commercial Terms",
      freight_charges: "Commercial Terms",
      credit_days: "Commercial Terms",
      credit_limit: "Commercial Terms",
      qty_deviation: "Commercial Terms",
      account_type: "Banking",
      bank_name: "Banking",
      transporter: "Logistics",
      state: "Location",
    },
  },
  enquiry: {
    order: ["Dimensions", "Location"],
    of: {
      unit: "Dimensions",
      state: "Location",
      city: "Location",
    },
  },
  sample: {
    order: ["Location"],
    of: {
      sample_location: "Location",
      stage_location: "Location",
    },
  },
};

/** The category a list belongs to (falls back to "Other"). */
export function categoryFor(formKey: string, listKey: string): string {
  return CUSTOM_LIST_CATEGORIES[formKey]?.of[listKey] ?? "Other";
}

/** Is `listKey` a real list for `formKey`? Guards the server actions. */
export function isKnownCustomList(formKey: string, listKey: string): boolean {
  return Boolean(CUSTOM_LISTS[formKey]?.lists.some((l) => l.key === listKey));
}

/**
 * The custom-lists editor a route segment maps to (for the sidebar "Custom"
 * button). The clients family (and its /contacts book) own the KYC lists.
 */
export function customEditorForSegment(
  seg: string,
): { route: string; formKey: string } | null {
  const formKey =
    seg === "clients" || seg === "contacts"
      ? "kyc"
      : seg === "enquiries" || seg === "inquiries"
        ? "enquiry"
        : seg === "samples"
          ? "sample"
          : null;
  if (!formKey) return null;
  const def = CUSTOM_LISTS[formKey];
  return def ? { route: def.editorRoute, formKey } : null;
}
