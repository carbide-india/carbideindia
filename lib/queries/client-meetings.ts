import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientMeetings, employees, type ClientMeeting } from "@/db/schema";
import type { MeetingPurpose } from "@/db/enums";

/** One row of the /meetings register table. */
export interface ClientMeetingListItem {
  id: string;
  meetingNo: string;
  meetingDate: Date;
  companyName: string;
  /** Contact name — first + last, falling back to the legacy combined column. */
  contactPersonName: string;
  /** Captured sales-person name; falls back to the linked employee's name. */
  salesPersonName: string | null;
  purpose: MeetingPurpose;
  nextFollowUpDate: Date | null;
}

export interface ClientMeetingFilters {
  purpose?: MeetingPurpose;
  q?: string;
  salesPersonId?: string;
}

/**
 * Client-meeting register list. Filters are URL-driven (nuqs) and per-user, so
 * this is intentionally uncached. `q` matches meeting number OR company OR
 * contact name, case-insensitive substring. Sales-person name comes from a
 * left join on employees (unlinked rows render the "—" fallback).
 */
export async function listClientMeetings(
  filters: ClientMeetingFilters = {},
): Promise<ClientMeetingListItem[]> {
  const conds = [];
  if (filters.purpose) {
    conds.push(eq(clientMeetings.purpose, filters.purpose));
  }
  if (filters.salesPersonId) {
    conds.push(eq(clientMeetings.salesPersonId, filters.salesPersonId));
  }
  if (filters.q) {
    // Escape ilike wildcards so "100%" matches literally (same treatment as
    // listSamples / listInquiries).
    const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        ilike(clientMeetings.meetingNo, like),
        ilike(clientMeetings.companyName, like),
        ilike(clientMeetings.contactPersonName, like),
        ilike(clientMeetings.contactFirstName, like),
        ilike(clientMeetings.contactLastName, like),
      ),
    );
  }
  return db
    .select({
      id: clientMeetings.id,
      meetingNo: clientMeetings.meetingNo,
      meetingDate: clientMeetings.meetingDate,
      companyName: clientMeetings.companyName,
      // Prefer the new first/last pair; fall back to the legacy combined column.
      contactPersonName: sql<string>`coalesce(
        nullif(trim(concat_ws(' ', ${clientMeetings.contactFirstName}, ${clientMeetings.contactLastName})), ''),
        ${clientMeetings.contactPersonName}
      )`,
      // Captured sales name first, else the linked employee's name.
      salesPersonName: sql<string | null>`coalesce(${clientMeetings.salesName}, ${employees.name})`,
      purpose: clientMeetings.purpose,
      nextFollowUpDate: clientMeetings.nextFollowUpDate,
    })
    .from(clientMeetings)
    .leftJoin(employees, eq(clientMeetings.salesPersonId, employees.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(clientMeetings.meetingDate), desc(clientMeetings.createdAt));
}

/** Full client-meeting row for the detail page. */
export async function getClientMeetingById(
  id: string,
): Promise<ClientMeeting | null> {
  const [row] = await db
    .select()
    .from(clientMeetings)
    .where(eq(clientMeetings.id, id))
    .limit(1);
  return row ?? null;
}
