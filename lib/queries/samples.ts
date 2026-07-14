import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { samples, inquiries, employees, type Sample } from "@/db/schema";
import type { SampleStatus, StageStatus } from "@/db/enums";

/** One row of the /samples register table. */
export interface SampleListItem {
  id: string;
  sampleNo: string;
  sampleDate: Date;
  companyName: string | null;
  location: string;
  responsibleName: string | null;
  sampleStatus: SampleStatus;
  dimensionStatus: StageStatus;
  chemicalStatus: StageStatus;
  drawingStatus: StageStatus;
  costingStatus: StageStatus;
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
  return db
    .select({
      id: samples.id,
      sampleNo: samples.sampleNo,
      sampleDate: samples.sampleDate,
      companyName: inquiries.companyName,
      location: samples.location,
      responsibleName: employees.name,
      sampleStatus: samples.sampleStatus,
      dimensionStatus: samples.dimensionStatus,
      chemicalStatus: samples.chemicalStatus,
      drawingStatus: samples.drawingStatus,
      costingStatus: samples.costingStatus,
    })
    .from(samples)
    .leftJoin(inquiries, eq(samples.inquiryId, inquiries.id))
    .leftJoin(employees, eq(samples.responsiblePersonId, employees.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(samples.sampleDate), desc(samples.createdAt));
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
