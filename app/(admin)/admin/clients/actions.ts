"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, clientContacts, tasks, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
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
import { recordAudit } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";

// Scalar editable columns tracked by the audit trail.
// contactFirstName / additionalContacts are stored in client_contacts — not here.
const AUDITED_CLIENT_FIELDS = [
  "name",
  "customerTypeId",
  "industryTypeId",
  "productTypeIds",
  "gstin",
  "panNo",
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
  revalidatePath("/admin/clients");
  revalidatePath("/tasks/new");
  revalidatePath("/tasks");
  revalidatePath("/");
  // A client rename rewrites `tasks.title` in place (see updateClient),
  // which means cached task-derived data (nav counts, listDistinctSubjects)
  // is now stale. Invalidate the tasks tag too — `updateTag` only
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

  // Roster-only delete: `clients` is just the picker list (no FK from tasks),
  // so removing a row leaves every task untouched — tasks keep their existing
  // Client Name text. This only removes the name from the picker.
  try {
    await db.delete(clients).where(eq(clients.id, client.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "client",
      targetId: client.id,
      actorId: me.id,
      eventType: "deleted",
      fromValue: { name: client.name },
      toValue: null,
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
    summary: `Client "${client.name}" deleted`,
  });

  revalidateClientSurfaces();
  return { ok: true };
}

/**
 * Admin "Edit client" full-form save — overwrites every KYC field the form
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

  // Full overwrite of the form-managed columns — a cleared field becomes NULL.
  const patch: Partial<typeof clients.$inferInsert> = {
    name: v.name,
    customerTypeId: v.customerTypeId ?? null,
    industryTypeId: v.industryTypeId ?? null,
    productTypeIds: v.productTypeIds ?? null,
    state: v.state ?? null,
    city: v.city ?? null,
    addressLine1: v.addressLine1 ?? null,
    addressLine2: v.addressLine2 ?? null,
    addressLine3: v.addressLine3 ?? null,
    addressLine4: v.addressLine4 ?? null,
    pinCode: v.pinCode ?? null,
    gstin: v.gstin ?? null,
    panNo: v.panNo ?? null,
    billToAddress: v.billToAddress ?? null,
    paymentTerms: v.paymentTerms ?? null,
    freightCharges: v.freightCharges ?? null,
    qtyDeviation: v.qtyDeviation ?? null,
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
    tags: v.tags ?? null,
    kycMeetingDate: v.meetingDate ? new Date(v.meetingDate) : null,
    kycMeetingStart: v.meetingStart ?? null,
    kycMeetingEnd: v.meetingEnd ?? null,
    kycMeetingNotes: v.meetingNotes ?? null,
    kycSalesPersonId: v.kycSalesPersonId ?? null,
    businessCardFrontUrl: v.businessCardFrontUrl ?? null,
    businessCardBackUrl: v.businessCardBackUrl ?? null,
    notes: v.notes ?? null,
    updatedAt: new Date(),
  };

  try {
    await db.transaction(async (tx) => {
      await tx.update(clients).set(patch).where(eq(clients.id, client.id));

      // A client name IS the task's title — propagate a rename to every task.
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
    customerTypeId: client.customerTypeId,
    industryTypeId: client.industryTypeId,
    productTypeIds: client.productTypeIds,
    gstin: client.gstin,
    panNo: client.panNo,
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
    customerTypeId: v.customerTypeId ?? null,
    industryTypeId: v.industryTypeId ?? null,
    productTypeIds: v.productTypeIds ?? null,
    gstin: v.gstin ?? null,
    panNo: v.panNo ?? null,
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

  revalidateClientSurfaces();
  revalidatePath(`/admin/clients/${client.id}/edit`);
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
