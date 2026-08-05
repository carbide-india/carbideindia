/**
 * Import / Export hub catalogue (admin → System → Import / Export).
 *
 * Pure metadata + pure helpers: no DB access, no `server-only`, so the Server
 * Component page and the client cards can both read it. The importable side
 * reuses the SAME `ImportSpec` objects the per-module bulk-upload buttons use
 * (lib/import/specs/*), so a column added there shows up here automatically.
 */
import type { ImportField, ImportSpec, RefKind } from "@/lib/import/engine/spec";
import type { DataJobFormat } from "@/db/enums";
import { kycImportSpec } from "@/lib/import/specs/kyc";
import { enquiryImportSpec } from "@/lib/import/specs/enquiry";
import { itemImportSpec } from "@/lib/import/specs/item";
import { sampleImportSpec } from "@/lib/import/specs/sample";
import { meetingImportSpec } from "@/lib/import/specs/meeting";
import { quotationImportSpec } from "@/lib/import/specs/quotation";
import { negotiationImportSpec } from "@/lib/import/specs/negotiation";
import { salesOrderImportSpec } from "@/lib/import/specs/sales-order";

// ── Import side ────────────────────────────────────────────────────

export const IMPORT_ENTITY_KEYS = [
  "clients",
  "enquiries",
  "items",
  "samples",
  "meetings",
  "quotations",
  "negotiations",
  "salesOrders",
] as const;
export type ImportEntityKey = (typeof IMPORT_ENTITY_KEYS)[number];

export interface ImportCatalogEntry {
  key: ImportEntityKey;
  /** The spec that drives the template, the grid and the validation. */
  spec: ImportSpec;
  /** Plural noun for headings ("Clients", "Sales Orders"). */
  plural: string;
  /** What one row of the sheet becomes, in one sentence. */
  blurb: string;
  /** Which pipeline stage this feeds - groups the cards. */
  stage: "Masters" | "Sales pipeline";
}

/**
 * Every entity that can be bulk-imported, in pipeline order (KYC → Sample →
 * Enquiry → Costing → Quotation → Negotiation → Sales Order). Masters first
 * because a fresh install has to load Clients + Items before anything else
 * resolves.
 */
export const IMPORT_CATALOG: readonly ImportCatalogEntry[] = [
  {
    key: "clients",
    spec: kycImportSpec,
    plural: "Clients",
    blurb:
      "One row per company. Creates the Client Master record with its KYC block, primary contact and first meeting note.",
    stage: "Masters",
  },
  {
    key: "items",
    spec: itemImportSpec,
    plural: "Items",
    blurb:
      "One row per part. Creates an Item Master record; the internal item code is generated server-side, never taken from the sheet.",
    stage: "Masters",
  },
  {
    key: "enquiries",
    spec: enquiryImportSpec,
    plural: "Enquiries",
    blurb:
      "One row per enquiry. Allocates a fresh SM number and upserts the client by company name.",
    stage: "Sales pipeline",
  },
  {
    key: "samples",
    spec: sampleImportSpec,
    plural: "Samples",
    blurb:
      "One row per physical sample, attached to an existing SM number. Sample numbers auto-allocate when the column is blank.",
    stage: "Sales pipeline",
  },
  {
    key: "meetings",
    spec: meetingImportSpec,
    plural: "Meetings",
    blurb:
      "One row per client meeting. Allocates a meeting number and links to the client when the Client column resolves.",
    stage: "Sales pipeline",
  },
  {
    key: "quotations",
    spec: quotationImportSpec,
    plural: "Quotations",
    blurb:
      "One row per historical quote against an existing SM. Legacy load only - the costing hard-gate is bypassed for imported rows.",
    stage: "Sales pipeline",
  },
  {
    key: "negotiations",
    spec: negotiationImportSpec,
    plural: "Negotiations",
    blurb:
      "One row per negotiation against an existing SM, carrying the quoted vs negotiated price.",
    stage: "Sales pipeline",
  },
  {
    key: "salesOrders",
    spec: salesOrderImportSpec,
    plural: "Sales Orders",
    blurb:
      "One row per confirmed order against an existing SM, with the customer PO number and date.",
    stage: "Sales pipeline",
  },
];

/** Human label for each reference lookup a spec column can resolve against. */
export const REF_KIND_LABELS: Record<RefKind, string> = {
  grade: "Internal Grade",
  tolerance: "Tolerance",
  condition: "Condition",
  shape: "Shape",
  customerType: "Customer Type",
  industryType: "Industry Type",
  productType: "Product Type",
  client: "Client Master",
  employee: "Employee",
  inquirySM: "SM Number",
};

/** Short type badge shown against each column in the spec table. */
export function fieldTypeLabel(field: ImportField): string {
  switch (field.type) {
    case "ref":
      return `Lookup · ${REF_KIND_LABELS[field.ref!.kind]}`;
    case "refMulti":
      return `Multi-lookup · ${REF_KIND_LABELS[field.ref!.kind]}`;
    case "enum":
      return "Choice";
    case "number":
      return "Number";
    case "date":
      return "Date";
    case "boolean":
      return "Yes / No";
    default:
      return "Text";
  }
}

/** The accepted values shown beside a column: enum labels, or the constraint. */
export function fieldHint(field: ImportField): string {
  if (field.type === "enum") {
    return (field.enumValues ?? []).map((o) => o.label).join(" · ");
  }
  if (field.type === "ref" || field.type === "refMulti") {
    const create = field.ref?.allowCreate
      ? "matched by name; new values can be created inline"
      : "must already exist";
    return create;
  }
  if (field.type === "number") {
    return field.min !== undefined ? `minimum ${field.min}` : "";
  }
  if (field.type === "date") return "DD/MM/YYYY or YYYY-MM-DD";
  if (field.maxLen !== undefined) return `max ${field.maxLen} characters`;
  return "";
}

export interface SpecSummary {
  columnCount: number;
  requiredHeaders: string[];
  refKinds: RefKind[];
  createsMasters: boolean;
}

/** Column/required/lookup counts a card shows without expanding the spec. */
export function summariseSpec(spec: ImportSpec): SpecSummary {
  const refKinds: RefKind[] = [];
  let createsMasters = false;
  for (const f of spec.fields) {
    if (!f.ref) continue;
    if (!refKinds.includes(f.ref.kind)) refKinds.push(f.ref.kind);
    if (f.ref.allowCreate) createsMasters = true;
  }
  return {
    columnCount: spec.fields.length,
    requiredHeaders: spec.fields.filter((f) => f.required).map((f) => f.header),
    refKinds,
    createsMasters,
  };
}

// ── Export side ────────────────────────────────────────────────────

export const EXPORT_ENTITY_KEYS = [
  "clients",
  "items",
  "vendors",
  "employees",
  "enquiries",
  "samples",
  "meetings",
  "quotations",
  "negotiations",
  "sales_orders",
  "tasks",
  "activity",
] as const;
export type ExportEntityKey = (typeof EXPORT_ENTITY_KEYS)[number];

export function isExportEntityKey(v: string): v is ExportEntityKey {
  return (EXPORT_ENTITY_KEYS as readonly string[]).includes(v);
}

export interface ExportCatalogEntry {
  key: ExportEntityKey;
  label: string;
  blurb: string;
  stage: "Masters" | "Sales pipeline" | "Operations";
  /** Formats offered in the UI. Delegated datasets expose exactly one. */
  formats: readonly DataJobFormat[];
  /**
   * When set, the hub logs the run then redirects to this already-shipped,
   * canonical export route instead of building a second generator for the
   * same table (reuse, don't reimplement).
   */
  delegateTo?: string;
}

/**
 * Every dataset an admin can pull out of the system. `delegateTo` entries hand
 * off to the module's own export route (which owns the humanised column set);
 * the rest are generated by /admin/data/export from `lib/data-transfer/exporters`.
 */
export const EXPORT_CATALOG: readonly ExportCatalogEntry[] = [
  {
    key: "clients",
    label: "Client Master",
    blurb: "Full KYC, credit, banking, primary contact and address block.",
    stage: "Masters",
    formats: ["xlsx"],
    delegateTo: "/clients/export.xlsx",
  },
  {
    key: "items",
    label: "Item Master",
    blurb: "Item codes with resolved shape / grade / tolerance / condition names.",
    stage: "Masters",
    formats: ["xlsx"],
    delegateTo: "/items/export.xlsx",
  },
  {
    key: "vendors",
    label: "Vendor Master",
    blurb: "Vendor codes, contacts, credit terms and addresses.",
    stage: "Masters",
    formats: ["xlsx"],
    delegateTo: "/vendors/export.xlsx",
  },
  {
    key: "employees",
    label: "Employee roster",
    blurb: "Every employee row including deactivated ones, with roles and departments.",
    stage: "Operations",
    formats: ["csv"],
    delegateTo: "/admin/employees/export",
  },
  {
    key: "enquiries",
    label: "Enquiry register",
    blurb: "SM number, company, product ask, checklist verdicts and feasibility state.",
    stage: "Sales pipeline",
    formats: ["xlsx", "csv"],
  },
  {
    key: "samples",
    label: "Sample register",
    blurb: "Physical samples with location, responsible person and per-stage progress.",
    stage: "Sales pipeline",
    formats: ["xlsx", "csv"],
  },
  {
    key: "meetings",
    label: "Client meetings",
    blurb: "Meeting log with sales person, contact, purpose and follow-up date.",
    stage: "Sales pipeline",
    formats: ["xlsx", "csv"],
  },
  {
    key: "quotations",
    label: "Quotation register",
    blurb: "Quote numbers with costing state, price and sent flag.",
    stage: "Sales pipeline",
    formats: ["xlsx", "csv"],
  },
  {
    key: "negotiations",
    label: "Negotiation register",
    blurb: "Negotiation numbers with stage, PI iterations and customer PO details.",
    stage: "Sales pipeline",
    formats: ["xlsx", "csv"],
  },
  {
    key: "sales_orders",
    label: "Sales Order register",
    blurb: "SO numbers with customer PO, quoted price and delivery commitments.",
    stage: "Sales pipeline",
    formats: ["xlsx", "csv"],
  },
  {
    key: "tasks",
    label: "Task register",
    blurb: "The work-management task list as the Tasks module exports it.",
    stage: "Operations",
    formats: ["xlsx"],
    delegateTo: "/tasks/export.xlsx",
  },
  {
    key: "activity",
    label: "Activity feed",
    blurb: "Task, employee and settings events - the org-wide audit stream.",
    stage: "Operations",
    formats: ["csv"],
    delegateTo: "/admin/activity/export",
  },
];

/** Lookup helper used by the route handler and the page alike. */
export function findExportEntry(
  key: string,
): ExportCatalogEntry | undefined {
  return EXPORT_CATALOG.find((e) => e.key === key);
}

/** `carbide-india-<entity>-YYYY-MM-DD.<ext>` - matches lib/exports/csv naming. */
export function transferFilename(
  entity: string,
  format: DataJobFormat,
  date: Date = new Date(),
): string {
  const iso = date.toISOString().slice(0, 10);
  return `carbide-india-${entity.replace(/_/g, "-")}-${iso}.${format}`;
}
