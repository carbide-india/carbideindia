"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients,
  clientContacts,
  clientAddresses,
  clientBankAccounts,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  CreateClientKycSchema,
  UpdateClientKycSchema,
  type CreateClientKycInput,
  type UpdateClientKycInput,
} from "@/lib/validators/client-kyc";
import {
  buildKycClientPatch,
  normalizeAddressRows,
  normalizeBankRows,
  applyPrimaryMirror,
} from "@/lib/clients/kyc-write";

/**
 * Client KYC server actions (Phase 3 — onboarding write path). Unlike the
 * admin roster actions these are open to any authenticated user — KYC is a
 * sales-floor form, mirroring how createInquiry already upserts clients.
 *
 * NOTE on audit logging: there is intentionally none here (same deferred
 * decision as the inquiry actions — settings_events is admin-scoped).
 */

type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Drops keys whose value is `undefined`. The validators' OptionalText fields
 * fold `""` → `undefined`, so a "filled" form patch can legitimately arrive
 * as `{ field: undefined }` — which passes the nonempty refine but must not
 * reach `.set()` (and an all-undefined patch must not reach the db at all).
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** `meetingDate` is a free string in the validator — guard before `new Date`. */
function isParseableDate(s: string): boolean {
  return !Number.isNaN(new Date(s).getTime());
}

type ClientPatch = Partial<typeof clients.$inferInsert>;
type ContactPatch = Partial<typeof clientContacts.$inferInsert>;

/** Validator KYC fields → `clients` columns (defined keys only). */
function toClientColumns(v: {
  customerTypeId?: string; industryTypeId?: string; productTypeIds?: string[];
  export?: boolean; currency?: string; country?: string;
  state?: string; city?: string;
  addressLine1?: string; addressLine2?: string;
  addressLine3?: string; addressLine4?: string; pinCode?: string;
  gstin?: string; panNo?: string; billToAddress?: string;
  paymentTerms?: string; freightCharges?: string; qtyDeviation?: string;
  tags?: string[];
  notes?: string;
  meetingDate?: string; meetingStart?: string; meetingEnd?: string;
  meetingNotes?: string; kycSalesPersonId?: string;
  businessCardFrontUrl?: string; businessCardBackUrl?: string;
}): ClientPatch {
  const patch: ClientPatch = stripUndefined({
    customerTypeId: v.customerTypeId,
    industryTypeId: v.industryTypeId,
    productTypeIds: v.productTypeIds,
    export: v.export,
    currency: v.currency,
    country: v.country,
    state: v.state,
    city: v.city,
    addressLine1: v.addressLine1,
    addressLine2: v.addressLine2,
    addressLine3: v.addressLine3,
    addressLine4: v.addressLine4,
    pinCode: v.pinCode,
    gstin: v.gstin,
    panNo: v.panNo,
    billToAddress: v.billToAddress,
    paymentTerms: v.paymentTerms,
    freightCharges: v.freightCharges,
    qtyDeviation: v.qtyDeviation,
    tags: v.tags,
    notes: v.notes,
    kycMeetingStart: v.meetingStart,
    kycMeetingEnd: v.meetingEnd,
    kycMeetingNotes: v.meetingNotes,
    kycSalesPersonId: v.kycSalesPersonId,
    businessCardFrontUrl: v.businessCardFrontUrl,
    businessCardBackUrl: v.businessCardBackUrl,
  });
  if (v.meetingDate !== undefined) patch.kycMeetingDate = new Date(v.meetingDate);
  return patch;
}

/** Validator contact fields → `client_contacts` columns (defined keys only). */
function toContactColumns(v: {
  contactFirstName?: string; contactLastName?: string;
  contactDesignation?: string;
  contactNo?: string; contactEmail?: string;
  contactNotes?: string;
}): ContactPatch {
  return stripUndefined({
    firstName: v.contactFirstName,
    lastName: v.contactLastName,
    designation: v.contactDesignation,
    contactNo: v.contactNo,
    email: v.contactEmail,
    notes: v.contactNotes,
  });
}

/**
 * Update-or-insert the client's PRIMARY contact inside the given tx. Insert
 * needs a firstName (NOT NULL) — a stray phone number with no name updates
 * an existing primary but never creates a nameless row.
 */
async function upsertPrimaryContact(
  tx: Pick<typeof db, "select" | "insert" | "update">,
  clientId: string,
  contact: ContactPatch,
): Promise<void> {
  if (Object.keys(contact).length === 0) return;
  const [primary] = await tx
    .select({ id: clientContacts.id })
    .from(clientContacts)
    .where(and(eq(clientContacts.clientId, clientId), eq(clientContacts.isPrimary, true)))
    .limit(1);
  if (primary) {
    await tx
      .update(clientContacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(eq(clientContacts.id, primary.id));
  } else if (contact.firstName) {
    await tx.insert(clientContacts).values({ clientId, firstName: contact.firstName, ...contact });
  }
}

export async function createClientKyc(
  input: CreateClientKycInput,
): Promise<ActionResult> {
  await requireUser();
  const parsed = CreateClientKycSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  if (v.meetingDate && !isParseableDate(v.meetingDate)) {
    return { ok: false, error: "Invalid meeting date" };
  }

  try {
    const clientId = await db.transaction(async (tx) => {
      // Upsert-by-name: an existing client gets its KYC filled in, not duplicated
      // (same lower(name) contract as createInquiry).
      const [existing] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(sql`lower(${clients.name}) = ${v.name.toLowerCase()}`)
        .limit(1);

      // Full KYC patch — captures the WHOLE onboarding form (addresses, bank,
      // GST, PAN, MSME, credit, ship-to) via the shared writer helper so the
      // sales-floor path persists exactly what the admin Edit path does.
      const patch: Partial<typeof clients.$inferInsert> = {
        ...buildKycClientPatch(v),
        name: v.name,
        updatedAt: new Date(),
      };

      let id: string;
      if (existing) {
        id = existing.id;
      } else {
        const [c] = await tx
          .insert(clients)
          .values({ ...patch, name: v.name })
          .returning({ id: clients.id });
        if (!c) throw new Error("clients insert returned no row");
        id = c.id;
      }

      // Now that the client id is known, normalize the children and mirror the
      // PRIMARY rows back into the legacy `clients` columns, then write.
      const addressRows = normalizeAddressRows(id, v.addresses);
      const bankRows = normalizeBankRows(id, v.bankAccounts);
      applyPrimaryMirror(patch, addressRows, bankRows);

      if (existing) {
        await tx.update(clients).set(patch).where(eq(clients.id, id));
      } else if (addressRows !== undefined || bankRows !== undefined) {
        // For a fresh insert the mirror may have changed legacy columns after
        // children were normalized — re-apply the patch to capture them.
        await tx.update(clients).set(patch).where(eq(clients.id, id));
      }

      // Replace-all the normalized children (only when submitted). The delete is
      // a no-op for a brand-new id; for the upsert-existing branch it replaces.
      if (addressRows !== undefined) {
        await tx.delete(clientAddresses).where(eq(clientAddresses.clientId, id));
        if (addressRows.length > 0) {
          await tx.insert(clientAddresses).values(addressRows);
        }
      }
      if (bankRows !== undefined) {
        await tx.delete(clientBankAccounts).where(eq(clientBankAccounts.clientId, id));
        if (bankRows.length > 0) {
          await tx.insert(clientBankAccounts).values(bankRows);
        }
      }

      await upsertPrimaryContact(tx, id, toContactColumns(v));

      // Insert additional (non-primary) contacts if provided.
      if (v.additionalContacts && v.additionalContacts.length > 0) {
        for (const ac of v.additionalContacts) {
          if (!ac.firstName) continue;
          await tx.insert(clientContacts).values({
            clientId: id,
            firstName: ac.firstName,
            lastName: ac.lastName ?? null,
            designation: ac.designation ?? null,
            contactNo: ac.contactNo ?? null,
            email: ac.email ?? null,
            notes: ac.notes ?? null,
            isPrimary: false,
          });
        }
      }

      return id;
    });

    // Mirror the admin clients actions: drop the cached picker payload and
    // refresh the register view.
    updateTag(CACHE_TAGS.clients);
    revalidatePath("/admin/clients");
    return { ok: true, id: clientId };
  } catch (err) {
    console.error("[createClientKyc] failed", err);
    return { ok: false, error: "Could not save the client. Please try again." };
  }
}

export async function updateClientKyc(
  id: string,
  input: UpdateClientKycInput,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid client id." };
  const parsed = UpdateClientKycSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = stripUndefined(parsed.data);
  if (Object.keys(v).length === 0) return { ok: true }; // everything folded away
  if (v.meetingDate !== undefined && !isParseableDate(v.meetingDate)) {
    return { ok: false, error: "Invalid meeting date" };
  }

  const clientPatch = toClientColumns(v);
  if (v.name !== undefined) clientPatch.name = v.name;
  const contactPatch = toContactColumns(v);

  try {
    await db.transaction(async (tx) => {
      if (Object.keys(clientPatch).length > 0) {
        await tx
          .update(clients)
          .set({ ...clientPatch, updatedAt: new Date() })
          .where(eq(clients.id, id));
      }
      await upsertPrimaryContact(tx, id, contactPatch);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("clients_name_unique") || msg.includes("clients_name_lower_uidx")) {
      return { ok: false, error: "A client with this name already exists." };
    }
    console.error("[updateClientKyc] failed", err);
    return { ok: false, error: "Could not save the client. Please try again." };
  }
  updateTag(CACHE_TAGS.clients);
  revalidatePath("/admin/clients");
  return { ok: true };
}
