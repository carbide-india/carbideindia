/**
 * Generic per-form drafts — one auto-saved draft store per sales form, keyed by
 * `form_drafts.formKey`. The New-Enquiry form keeps its own richer helpers
 * (`lib/drafts/enquiry-draft.ts`); THIS module powers drafts for every OTHER
 * form (KYC, Sample, Costing, Quotation, Negotiation, Sales Order, Meeting).
 * No DB / server-only import so it runs on client + server.
 */

export const FORM_DRAFT_KINDS = [
  "kyc",
  "sample",
  "costing",
  "quotation",
  "negotiation",
  "sales-order",
  "meeting",
] as const;
export type FormDraftKind = (typeof FORM_DRAFT_KINDS)[number];

export interface FormDraftMeta {
  noun: string;
  newRoute: string;
  draftsRoute: string;
  /** Ordered field names tried, in order, to derive a one-line draft label. */
  labelFields: string[];
}

export const FORM_DRAFT_META: Record<FormDraftKind, FormDraftMeta> = {
  kyc: { noun: "Client KYC", newRoute: "/clients/new", draftsRoute: "/clients/drafts", labelFields: ["name", "companyName"] },
  sample: { noun: "Sample", newRoute: "/samples/new", draftsRoute: "/samples/drafts", labelFields: ["sampleNo", "sampleNotes"] },
  costing: { noun: "Costing", newRoute: "/costings/new", draftsRoute: "/costings/drafts", labelFields: ["custProductName", "itemCode"] },
  quotation: { noun: "Quotation", newRoute: "/quotations/new", draftsRoute: "/quotations/drafts", labelFields: ["quoteNo", "companyName"] },
  negotiation: { noun: "Negotiation", newRoute: "/negotiations/new", draftsRoute: "/negotiations/drafts", labelFields: ["negotiationNo", "companyName"] },
  "sales-order": { noun: "Sales Order", newRoute: "/sales-orders/new", draftsRoute: "/sales-orders/drafts", labelFields: ["poNumber", "companyName"] },
  meeting: { noun: "Meeting", newRoute: "/meetings/new", draftsRoute: "/meetings/drafts", labelFields: ["companyName", "clientName", "title"] },
};

const KINDS = new Set<string>(FORM_DRAFT_KINDS);
export function isFormDraftKind(v: string): v is FormDraftKind {
  return KINDS.has(v);
}

/** The draft kind owning a route segment (e.g. "samples" → "sample"). */
export function draftKindForSegment(seg: string): FormDraftKind | null {
  switch (seg) {
    case "clients": return "kyc";
    case "samples": return "sample";
    case "costings": return "costing";
    case "quotations": return "quotation";
    case "negotiations": return "negotiation";
    case "sales-orders": return "sales-order";
    case "meetings": return "meeting";
    default: return null;
  }
}

const nonEmpty = (v: unknown): boolean =>
  (typeof v === "string" && v.trim().length > 0) ||
  (typeof v === "number" && Number.isFinite(v));

/** Best-effort one-line summary for the Drafts list. */
export function genericDraftLabel(
  payload: Record<string, unknown>,
  meta: FormDraftMeta,
): string {
  for (const f of meta.labelFields) {
    const v = payload[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return `Untitled ${meta.noun.toLowerCase()}`;
}

/** Guard: skip essentially-empty payloads so typing nothing never saves a draft. */
export function genericHasContent(payload: Record<string, unknown>): boolean {
  return Object.entries(payload).some(([k, v]) => {
    if (k === "id" || k.endsWith("At")) return false;
    if (Array.isArray(v)) {
      return v.some(
        (x) => x != null && (typeof x !== "object" || Object.values(x as object).some(nonEmpty)),
      );
    }
    if (v != null && typeof v === "object") return Object.values(v).some(nonEmpty);
    return nonEmpty(v);
  });
}

/** How full the draft is (0–100), by fraction of top-level fields with a value. */
export function genericCompleteness(payload: Record<string, unknown>): number {
  const entries = Object.entries(payload).filter(([k]) => k !== "id" && !k.endsWith("At"));
  if (entries.length === 0) return 0;
  const filled = entries.filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    if (v != null && typeof v === "object") return Object.values(v).some(nonEmpty);
    return nonEmpty(v);
  }).length;
  return Math.round((filled / entries.length) * 100);
}
