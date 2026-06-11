import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, employees, type Inquiry } from "@/db/schema";
import type { EnquiryStatus, FeasibilityStatus } from "@/db/enums";

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
}

export interface InquiryFilters {
  status?: EnquiryStatus;
  q?: string;
  salesPersonId?: string;
}

/**
 * Inquiry register list. Filters are URL-driven (nuqs) and per-user, so this
 * is intentionally uncached — every render hits the DB with the exact filter
 * set. `q` matches company name OR SM number, case-insensitive substring.
 */
export async function listInquiries(
  filters: InquiryFilters = {},
): Promise<InquiryListItem[]> {
  const conds = [];
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
  return db
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
 * Command-palette inquiry search — SM number or company, capped small for a
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
