import "server-only";
import { aliasedTable, and, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  clientContacts,
  clients,
  employees,
  masterOptions,
  tasks,
  type Client,
  type ClientContact,
  type ClientAddress,
  type ClientBankAccount,
} from "@/db/schema";
import type { GstRegistrationType } from "@/db/enums";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { getClientAddresses, getClientBankAccounts } from "@/lib/queries/client-children";
import type {
  ClientAddressInput,
  ClientBankAccountInput,
} from "@/lib/validators/client-kyc";

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
  // ── Extra context fields (display-only in the inquiry picker) ──
  tags: string[] | null;
  notes: string | null;
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
  clientCode?: string;
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
  tags: string[];
  notes: string;
  contactFirstName: string;
  contactLastName: string;
  contactDesignation: string;
  contactNo: string;
  contactEmail: string;
  contactNotes: string;
  additionalContacts: {
    firstName: string;
    lastName: string;
    designation: string;
    contactNo: string;
    email: string;
    notes: string;
  }[];
  meetingDate: string;
  meetingStart: string;
  meetingEnd: string;
  meetingNotes: string;
  kycSalesPersonId?: string;
  businessCardFrontUrl?: string;
  businessCardBackUrl?: string;
  // ── Credit & banking (migration 0020) ──
  creditDays?: number;
  creditLimit?: number;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
  bankAccountHolder: string;
  // ── Logistics & compliance ──
  shipToAddress: string;
  transporter: string;
  otherReferences: string;
  msmeUdyamNo: string;
  // ── GST normalization (ERP Phase 2) ──
  gstRegistrationType?: GstRegistrationType;
  placeOfSupply: string;
  isTransporter: boolean;
  // ── Normalized multi-address / multi-bank children (ERP Phase 2) ──
  //    Shaped as the validator INPUT (nulls folded to undefined) so the form's
  //    field arrays prefill cleanly; DB-only columns (id/timestamps) dropped.
  addresses: ClientAddressInput[];
  bankAccounts: ClientBankAccountInput[];
}

export async function getClientForEdit(
  clientId: string,
): Promise<ClientEditValues | null> {
  const [row] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!row) return null;
  // Fetch all contacts for this client in one query; split by isPrimary below.
  const allContacts = await db
    .select()
    .from(clientContacts)
    .where(eq(clientContacts.clientId, clientId));
  // Normalized children (ERP Phase 2) — drive the multi-address / multi-bank
  // editors. Map DB rows → validator-input shape (null → undefined).
  const [addressRows, bankRows] = await Promise.all([
    getClientAddresses(clientId),
    getClientBankAccounts(clientId),
  ]);
  const addresses: ClientAddressInput[] = addressRows.map((a) => ({
    addressType: a.addressType,
    isPrimary: a.isPrimary,
    label: a.label ?? undefined,
    line1: a.line1 ?? undefined,
    line2: a.line2 ?? undefined,
    line3: a.line3 ?? undefined,
    line4: a.line4 ?? undefined,
    city: a.city ?? undefined,
    state: a.state ?? undefined,
    country: a.country ?? undefined,
    pinCode: a.pinCode ?? undefined,
    gstin: a.gstin ?? undefined,
    notes: a.notes ?? undefined,
  }));
  const bankAccounts: ClientBankAccountInput[] = bankRows.map((b) => ({
    isPrimary: b.isPrimary,
    bankName: b.bankName ?? undefined,
    accountNo: b.accountNo ?? undefined,
    ifsc: b.ifsc ?? undefined,
    branch: b.branch ?? undefined,
    accountHolder: b.accountHolder ?? undefined,
    accountType: b.accountType ?? undefined,
    notes: b.notes ?? undefined,
  }));
  const primary = allContacts.find((c) => c.isPrimary);
  const additional = allContacts.filter((c) => !c.isPrimary);
  // Stored at noon UTC, so an ISO slice gives the intended calendar date.
  const meetingDate = row.kycMeetingDate
    ? row.kycMeetingDate.toISOString().slice(0, 10)
    : "";
  return {
    name: row.name,
    clientCode: row.clientCode ?? undefined,
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
    tags: row.tags ?? [],
    notes: row.notes ?? "",
    contactFirstName: primary?.firstName ?? "",
    contactLastName: primary?.lastName ?? "",
    contactDesignation: primary?.designation ?? "",
    contactNo: primary?.contactNo ?? "",
    contactEmail: primary?.email ?? "",
    contactNotes: primary?.notes ?? "",
    additionalContacts: additional.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName ?? "",
      designation: c.designation ?? "",
      contactNo: c.contactNo ?? "",
      email: c.email ?? "",
      notes: c.notes ?? "",
    })),
    meetingDate,
    meetingStart: row.kycMeetingStart ?? "",
    meetingEnd: row.kycMeetingEnd ?? "",
    meetingNotes: row.kycMeetingNotes ?? "",
    kycSalesPersonId: row.kycSalesPersonId ?? undefined,
    businessCardFrontUrl: row.businessCardFrontUrl ?? undefined,
    businessCardBackUrl: row.businessCardBackUrl ?? undefined,
    // ── Credit & banking (migration 0020) ──
    creditDays: row.creditDays ?? undefined,
    creditLimit: row.creditLimit != null ? Number(row.creditLimit) : undefined,
    bankName: row.bankName ?? "",
    bankAccountNo: row.bankAccountNo ?? "",
    bankIfsc: row.bankIfsc ?? "",
    bankBranch: row.bankBranch ?? "",
    bankAccountHolder: row.bankAccountHolder ?? "",
    // ── Logistics & compliance ──
    shipToAddress: row.shipToAddress ?? "",
    transporter: row.transporter ?? "",
    otherReferences: row.otherReferences ?? "",
    msmeUdyamNo: row.msmeUdyamNo ?? "",
    // ── GST normalization (ERP Phase 2) ──
    gstRegistrationType: row.gstRegistrationType ?? undefined,
    placeOfSupply: row.placeOfSupply ?? "",
    isTransporter: row.isTransporter ?? false,
    // ── Normalized children ──
    addresses,
    bankAccounts,
  };
}

/**
 * Full read-only client record: every column on `clients` plus resolved names
 * for type/product masters and the KYC sales person, and all contacts (primary
 * first). Used by the Client Master record page (Task 6) and any future
 * read-only views. Admin-only caller.
 */
export interface ClientRecord extends Client {
  /** Resolved name for `customerTypeId` (null if unset or master deleted). */
  customerTypeName: string | null;
  /** Resolved name for `industryTypeId` (null if unset or master deleted). */
  industryTypeName: string | null;
  /** Resolved names for each id in `productTypeIds` (empty array if unset). */
  productTypeNames: string[];
  /** Full name of the KYC sales person employee (null if unset or deleted). */
  salesPersonName: string | null;
  /** All contacts for this client — primary contact first, then additional. */
  contacts: ClientContact[];
  /** Normalized addresses (ERP Phase 2) — ordered by type then sort order. */
  addresses: ClientAddress[];
  /** Normalized bank accounts (ERP Phase 2) — primary first, then sort order. */
  bankAccounts: ClientBankAccount[];
}

export async function getClientRecord(
  clientId: string,
): Promise<ClientRecord | null> {
  // ── 1. Core client row + resolved type names (two left joins on masterOptions) ──
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

  // ── 2. Resolve product type names (batch lookup, preserves order) ──
  let productTypeNames: string[] = [];
  if (row.productTypeIds && row.productTypeIds.length > 0) {
    const ptRows = await db
      .select({ id: masterOptions.id, name: masterOptions.name })
      .from(masterOptions)
      .where(inArray(masterOptions.id, row.productTypeIds));
    // Preserve the stored order.
    const nameById = new Map(ptRows.map((r) => [r.id, r.name]));
    productTypeNames = row.productTypeIds
      .map((id) => nameById.get(id))
      .filter((n): n is string => n !== undefined);
  }

  // ── 3. Sales person name ──
  let salesPersonName: string | null = null;
  if (row.kycSalesPersonId) {
    const [sp] = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, row.kycSalesPersonId))
      .limit(1);
    salesPersonName = sp?.name ?? null;
  }

  // ── 4. Contacts — primary first, then additional ──
  const allContacts = await db
    .select()
    .from(clientContacts)
    .where(eq(clientContacts.clientId, clientId))
    .orderBy(asc(clientContacts.createdAt));
  // Sort: primary first, preserving insertion order within each group.
  const contacts: ClientContact[] = [
    ...allContacts.filter((c) => c.isPrimary),
    ...allContacts.filter((c) => !c.isPrimary),
  ];

  // ── 5. Normalized children (ERP Phase 2) ──
  const [addresses, bankAccounts] = await Promise.all([
    getClientAddresses(clientId),
    getClientBankAccounts(clientId),
  ]);

  return {
    ...row,
    customerTypeName: row.customerTypeName ?? null,
    industryTypeName: row.industryTypeName ?? null,
    productTypeNames,
    salesPersonName,
    contacts,
    addresses,
    bankAccounts,
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
    tags: row.tags,
    notes: row.notes ?? null,
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
