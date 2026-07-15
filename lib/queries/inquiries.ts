import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, items, employees, type Inquiry } from "@/db/schema";
import type { EnquiryStatus, FeasibilityStatus } from "@/db/enums";
import { specMasterAliases } from "@/lib/flow/spec-resolve";
import { listSamplesForInquiries } from "@/lib/queries/samples";

/** One row of the /inquiries register table. */
export interface InquiryListItem {
  id: string;
  smNumber: string;
  enquiryDate: Date;
  companyName: string;
  priority: Inquiry["priority"];
  enquiryStatus: EnquiryStatus;
  feasibilityStatus: FeasibilityStatus;
  salesPersonName: string | null;
  productDescription: string;
  /** Physical samples attached to this enquiry (via samples.inquiry_id). */
  samples: { id: string; sampleNo: string; sampleStatus: import("@/db/enums").SampleStatus }[];
}

export interface InquiryFilters {
  status?: EnquiryStatus;
  q?: string;
  salesPersonId?: string;
}

/**
 * Inquiry register list. Filters are URL-driven (nuqs) and per-user, so this
 * is intentionally uncached - every render hits the DB with the exact filter
 * set. `q` matches company name OR SM number, case-insensitive substring.
 */
export async function listInquiries(
  filters: InquiryFilters = {},
): Promise<InquiryListItem[]> {
  // Archived enquiries drop off the register (the detail page can still load
  // one directly, and it can be unarchived).
  const conds: Array<SQL | undefined> = [eq(inquiries.isArchived, false)];
  if (filters.status) {
    conds.push(eq(inquiries.enquiryStatus, filters.status));
  }
  if (filters.salesPersonId) {
    conds.push(eq(inquiries.assignedSalesPersonId, filters.salesPersonId));
  }
  if (filters.q) {
    // Escape ilike wildcards so "100%" matches literally (same treatment as
    // the task command-palette search in lib/queries/task-search.ts).
    const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(ilike(inquiries.companyName, like), ilike(inquiries.smNumber, like)),
    );
  }
  const rows = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      enquiryDate: inquiries.enquiryDate,
      companyName: inquiries.companyName,
      priority: inquiries.priority,
      enquiryStatus: inquiries.enquiryStatus,
      feasibilityStatus: inquiries.feasibilityStatus,
      salesPersonName: employees.name,
      productDescription: inquiries.productDescription,
    })
    .from(inquiries)
    .leftJoin(employees, eq(inquiries.assignedSalesPersonId, employees.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(inquiries.enquiryDate), desc(inquiries.createdAt));

  // Attach linked physical samples (per-line back-link, aggregated per enquiry).
  const byInquiry = await listSamplesForInquiries(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    samples: (byInquiry.get(r.id) ?? []).map((s) => ({
      id: s.id,
      sampleNo: s.sampleNo,
      sampleStatus: s.sampleStatus,
    })),
  }));
}

/** Full inquiry row for the detail page / feasibility panel. */
export async function getInquiryById(id: string): Promise<Inquiry | null> {
  const [row] = await db
    .select()
    .from(inquiries)
    .where(eq(inquiries.id, id))
    .limit(1);
  return row ?? null;
}

/** One row of the command-palette "Inquiries" group. */
export interface InquirySearchResult {
  id: string;
  smNumber: string;
  companyName: string;
  enquiryStatus: EnquiryStatus;
  productDescription: string;
}

/**
 * Command-palette inquiry search - SM number or company, capped small for a
 * snappy palette (same contract as searchTasks in lib/queries/task-search.ts).
 */
export async function searchInquiries(rawQuery: string): Promise<InquirySearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  return db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      enquiryStatus: inquiries.enquiryStatus,
      productDescription: inquiries.productDescription,
    })
    .from(inquiries)
    .where(or(ilike(inquiries.smNumber, like), ilike(inquiries.companyName, like)))
    .orderBy(desc(inquiries.enquiryDate))
    .limit(5);
}

/** One option of the sample form's "Linked Enquiry" picker. */
export interface InquiryOption {
  id: string;
  smNumber: string;
  companyName: string;
}

/**
 * Recent enquiries for the sample form's "Linked Enquiry" picker, rendered
 * as `SM - company`. Intentionally uncached: a sample is typically logged
 * minutes after its enquiry, so a cached list would routinely miss the one
 * enquiry the user is looking for. Capped at the 100 most recent.
 */
export async function listInquiryOptions(): Promise<InquiryOption[]> {
  return db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
    })
    .from(inquiries)
    .orderBy(desc(inquiries.enquiryDate), desc(inquiries.createdAt))
    .limit(100);
}

/**
 * The SM number the sequence will assign next (admin settings "Sales Module"
 * card). `is_called` false means last_value itself is still unconsumed.
 */
export async function getNextSmNumber(): Promise<number> {
  const rows = (await db.execute(
    sql`SELECT last_value, is_called FROM inquiries_sm_number_seq`,
  )) as unknown as Array<{ last_value: string | number; is_called: boolean }>;
  const row = rows[0];
  if (!row) return 9579;
  const last = Number(row.last_value);
  return row.is_called ? last + 1 : last;
}

/**
 * Shape a loaded inquiry row into the enquiry form's input fields for edit
 * mode. Covers only the header / client / checklist / meta fields the edit
 * form shows - products (inquiry_items) are NOT edited here (they link to
 * costings/quotes), so the form hides its ProductsSection in edit mode.
 *
 * Conventions match the form's defaultValues: numeric columns are strings or
 * undefined (not `null`), optional text nulls fold to `""`, and the date is a
 * local YYYY-MM-DD string for the `<input type="date">`.
 */
export function getInquiryEditValues(inq: Inquiry) {
  const numOrUndef = (v: string | null): number | undefined =>
    v == null || v === "" ? undefined : Number(v);
  const localIsoDate = (d: Date): string => {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  };
  return {
    clientMode: "new" as const,
    clientId: inq.clientId ?? undefined,
    enquiryDate: localIsoDate(inq.enquiryDate),
    priority: inq.priority,
    source: inq.source ?? undefined,
    companyName: inq.companyName,
    export: inq.export ?? undefined,
    currency: inq.currency,
    country: inq.country,
    state: inq.state ?? "",
    city: inq.city ?? "",
    addressLine1: inq.addressLine1 ?? "",
    addressLine2: inq.addressLine2 ?? "",
    addressLine3: inq.addressLine3 ?? "",
    addressLine4: inq.addressLine4 ?? "",
    pinCode: inq.pinCode ?? "",
    contactFirstName: inq.contactFirstName ?? "",
    contactLastName: inq.contactLastName ?? "",
    contactNo: inq.contactNo ?? "",
    contactEmail: inq.contactEmail ?? "",
    ccEmails: inq.ccEmails ?? "",
    productDescription: inq.productDescription,
    quantityStatus: inq.quantityStatus ?? undefined,
    quantityNos: numOrUndef(inq.quantityNos),
    quantityUom: inq.quantityUom,
    docsGiven: inq.docsGiven ?? [],
    shapeDimensionCheck: inq.shapeDimensionCheck ?? undefined,
    gradeCheck: inq.gradeCheck ?? undefined,
    toleranceCheck: inq.toleranceCheck ?? undefined,
    conditionCheck: inq.conditionCheck ?? undefined,
    sampleReceived: inq.sampleReceived ?? undefined,
    dimensionNotes: inq.dimensionNotes ?? "",
    smFolderLink: inq.smFolderLink ?? "",
    enquiryNotes: inq.enquiryNotes ?? "",
    assignedSalesPersonId: inq.assignedSalesPersonId ?? undefined,
  };
}

/** An inquiry product line with its SPEC resolved read-through from the Item. */
export interface InquiryItemRow {
  id: string;
  inquiryId: string;
  sortOrder: number;
  // Customer-scoped ASK (single-sourced on inquiry_items - §2.5 KEEP).
  custProductName: string | null;
  custDrawingNo: string | null;
  drawingRevisionNo: string | null;
  gradeCustomer: string | null;
  quantityNos: string | null;
  quantityUom: string;
  itemId: string;
  createdAt: Date;
  updatedAt: Date;
  // Product SPEC resolved from the linked Item (+ master names) - read-through.
  itemCode: string | null;
  shapeName: string | null;
  gradeName: string | null;
  toleranceName: string | null;
  conditionName: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionNotes: string | null;
}

/**
 * All product rows for a given inquiry, ordered by sort_order, with product SPEC
 * resolved READ-THROUGH from the linked Item (§2.4): shape / grade / tolerance /
 * condition NAMES, dimensions, size + item code all come from `items` via
 * `item_id` (+ four master aliases), NOT from the inquiry line's raw-entry
 * buffer columns. The customer-scoped ask (product name / drawing / qty /
 * customer grade) stays sourced from inquiry_items where it is single-sourced.
 */
export async function getInquiryItems(inquiryId: string): Promise<InquiryItemRow[]> {
  const m = specMasterAliases();
  return db
    .select({
      id: inquiryItems.id,
      inquiryId: inquiryItems.inquiryId,
      sortOrder: inquiryItems.sortOrder,
      custProductName: inquiryItems.custProductName,
      custDrawingNo: inquiryItems.custDrawingNo,
      drawingRevisionNo: inquiryItems.drawingRevisionNo,
      gradeCustomer: inquiryItems.gradeCustomer,
      quantityNos: inquiryItems.quantityNos,
      quantityUom: inquiryItems.quantityUom,
      itemId: inquiryItems.itemId,
      createdAt: inquiryItems.createdAt,
      updatedAt: inquiryItems.updatedAt,
      // Read-through spec from the linked Item + master names.
      itemCode: items.itemCode,
      shapeName: m.shape.name,
      gradeName: m.grade.name,
      toleranceName: m.tolerance.name,
      conditionName: m.condition.name,
      outerDia: items.outerDia,
      innerDia: items.innerDia,
      length: items.length,
      width: items.width,
      thickness: items.thickness,
      dimensionNotes: items.dimensionNotes,
    })
    .from(inquiryItems)
    .leftJoin(items, eq(items.id, inquiryItems.itemId))
    .leftJoin(m.shape, eq(items.shapeId, m.shape.id))
    .leftJoin(m.grade, eq(items.internalGradeId, m.grade.id))
    .leftJoin(m.tolerance, eq(items.toleranceId, m.tolerance.id))
    .leftJoin(m.condition, eq(items.conditionId, m.condition.id))
    .where(eq(inquiryItems.inquiryId, inquiryId))
    .orderBy(asc(inquiryItems.sortOrder));
}
