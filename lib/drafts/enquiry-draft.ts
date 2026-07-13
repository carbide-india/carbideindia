/**
 * Pure helpers for New-Enquiry drafts — shared by the save action (server),
 * the drafts query (server), and the auto-save guard (client). No DB / no
 * server-only import so it can run anywhere.
 */

export interface EnquiryDraftProduct {
  custProductName?: string | null;
  shape?: string | null;
  gradeId?: string | null;
  toleranceId?: string | null;
  conditionId?: string | null;
  quantityNos?: number | string | null;
}

export interface EnquiryDraftPayload {
  clientId?: string | null;
  companyName?: string | null;
  contactFirstName?: string | null;
  contactNo?: string | null;
  enquiryDate?: string | null;
  assignedSalesPersonId?: string | null;
  products?: EnquiryDraftProduct[] | null;
  [key: string]: unknown;
}

const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

/** One-line summary shown in the Drafts list. */
export function deriveDraftLabel(p: EnquiryDraftPayload): string {
  const company = typeof p.companyName === "string" ? p.companyName.trim() : "";
  const firstProduct = (p.products ?? [])
    .map((x) => (typeof x?.custProductName === "string" ? x.custProductName.trim() : ""))
    .find(Boolean);
  if (company && firstProduct) return `${company} — ${firstProduct}`;
  if (company) return company;
  if (firstProduct) return firstProduct;
  return "Untitled enquiry";
}

/** Count products that have at least one filled field. */
export function draftProductCount(p: EnquiryDraftPayload): number {
  return (p.products ?? []).filter(
    (x) => x && (nonEmpty(x.custProductName) || nonEmpty(x.shape) || nonEmpty(x.gradeId) || x.quantityNos != null),
  ).length;
}

/** 0–100 completeness across the key enquiry fields. */
export function draftCompleteness(p: EnquiryDraftPayload): number {
  const products = p.products ?? [];
  const checks: boolean[] = [
    nonEmpty(p.clientId) || nonEmpty(p.companyName),
    nonEmpty(p.contactFirstName) || nonEmpty(p.contactNo),
    nonEmpty(p.enquiryDate),
    nonEmpty(p.assignedSalesPersonId),
    products.some((x) => nonEmpty(x?.custProductName)),
    products.some((x) => nonEmpty(x?.shape)),
    products.some((x) => nonEmpty(x?.gradeId)),
    products.some((x) => x?.quantityNos != null && String(x.quantityNos).trim() !== ""),
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

/** Guard: don't persist an essentially empty form (avoids junk drafts). */
export function draftHasContent(p: EnquiryDraftPayload): boolean {
  if (nonEmpty(p.clientId) || nonEmpty(p.companyName)) return true;
  return (p.products ?? []).some(
    (x) => x && (nonEmpty(x.custProductName) || nonEmpty(x.shape) || nonEmpty(x.gradeId) || x.quantityNos != null),
  );
}
