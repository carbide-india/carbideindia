import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
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
