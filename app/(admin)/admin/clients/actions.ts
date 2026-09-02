"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients,
  clientContacts,
  clientAddresses,
  clientBankAccounts,
  inquiries,
  tasks,
  settingsEvents,
} from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  CreateClientSchema,
  UpdateClientSchema,
  ClientIdSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from "@/lib/validators/client";
import {
  CreateClientKycSchema,
  type CreateClientKycInput,
} from "@/lib/validators/client-kyc";
import {
  buildKycClientPatch,
  normalizeAddressRows,
  normalizeBankRows,
  applyPrimaryMirror,
} from "@/lib/clients/kyc-write";
import { recordAudit } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";
import { findActiveDuplicateClient } from "@/lib/clients/dedup";

// Scalar editable columns tracked by the audit trail.
// contactFirstName / additionalContacts are stored in client_contacts - not here.
const AUDITED_CLIENT_FIELDS = [
  "name",
  "customerTypeIds",
  "industryTypeIds",
  "productTypeIds",
  "gstin",
  "panNo",
  "gstRegistrationType",
  "placeOfSupply",
  "isTransporter",
  "paymentTerms",
  "creditDays",
  "creditLimit",
  "bankName",
  "bankAccountNo",
  "bankIfsc",
  "bankBranch",
  "bankAccountHolder",
  "shipToAddress",
  "transporter",
  "otherReferences",
  "msmeUdyamNo",
  "freightCharges",
  "qtyDeviation",
  "addressLine1",
  "addressLine2",
  "addressLine3",
  "addressLine4",
  "city",
  "state",
  "pinCode",
  "notes",
  "kycSalesPersonId",
  "tags",
] as const;

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function revalidateClientSurfaces() {
  revalidatePath("/clients");
  revalidatePath("/tasks/new");
  revalidatePath("/tasks");
  revalidatePath("/");
  // A client rename rewrites `tasks.title` in place (see updateClient),
  // which means cached task-derived data (nav counts, listDistinctSubjects)
  // is now stale. Invalidate the tasks tag too - `updateTag` only
  // works inside server actions, which this helper is exclusively
  // called from.
  updateTag(CACHE_TAGS.tasks);
  // Drop the cached `listActiveClientNames` payload so the picker
  // immediately reflects new/renamed/deactivated clients.
  updateTag(CACHE_TAGS.clients);
}

export async function createClient(
  input: CreateClientInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = CreateClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Reject case-insensitive duplicates so the unique constraint never
  // surfaces as a raw DB error.
  const existing = await db
    .select({ id: clients.id })
    .from(clients)
    .where(sql`lower(${clients.name}) = lower(${parsed.data.name})`)
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: "A client with this name already exists." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(clients)
      .values({
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder ?? 100,
      })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  try {
    await db.insert(settingsEvents).values({
      scope: "client",
      targetId: inserted.id,
      actorId: me.id,
      eventType: "created",
      toValue: { name: inserted.name, sortOrder: inserted.sortOrder },
    });
  } catch (err) {
    console.error("[createClient] audit write failed", err);
  }

  await recordAudit({
    entityType: "client",
    entityId: inserted.id,
    entityLabel: inserted.name,
    action: "create",
    actorId: me.id,
    actorName: me.name,
    summary: "Client created",
  });

  revalidateClientSurfaces();
  return { ok: true, id: inserted.id };
}

/**
 * Deactivate a client (ERP Phase 4 governance - deactivate-only). Clients are
 * NEVER hard-deleted: a master referenced by past inquiries/quotes/orders must
 * keep its row so those transactions stay intact. This sets is_active=false +
 * deleted_at so the client drops out of the picker but the record survives.
 * Kept the `deleteClient` export name so existing callers need no change.
 */
export async function deleteClient(
  clientId: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = ClientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid client id" };
  }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, parsedId.data),
  });
  if (!client) return { ok: false, error: "Client not found" };
  if (!client.isActive) return { ok: true }; // already deactivated - idempotent

  try {
    await db
      .update(clients)
      .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(clients.id, client.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "client",
      targetId: client.id,
      actorId: me.id,
      eventType: "updated",
      fromValue: { isActive: true },
      toValue: { isActive: false },
    });
  } catch (err) {
    console.error("[deleteClient] audit write failed", err);
  }

  await recordAudit({
    entityType: "client",
    entityId: client.id,
    entityLabel: client.name,
    action: "delete",
    actorId: me.id,
    actorName: me.name,
    summary: `Client "${client.name}" deactivated`,
  });

  revalidateClientSurfaces();
  return { ok: true };
}

/**
 * Reactivate a previously-deactivated client (ERP Phase 4). Clears the
 * deactivation flags so the client returns to the picker.
 */
export async function reactivateClient(
  clientId: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = ClientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid client id" };
  }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, parsedId.data),
  });
  if (!client) return { ok: false, error: "Client not found" };
  if (client.isActive) return { ok: true }; // already active - idempotent

  try {
    await db
      .update(clients)
      .set({ isActive: true, deletedAt: null, updatedAt: new Date() })
      .where(eq(clients.id, client.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "client",
      targetId: client.id,
      actorId: me.id,
      eventType: "updated",
      fromValue: { isActive: false },
      toValue: { isActive: true },
    });
  } catch (err) {
    console.error("[reactivateClient] audit write failed", err);
  }

  await recordAudit({
    entityType: "client",
    entityId: client.id,
    entityLabel: client.name,
    action: "restore",
    actorId: me.id,
    actorName: me.name,
    summary: `Client "${client.name}" reactivated`,
  });

  revalidateClientSurfaces();
  return { ok: true };
}

/**
 * Safe Delete → Recycle Bin (2026-09). Soft-deletes a client to a recoverable
 * bin (purged after 48h) — but ONLY when the client has NO enquiries. A client
 * referenced by the pipeline must never be removed (it would orphan those
 * enquiries/quotes/orders), so we refuse and point to Deactivate instead.
 * Admin-only, same governance as deactivate.
 */
export async function recycleClient(clientId: string): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = ClientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid client id" };
  }

  const client = await db.query.clients.findFirst({ where: eq(clients.id, parsedId.data) });
  if (!client) return { ok: false, error: "Client not found" };
  if (client.recycledAt) return { ok: true }; // already recycled — idempotent

  // Guard: a client with enquiries must not be deleted (would orphan the pipeline).
  const enquiryCount = await db.$count(inquiries, eq(inquiries.clientId, client.id));
  if (enquiryCount > 0) {
    return {
      ok: false,
      error:
        `This client has ${enquiryCount} enquir${enquiryCount === 1 ? "y" : "ies"} — it can't be deleted. Deactivate it instead.`,
    };
  }

  try {
    await db
      .update(clients)
      .set({ recycledAt: new Date(), isActive: false, updatedAt: new Date() })
      .where(eq(clients.id, client.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordAudit({
    entityType: "client",
    entityId: client.id,
    entityLabel: client.name,
    action: "delete",
    actorId: me.id,
    actorName: me.name,
    summary: `Client "${client.name}" moved to Recycle Bin`,
  });

  revalidateClientSurfaces();
  revalidatePath("/clients/recycle-bin");
  return { ok: true };
}

/**
 * Restore a recycled client back to the register (clears the recycle marker and
 * reactivates it). Admin-only.
 */
export async function restoreClient(clientId: string): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = ClientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid client id" };
  }

  const client = await db.query.clients.findFirst({ where: eq(clients.id, parsedId.data) });
  if (!client) return { ok: false, error: "Client not found" };
  if (!client.recycledAt) return { ok: true }; // not recycled — idempotent

  try {
    await db
      .update(clients)
      .set({ recycledAt: null, isActive: true, updatedAt: new Date() })
      .where(eq(clients.id, client.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordAudit({
    entityType: "client",
    entityId: client.id,
    entityLabel: client.name,
    action: "restore",
    actorId: me.id,
    actorName: me.name,
    summary: `Client "${client.name}" restored from Recycle Bin`,
  });

  revalidateClientSurfaces();
  revalidatePath("/clients/recycle-bin");
  return { ok: true };
}

/**
 * Purge clients recycled more than 48h ago (cron). Children (contacts /
 * addresses / bank) cascade; any loose reference is ON DELETE SET NULL, so the
 * hard delete never fails. Returns how many were purged.
 */
export async function purgeExpiredRecycledClients(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const purged = await db
    .delete(clients)
    .where(and(isNotNull(clients.recycledAt), lt(clients.recycledAt, cutoff)))
    .returning({ id: clients.id });
  return purged.length;
}

/**
 * Admin "Edit client" full-form save - overwrites every KYC field the form
 * shows (Company / types / products / address / contact / meeting / cards),
 * blanking any field the admin cleared. Currency/country/export are NOT
 * touched (the form has no inputs for them). A rename propagates to
 * `tasks.title` exactly like `updateClient`, so the task picker stays
 * consistent.
 */
export async function adminUpdateClientKyc(
  clientId: string,
  input: CreateClientKycInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = ClientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid client id" };
  }
  const parsed = CreateClientKycSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  if (v.meetingDate && Number.isNaN(new Date(v.meetingDate).getTime())) {
    return { ok: false, error: "Invalid meeting date" };
  }

  const client = await db.query.clients.findFirst({ where: eq(clients.id, parsedId.data) });
  if (!client) return { ok: false, error: "Client not found" };

  // Block a rename that collides (case-insensitive) with another client.
  if (v.name.toLowerCase() !== client.name.toLowerCase()) {
    const clash = await db
      .select({ id: clients.id })
      .from(clients)
      .where(sql`lower(${clients.name}) = lower(${v.name})`)
      .limit(1);
    if (clash[0] && clash[0].id !== client.id) {
      return { ok: false, error: "A client with this name already exists." };
    }
  }

  // Hard dedup (ERP Phase 4): block an edit that would collide with ANOTHER
  // active client's GSTIN/PAN. Excludes the client being edited.
  const dup = await findActiveDuplicateClient({
    gstin: v.gstin,
    panNo: v.panNo,
    excludeId: client.id,
  });
  if (dup) {
    return {
      ok: false,
      error: `A client with this GSTIN/PAN already exists: ${dup.name}${dup.clientCode ? ` (${dup.clientCode})` : ""}.`,
    };
  }

  // ── Normalize the submitted children (ERP Phase 2) ──────────────────────
  // Enforce "exactly one primary per addressType" and "exactly one primary
  // bank overall" (see lib/clients/kyc-write.ts). `undefined` ⇒ not submitted.
  const addressRows = normalizeAddressRows(client.id, v.addresses);
  const bankRows = normalizeBankRows(client.id, v.bankAccounts);

  // Full overwrite of the form-managed columns - a cleared field becomes NULL.
  const patch: Partial<typeof clients.$inferInsert> = {
    ...buildKycClientPatch(v),
    name: v.name,
    updatedAt: new Date(),
  };

  // ── Mirror PRIMARY children → legacy `clients` columns (back-compat) ──────
  // Only override when the corresponding children were submitted; otherwise
  // leave the legacy columns as the scalar form fields above already set them.
  applyPrimaryMirror(patch, addressRows, bankRows);

  try {
    await db.transaction(async (tx) => {
      await tx.update(clients).set(patch).where(eq(clients.id, client.id));

      // ── Replace-all the normalized children (only when submitted) ──
      if (addressRows !== undefined) {
        await tx.delete(clientAddresses).where(eq(clientAddresses.clientId, client.id));
        if (addressRows.length > 0) {
          await tx.insert(clientAddresses).values(addressRows);
        }
      }
      if (bankRows !== undefined) {
        await tx.delete(clientBankAccounts).where(eq(clientBankAccounts.clientId, client.id));
        if (bankRows.length > 0) {
          await tx.insert(clientBankAccounts).values(bankRows);
        }
      }

      // A client name IS the task's title - propagate a rename to every task.
      if (v.name !== client.name) {
        await tx
          .update(tasks)
          .set({ title: v.name })
          .where(sql`lower(${tasks.title}) = lower(${client.name})`);
      }

      // Primary contact: firstName is NOT NULL and anchors the row, so we only
      // upsert when a first name is present. With a name, every other contact
      // field is overwritten (cleared fields → NULL).
      if (v.contactFirstName) {
        const contactVals = {
          firstName: v.contactFirstName,
          lastName: v.contactLastName ?? null,
          designation: v.contactDesignation ?? null,
          contactNo: v.contactNo ?? null,
          email: v.contactEmail ?? null,
          notes: v.contactNotes ?? null,
        };
        const [primary] = await tx
          .select({ id: clientContacts.id })
          .from(clientContacts)
          .where(and(eq(clientContacts.clientId, client.id), eq(clientContacts.isPrimary, true)))
          .limit(1);
        if (primary) {
          await tx
            .update(clientContacts)
            .set({ ...contactVals, updatedAt: new Date() })
            .where(eq(clientContacts.id, primary.id));
        } else {
          await tx.insert(clientContacts).values({ clientId: client.id, ...contactVals });
        }
      }

      // Replace additional (non-primary) contacts: delete old, insert new.
      await tx
        .delete(clientContacts)
        .where(and(eq(clientContacts.clientId, client.id), ne(clientContacts.isPrimary, true)));
      if (v.additionalContacts && v.additionalContacts.length > 0) {
        for (const ac of v.additionalContacts) {
          if (!ac.firstName) continue;
          await tx.insert(clientContacts).values({
            clientId: client.id,
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
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("clients_name_unique") || msg.includes("clients_name_lower_uidx")) {
      return { ok: false, error: "A client with this name already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "client",
      targetId: client.id,
      actorId: me.id,
      eventType: "updated",
      fromValue: { name: client.name },
      toValue: { name: v.name },
    });
  } catch (err) {
    console.error("[adminUpdateClientKyc] audit write failed", err);
  }

  // Field-level diff audit: build before/after snapshots keyed by audited fields.
  const beforeSnapshot: Record<string, unknown> = {
    name: client.name,
    customerTypeIds: client.customerTypeIds,
    industryTypeIds: client.industryTypeIds,
    productTypeIds: client.productTypeIds,
    gstin: client.gstin,
    panNo: client.panNo,
    gstRegistrationType: client.gstRegistrationType,
    placeOfSupply: client.placeOfSupply,
    isTransporter: client.isTransporter,
    paymentTerms: client.paymentTerms,
    creditDays: client.creditDays,
    creditLimit: client.creditLimit,
    bankName: client.bankName,
    bankAccountNo: client.bankAccountNo,
    bankIfsc: client.bankIfsc,
    bankBranch: client.bankBranch,
    bankAccountHolder: client.bankAccountHolder,
    shipToAddress: client.shipToAddress,
    transporter: client.transporter,
    otherReferences: client.otherReferences,
    msmeUdyamNo: client.msmeUdyamNo,
    freightCharges: client.freightCharges,
    qtyDeviation: client.qtyDeviation,
    addressLine1: client.addressLine1,
    addressLine2: client.addressLine2,
    addressLine3: client.addressLine3,
    addressLine4: client.addressLine4,
    city: client.city,
    state: client.state,
    pinCode: client.pinCode,
    notes: client.notes,
    kycSalesPersonId: client.kycSalesPersonId,
    tags: client.tags,
  };
  const afterSnapshot: Record<string, unknown> = {
    name: v.name,
    customerTypeIds: v.customerTypeIds ?? null,
    industryTypeIds: v.industryTypeIds ?? null,
    productTypeIds: v.productTypeIds ?? null,
    gstin: v.gstin ?? null,
    panNo: v.panNo ?? null,
    gstRegistrationType: v.gstRegistrationType ?? null,
    placeOfSupply: v.placeOfSupply ?? null,
    isTransporter: v.isTransporter ?? false,
    paymentTerms: v.paymentTerms ?? null,
    creditDays: v.creditDays ?? null,
    creditLimit: v.creditLimit != null ? String(v.creditLimit) : null,
    bankName: v.bankName ?? null,
    bankAccountNo: v.bankAccountNo ?? null,
    bankIfsc: v.bankIfsc ?? null,
    bankBranch: v.bankBranch ?? null,
    bankAccountHolder: v.bankAccountHolder ?? null,
    shipToAddress: v.shipToAddress ?? null,
    transporter: v.transporter ?? null,
    otherReferences: v.otherReferences ?? null,
    msmeUdyamNo: v.msmeUdyamNo ?? null,
    freightCharges: v.freightCharges ?? null,
    qtyDeviation: v.qtyDeviation ?? null,
    addressLine1: v.addressLine1 ?? null,
    addressLine2: v.addressLine2 ?? null,
    addressLine3: v.addressLine3 ?? null,
    addressLine4: v.addressLine4 ?? null,
    city: v.city ?? null,
    state: v.state ?? null,
    pinCode: v.pinCode ?? null,
    notes: v.notes ?? null,
    kycSalesPersonId: v.kycSalesPersonId ?? null,
    tags: v.tags ?? null,
  };
  const changes = diffFields(beforeSnapshot, afterSnapshot, AUDITED_CLIENT_FIELDS);
  await recordAudit({
    entityType: "client",
    entityId: client.id,
    entityLabel: v.name ?? client.name,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    changes,
  });

  // Child rows (addresses / bank accounts) aren't field-diffed - record a
  // single summary entry when either was submitted.
  if (addressRows !== undefined || bankRows !== undefined) {
    await recordAudit({
      entityType: "client",
      entityId: client.id,
      entityLabel: v.name,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      summary: "Addresses/bank updated",
    });
  }

  revalidateClientSurfaces();
  revalidatePath(`/clients/${client.id}/edit`);
  return { ok: true };
}

export async function updateClient(
  clientId: string,
  fields: UpdateClientInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = ClientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid client id" };
  }

  const parsed = UpdateClientSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, parsedId.data),
  });
  if (!client) return { ok: false, error: "Client not found" };

  // Block a rename that collides (case-insensitive) with another client.
  if (parsed.data.name !== undefined && parsed.data.name !== client.name) {
    const clash = await db
      .select({ id: clients.id })
      .from(clients)
      .where(sql`lower(${clients.name}) = lower(${parsed.data.name})`)
      .limit(1);
    if (clash[0] && clash[0].id !== client.id) {
      return { ok: false, error: "A client with this name already exists." };
    }
  }

  const patch: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;

  try {
    await db.update(clients).set(patch).where(eq(clients.id, client.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("clients_name_unique")) {
      return { ok: false, error: "A client with this name already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  // A client name IS the task's title (the "Client Name" field), so a
  // rename must propagate to every task filed under the old name to keep
  // the picker, exports and detail views consistent.
  if (parsed.data.name !== undefined && parsed.data.name !== client.name) {
    try {
      await db
        .update(tasks)
        .set({ title: parsed.data.name })
        .where(sql`lower(${tasks.title}) = lower(${client.name})`);
    } catch (err) {
      console.error("[updateClient] failed to propagate rename to tasks.title", err);
    }
  }

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    if (parsed.data.name !== undefined && parsed.data.name !== client.name) {
      fromValue.name = client.name;
      toValue.name = parsed.data.name;
    }
    if (parsed.data.isActive !== undefined && parsed.data.isActive !== client.isActive) {
      fromValue.isActive = client.isActive;
      toValue.isActive = parsed.data.isActive;
    }
    if (parsed.data.sortOrder !== undefined && parsed.data.sortOrder !== client.sortOrder) {
      fromValue.sortOrder = client.sortOrder;
      toValue.sortOrder = parsed.data.sortOrder;
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(settingsEvents).values({
        scope: "client",
        targetId: client.id,
        actorId: me.id,
        eventType: "updated",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[updateClient] audit write failed", err);
  }

  revalidateClientSurfaces();
  return { ok: true };
}

export interface DuplicateClientMatch {
  id: string;
  name: string;
  clientCode: string | null;
}

/**
 * GSTIN/PAN dedup probe for the KYC form (ERP Phase 2). Returns OTHER clients
 * whose normalized (trim + upper) `gstin` or `pan_no` equals a supplied
 * non-empty value, excluding `excludeId` (the client being edited). The form
 * uses this to warn - it is NON-BLOCKING; an empty payload returns `[]`.
 */
export async function checkClientDuplicate(input: {
  gstin?: string | null;
  panNo?: string | null;
  excludeId?: string | null;
}): Promise<DuplicateClientMatch[]> {
  await requireUser();

  const gstin = input.gstin?.trim().toUpperCase() ?? "";
  const panNo = input.panNo?.trim().toUpperCase() ?? "";
  if (!gstin && !panNo) return [];

  const matchClauses: ReturnType<typeof sql>[] = [];
  if (gstin) matchClauses.push(sql`upper(trim(${clients.gstin})) = ${gstin}`);
  if (panNo) matchClauses.push(sql`upper(trim(${clients.panNo})) = ${panNo}`);
  const matchExpr = matchClauses.reduce((acc, clause) =>
    acc ? sql`${acc} OR ${clause}` : clause,
  );

  const exclude = input.excludeId?.trim();
  const where = exclude
    ? sql`(${matchExpr}) AND ${clients.id} <> ${exclude}`
    : matchExpr;

  const rows = await db
    .select({ id: clients.id, name: clients.name, clientCode: clients.clientCode })
    .from(clients)
    .where(where);

  return rows;
}
