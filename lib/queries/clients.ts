import "server-only";
import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { clientContacts, clients, tasks, type Client } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Active client names, alphabetical (case-insensitive). Drives the
 * "Client Name" picker on the New Task / Edit Task forms.
 *
 * Cached under the `clients` tag — the roster is identical for every
 * user and changes only when an admin creates/renames a client or any
 * authed user uses "+ Add new client…" (both write paths call
 * `updateTag(CACHE_TAGS.clients)`). 10-min TTL is just a safety net
 * for an invalidation we missed.
 */
export const listActiveClientNames = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.isActive, true))
      .orderBy(asc(clients.name));
    // Postgres `order by name` is byte-order (uppercase before lowercase);
    // re-sort with a locale-aware collator so "app" and "AA Tech" land where
    // a human expects.
    return rows
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  },
  ["list-active-client-names"],
  { tags: [CACHE_TAGS.clients], revalidate: 600 },
);

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Active clients as id+name pairs — drives the "Old client" picker on the
 * New Inquiry form (the picker needs the id to call the autofill endpoint,
 * unlike the task form's name-only roster). Same cache tag + TTL as
 * `listActiveClientNames`.
 */
export const listClientOptions = unstable_cache(
  async (): Promise<ClientOption[]> => {
    const rows = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.isActive, true))
      .orderBy(asc(clients.name));
    // Locale-aware re-sort — same reasoning as listActiveClientNames.
    return rows.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  },
  ["list-client-options"],
  { tags: [CACHE_TAGS.clients], revalidate: 600 },
);

export interface ClientWithCount extends Client {
  /** Tasks whose Client Name (tasks.title) matches this client, case-insensitive. */
  taskCount: number;
}

/**
 * Every client (active + inactive) plus a count of tasks filed under it.
 * Used by the /admin/clients management table. Sorted alphabetically to
 * match how the picker presents them.
 */
export async function listClientsWithCounts(): Promise<ClientWithCount[]> {
  const rows = await db
    .select({
      ...getTableColumns(clients),
      taskCount: sql<number>`count(${tasks.id})::int`,
    })
    .from(clients)
    .leftJoin(tasks, sql`lower(${tasks.title}) = lower(${clients.name})`)
    .groupBy(clients.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export interface ClientAutofill {
  id: string;
  name: string;
  export: boolean | null;
  currency: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  pinCode: string | null;
  contact: {
    firstName: string;
    lastName: string | null;
    contactNo: string | null;
    email: string | null;
    ccEmails: string | null;
  } | null;
}

/**
 * Old-client auto-fetch for the inquiry form: the client's KYC block plus
 * its primary contact (if any). The inquiry snapshots these values at
 * creation; it never references this table again. Uncached — fetched
 * per-click when the user picks an existing client.
 */
export async function getClientAutofill(
  clientId: string,
): Promise<ClientAutofill | null> {
  const [row] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!row) return null;
  const [contact] = await db
    .select()
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.isPrimary, true),
      ),
    )
    .limit(1);
  return {
    id: row.id,
    name: row.name,
    export: row.export,
    currency: row.currency,
    country: row.country,
    state: row.state,
    city: row.city,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    addressLine3: row.addressLine3,
    addressLine4: row.addressLine4,
    pinCode: row.pinCode,
    contact: contact
      ? {
          firstName: contact.firstName,
          lastName: contact.lastName,
          contactNo: contact.contactNo,
          email: contact.email,
          ccEmails: contact.ccEmails,
        }
      : null,
  };
}
