import "server-only";
import { aliasedTable, and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  clientContacts,
  clients,
  masterOptions,
  tasks,
  type Client,
} from "@/db/schema";
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
  // ── Carbide KYC type/product masters (Phase 2) — ids drive form prefill,
  //    the resolved names feed name-string fields (e.g. meeting Client Type). ──
  customerTypeId: string | null;
  industryTypeId: string | null;
  productTypeIds: string[] | null;
  customerTypeName: string | null;
  industryTypeName: string | null;
  contact: {
    firstName: string;
    lastName: string | null;
    designation: string | null;
    contactNo: string | null;
    email: string | null;
    ccEmails: string | null;
  } | null;
}

/**
 * Full KYC values for the admin "Edit client" form, shaped to match the
 * KycForm's input fields (nulls folded to "" / undefined / [] so RHF
 * defaultValues prefill cleanly). Covers only the columns the form edits —
 * currency/country/export are intentionally absent (the form has no inputs
 * for them, so the edit must never touch those columns). Admin-only caller.
 */
export interface ClientEditValues {
  name: string;
  customerTypeId?: string;
  industryTypeId?: string;
  productTypeIds: string[];
  state: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  addressLine4: string;
  pinCode: string;
  gstin: string;
  panNo: string;
  billToAddress: string;
  paymentTerms: string;
  freightCharges: string;
  qtyDeviation: string;
  contactFirstName: string;
  contactLastName: string;
  contactDesignation: string;
  contactNo: string;
  contactEmail: string;
  meetingDate: string;
  meetingStart: string;
  meetingEnd: string;
  meetingNotes: string;
  kycSalesPersonId?: string;
  businessCardFrontUrl?: string;
  businessCardBackUrl?: string;
}

export async function getClientForEdit(
  clientId: string,
): Promise<ClientEditValues | null> {
  const [row] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!row) return null;
  const [contact] = await db
    .select()
    .from(clientContacts)
    .where(
      and(eq(clientContacts.clientId, clientId), eq(clientContacts.isPrimary, true)),
    )
    .limit(1);
  // Stored at noon UTC, so an ISO slice gives the intended calendar date.
  const meetingDate = row.kycMeetingDate
    ? row.kycMeetingDate.toISOString().slice(0, 10)
    : "";
  return {
    name: row.name,
    customerTypeId: row.customerTypeId ?? undefined,
    industryTypeId: row.industryTypeId ?? undefined,
    productTypeIds: row.productTypeIds ?? [],
    state: row.state ?? "",
    city: row.city ?? "",
    addressLine1: row.addressLine1 ?? "",
    addressLine2: row.addressLine2 ?? "",
    addressLine3: row.addressLine3 ?? "",
    addressLine4: row.addressLine4 ?? "",
    pinCode: row.pinCode ?? "",
    gstin: row.gstin ?? "",
    panNo: row.panNo ?? "",
    billToAddress: row.billToAddress ?? "",
    paymentTerms: row.paymentTerms ?? "",
    freightCharges: row.freightCharges ?? "",
    qtyDeviation: row.qtyDeviation ?? "",
    contactFirstName: contact?.firstName ?? "",
    contactLastName: contact?.lastName ?? "",
    contactDesignation: contact?.designation ?? "",
    contactNo: contact?.contactNo ?? "",
    contactEmail: contact?.email ?? "",
    meetingDate,
    meetingStart: row.kycMeetingStart ?? "",
    meetingEnd: row.kycMeetingEnd ?? "",
    meetingNotes: row.kycMeetingNotes ?? "",
    kycSalesPersonId: row.kycSalesPersonId ?? undefined,
    businessCardFrontUrl: row.businessCardFrontUrl ?? undefined,
    businessCardBackUrl: row.businessCardBackUrl ?? undefined,
  };
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
  // Resolve the two type names via the masters table aliased twice (a client
  // row may reference the same masterOptions table for both customer + industry).
  const customerType = aliasedTable(masterOptions, "customer_type");
  const industryType = aliasedTable(masterOptions, "industry_type");
  const [row] = await db
    .select({
      ...getTableColumns(clients),
      customerTypeName: customerType.name,
      industryTypeName: industryType.name,
    })
    .from(clients)
    .leftJoin(customerType, eq(customerType.id, clients.customerTypeId))
    .leftJoin(industryType, eq(industryType.id, clients.industryTypeId))
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
    customerTypeId: row.customerTypeId,
    industryTypeId: row.industryTypeId,
    productTypeIds: row.productTypeIds,
    customerTypeName: row.customerTypeName,
    industryTypeName: row.industryTypeName,
    contact: contact
      ? {
          firstName: contact.firstName,
          lastName: contact.lastName,
          designation: contact.designation,
          contactNo: contact.contactNo,
          email: contact.email,
          ccEmails: contact.ccEmails,
        }
      : null,
  };
}
