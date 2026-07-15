import "server-only";
import { and, desc, eq, getTableColumns, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { samples, inquiries, clients, employees, type Sample } from "@/db/schema";
import type { SampleStatus, StageStatus } from "@/db/enums";

/** One row of the /samples register table. */
export interface SampleListItem {
  id: string;
  sampleNo: string;
  sampleDate: Date;
  companyName: string | null;
  clientId: string | null;
  location: string;
  responsibleId: string | null;
  responsibleName: string | null;
  sampleStatus: SampleStatus;
  dimensionStatus: StageStatus;
  chemicalStatus: StageStatus;
  drawingStatus: StageStatus;
  costingStatus: StageStatus;
  reportCount: number;
  photoCount: number;
  reportsUploaded: string[];
  notes: string | null;
  inSmFolder: boolean;
  linkedToEnquiry: boolean;
  createdAt: Date;
}

export interface SampleFilters {
  status?: SampleStatus;
  q?: string;
  responsibleId?: string;
}

/**
 * Sample register list. Filters are URL-driven (nuqs) and per-user, so this
 * is intentionally uncached - every render hits the DB with the exact filter
 * set. `q` matches sample number OR sample notes, case-insensitive substring.
 * Company name comes from the linked enquiry (left join - unlinked samples
 * render the "-" fallback).
 */
export async function listSamples(
  filters: SampleFilters = {},
): Promise<SampleListItem[]> {
  const conds = [];
  if (filters.status) {
    conds.push(eq(samples.sampleStatus, filters.status));
  }
  if (filters.responsibleId) {
    conds.push(eq(samples.responsiblePersonId, filters.responsibleId));
  }
  if (filters.q) {
    // Escape ilike wildcards so "100%" matches literally (same treatment as
    // listInquiries / the task command-palette search).
    const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(ilike(samples.sampleNo, like), ilike(samples.sampleNotes, like)),
    );
  }
  const rows = await db
    .select({
      id: samples.id,
      sampleNo: samples.sampleNo,
      sampleDate: samples.sampleDate,
      // Prefer the directly-linked client; fall back to the enquiry's company.
      companyName: sql<string | null>`coalesce(${clients.name}, ${inquiries.companyName})`,
      clientId: samples.clientId,
      location: samples.location,
      responsibleId: samples.responsiblePersonId,
      responsibleName: employees.name,
      sampleStatus: samples.sampleStatus,
      dimensionStatus: samples.dimensionStatus,
      chemicalStatus: samples.chemicalStatus,
      drawingStatus: samples.drawingStatus,
      costingStatus: samples.costingStatus,
      reportsUploaded: samples.reportsUploaded,
      photoUrls: samples.photoUrls,
      notes: samples.sampleNotes,
      inSmFolder: samples.reportsInSmFolder,
      inquiryId: samples.inquiryId,
      createdAt: samples.createdAt,
    })
    .from(samples)
    .leftJoin(clients, eq(samples.clientId, clients.id))
    .leftJoin(inquiries, eq(samples.inquiryId, inquiries.id))
    .leftJoin(employees, eq(samples.responsiblePersonId, employees.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(samples.sampleDate), desc(samples.createdAt));

  return rows.map((r) => ({
    id: r.id,
    sampleNo: r.sampleNo,
    sampleDate: r.sampleDate,
    companyName: r.companyName,
    clientId: r.clientId,
    location: r.location,
    responsibleId: r.responsibleId,
    responsibleName: r.responsibleName,
    sampleStatus: r.sampleStatus,
    dimensionStatus: r.dimensionStatus,
    chemicalStatus: r.chemicalStatus,
    drawingStatus: r.drawingStatus,
    costingStatus: r.costingStatus,
    reportsUploaded: r.reportsUploaded ?? [],
    reportCount: (r.reportsUploaded ?? []).length,
    photoCount: (r.photoUrls ?? []).length,
    notes: r.notes,
    inSmFolder: r.inSmFolder,
    linkedToEnquiry: Boolean(r.inquiryId),
    createdAt: r.createdAt,
  }));
}

/** Full sample row for the detail page. */
export async function getSampleById(id: string): Promise<Sample | null> {
  const [row] = await db
    .select()
    .from(samples)
    .where(eq(samples.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * A pre-registered sample the New Enquiry form can attach to a product line.
 * Carries the FULL sample snapshot (every column) plus the resolved company +
 * responsible person, so the enquiry form's read-only sample panel renders
 * client-side on pick with no extra round-trip. Capped at the 200 most recent.
 * (If sample volume grows large, switch the panel to an on-demand fetch.)
 */
export type SampleOption = Sample & {
  companyName: string | null;
  responsibleName: string | null;
};

/** A single sample's full snapshot (for the register Quick View). */
export async function getSampleOption(id: string): Promise<SampleOption | null> {
  const [row] = await db
    .select({
      ...getTableColumns(samples),
      companyName: sql<string | null>`coalesce(${clients.name}, ${inquiries.companyName})`,
      responsibleName: employees.name,
    })
    .from(samples)
    .leftJoin(clients, eq(samples.clientId, clients.id))
    .leftJoin(inquiries, eq(samples.inquiryId, inquiries.id))
    .leftJoin(employees, eq(samples.responsiblePersonId, employees.id))
    .where(eq(samples.id, id))
    .limit(1);
  return row ?? null;
}

export async function listSampleOptions(): Promise<SampleOption[]> {
  return db
    .select({
      ...getTableColumns(samples),
      companyName: sql<string | null>`coalesce(${clients.name}, ${inquiries.companyName})`,
      responsibleName: employees.name,
    })
    .from(samples)
    .leftJoin(clients, eq(samples.clientId, clients.id))
    .leftJoin(inquiries, eq(samples.inquiryId, inquiries.id))
    .leftJoin(employees, eq(samples.responsiblePersonId, employees.id))
    .orderBy(desc(samples.sampleDate), desc(samples.createdAt))
    .limit(200);
}

/**
 * Samples attached to a set of inquiries, keyed by inquiryId - for the enquiry
 * register's "Samples" column (each enquiry may have several, via the per-line
 * samples.inquiry_id back-link). Returns a compact row per sample.
 */
export interface LinkedSampleRow {
  inquiryId: string;
  id: string;
  sampleNo: string;
  sampleStatus: SampleStatus;
}

export async function listSamplesForInquiries(
  inquiryIds: string[],
): Promise<Map<string, LinkedSampleRow[]>> {
  const byInquiry = new Map<string, LinkedSampleRow[]>();
  if (inquiryIds.length === 0) return byInquiry;
  const rows = await db
    .select({
      inquiryId: samples.inquiryId,
      id: samples.id,
      sampleNo: samples.sampleNo,
      sampleStatus: samples.sampleStatus,
    })
    .from(samples)
    .where(inArray(samples.inquiryId, inquiryIds))
    .orderBy(desc(samples.sampleDate));
  for (const r of rows) {
    if (!r.inquiryId) continue;
    const arr = byInquiry.get(r.inquiryId) ?? [];
    arr.push({ inquiryId: r.inquiryId, id: r.id, sampleNo: r.sampleNo, sampleStatus: r.sampleStatus });
    byInquiry.set(r.inquiryId, arr);
  }
  return byInquiry;
}
