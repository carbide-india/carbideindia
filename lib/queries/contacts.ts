import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientContacts, clients } from "@/db/schema";

export interface ContactPersonRow {
  id: string;
  firstName: string;
  lastName: string | null;
  designation: string | null;
  contactNo: string | null;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
  clientId: string;
  clientName: string;
  clientCode: string | null;
  city: string | null;
  state: string | null;
  grade: "A" | "B" | "C" | null;
}

/** A company with all of its contact persons, primary contact first. */
export interface ContactCompanyGroup {
  clientId: string;
  clientName: string;
  clientCode: string | null;
  city: string | null;
  state: string | null;
  grade: "A" | "B" | "C" | null;
  contacts: ContactPersonRow[];
}

/**
 * The Contact Person book — every contact person captured across the client
 * KYC forms (stored in `client_contacts`), joined to their client, so the team
 * has one browsable directory of who to talk to at each company.
 *
 * Ordered company-name asc, then primary contact first, then name — the exact
 * order the Address Book table renders in, so grouping in the UI is a single
 * pass with no client-side re-sort.
 */
export async function listContactPersons(): Promise<ContactPersonRow[]> {
  return db
    .select({
      id: clientContacts.id,
      firstName: clientContacts.firstName,
      lastName: clientContacts.lastName,
      designation: clientContacts.designation,
      contactNo: clientContacts.contactNo,
      email: clientContacts.email,
      isPrimary: clientContacts.isPrimary,
      notes: clientContacts.notes,
      clientId: clientContacts.clientId,
      clientName: clients.name,
      clientCode: clients.clientCode,
      city: clients.city,
      state: clients.state,
      grade: clients.grade,
    })
    .from(clientContacts)
    .innerJoin(clients, eq(clientContacts.clientId, clients.id))
    .orderBy(
      asc(clients.name),
      desc(clientContacts.isPrimary),
      asc(clientContacts.firstName),
    );
}

/**
 * Same directory, grouped by company (companies alphabetical, primary contact
 * first within each) — the shape the Address Book table consumes to render one
 * company header per group with its contacts beneath.
 */
export async function listContactPersonGroups(): Promise<ContactCompanyGroup[]> {
  const rows = await listContactPersons();
  const groups: ContactCompanyGroup[] = [];
  let current: ContactCompanyGroup | null = null;

  for (const row of rows) {
    if (!current || current.clientId !== row.clientId) {
      current = {
        clientId: row.clientId,
        clientName: row.clientName,
        clientCode: row.clientCode,
        city: row.city,
        state: row.state,
        grade: row.grade,
        contacts: [],
      };
      groups.push(current);
    }
    current.contacts.push(row);
  }

  return groups;
}
