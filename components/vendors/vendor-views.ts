import type { VendorRegisterRow } from "@/lib/queries/vendors";

/**
 * Vendor Master views — the KPI tiles above the register AND the filter they
 * apply are the same thing, so both are defined here once. Every tile's number
 * is `rows.filter(matchesVendorView(...)).length` over the SAME array the table
 * renders, which is why a tile can never disagree with the list it opens.
 *
 * Pure + client-safe (only a type is imported from the server-only query
 * module, and types are erased at compile time), so the unit test can import it
 * directly.
 */

export const VENDOR_VIEWS = [
  "all",
  "active",
  "inactive",
  "gst-missing",
  "no-attachment",
  "no-contact",
] as const;

export type VendorView = (typeof VENDOR_VIEWS)[number];

export function isVendorView(v: string | null | undefined): v is VendorView {
  return typeof v === "string" && (VENDOR_VIEWS as readonly string[]).includes(v);
}

/** True when a text field carries something a human could actually use. */
function filled(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Does this vendor belong in the given view?
 *
 * The four "what's still missing" views are deliberately scoped to ACTIVE
 * vendors only — a deactivated supplier with no GSTIN is not outstanding work,
 * and counting it would inflate the number Manan is meant to chase to zero. The
 * tiles label that scope explicitly so the count is never silently narrower
 * than it looks.
 */
export function matchesVendorView(row: VendorRegisterRow, view: VendorView): boolean {
  switch (view) {
    case "all":
      return true;
    case "active":
      return row.isActive;
    case "inactive":
      return !row.isActive;
    case "gst-missing":
      // Only vendors GST actually applies to. `isGstApplicable === false` is a
      // deliberate answer, not a gap.
      return row.isActive && row.isGstApplicable && !filled(row.gstin);
    case "no-attachment":
      return row.isActive && row.attachmentCount === 0;
    case "no-contact":
      // No way to reach them at all — not "some contact field is blank".
      return (
        row.isActive &&
        !filled(row.contactPerson) &&
        !filled(row.contactNo) &&
        !filled(row.email)
      );
  }
}

/** Every view's live count over one pass of the rows. */
export function countVendorViews(
  rows: readonly VendorRegisterRow[],
): Record<VendorView, number> {
  const out = Object.fromEntries(VENDOR_VIEWS.map((v) => [v, 0])) as Record<
    VendorView,
    number
  >;
  for (const row of rows) {
    for (const view of VENDOR_VIEWS) {
      if (matchesVendorView(row, view)) out[view] += 1;
    }
  }
  return out;
}

/** Tile copy — label plus the scope note that keeps each count defensible. */
export const VENDOR_VIEW_META: Record<
  VendorView,
  { label: string; sub?: string; accent: boolean }
> = {
  all: { label: "Total Vendors", accent: true },
  active: { label: "Active", accent: false },
  inactive: { label: "Deactivated", accent: false },
  "gst-missing": { label: "GST Number Missing", sub: "active · GST applicable", accent: false },
  "no-attachment": { label: "No Attachment", sub: "active vendors", accent: false },
  "no-contact": { label: "No Contact Detail", sub: "active vendors", accent: false },
};
