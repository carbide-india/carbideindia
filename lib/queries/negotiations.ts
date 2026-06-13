import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { negotiations, employees, type Negotiation } from "@/db/schema";
import type { NegotiationStatus } from "@/db/enums";

/** One row of the /negotiations register table. */
export interface NegotiationListItem {
  id: string;
  negotiationNo: string;
  companyName: string | null;
  salesPersonName: string | null;
  quotePrice: string | null;
  negotiationStatus: NegotiationStatus;
  /** SM snapshot of the enquiry date; null on legacy rows — date filters fall
   *  back to createdAt. */
  enquiryDate: Date | null;
  createdAt: Date;
}

export interface NegotiationFilters {
  status?: NegotiationStatus;
  q?: string;
}

/**
 * Negotiation register list. Uncached (URL-driven, per-user). `q` matches the
 * negotiation number OR company name (ilike wildcards escaped); `status`
 * filters by the live pipeline state. Sales person name from the employee join.
 */
export async function listNegotiations(
  filters: NegotiationFilters = {},
): Promise<NegotiationListItem[]> {
  const conds = [];
  if (filters.status) {
    conds.push(eq(negotiations.negotiationStatus, filters.status));
  }
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        ilike(negotiations.negotiationNo, like),
        ilike(negotiations.companyName, like),
      ),
    );
  }
  return db
    .select({
      id: negotiations.id,
      negotiationNo: negotiations.negotiationNo,
      companyName: negotiations.companyName,
      salesPersonName: employees.name,
      quotePrice: negotiations.quotePrice,
      negotiationStatus: negotiations.negotiationStatus,
      enquiryDate: negotiations.enquiryDate,
      createdAt: negotiations.createdAt,
    })
    .from(negotiations)
    .leftJoin(employees, eq(negotiations.salesPersonId, employees.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(negotiations.createdAt));
}

/** Full negotiation row for the detail page. */
export async function getNegotiationById(
  id: string,
): Promise<Negotiation | null> {
  const [row] = await db
    .select()
    .from(negotiations)
    .where(eq(negotiations.id, id))
    .limit(1);
  return row ?? null;
}
