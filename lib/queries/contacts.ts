import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientContacts, clients } from "@/db/schema";

export interface ContactPersonRow {
  id: string;
  firstName: string;
  lastName: string | null;
  designation: string | null;
  contactNo: string | null;
  email: string | null;
  clientId: string;
  clientName: string;
}

/**
 * The Contact Person book — every contact person captured across the client
 * KYC forms (stored in `client_contacts`), joined to their client, so the team
 * has one browsable directory of who to talk to at each company.
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
      clientId: clientContacts.clientId,
      clientName: clients.name,
    })
    .from(clientContacts)
    .innerJoin(clients, eq(clientContacts.clientId, clients.id))
    .orderBy(asc(clients.name), asc(clientContacts.firstName));
}
