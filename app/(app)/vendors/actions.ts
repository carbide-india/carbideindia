"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  CreateVendorSchema,
  UpdateVendorSchema,
  VendorIdSchema,
  type CreateVendorInput,
  type UpdateVendorInput,
} from "@/lib/validators/vendor";

/**
 * Vendor Master server actions (Form 05). Vendors are a MASTER — like clients —
 * so every write is `requireAdmin`-gated. Governance is deactivate-only: a
 * vendor referenced by a past bought-out costing must keep its row, so we never
 * hard-delete (mirrors the client `deleteClient`/`reactivateClient` pattern).
 *
 * The human `vendorCode` (VN-0001) is drawn from `vendors_vendor_code_seq` by the
 * column default on INSERT — the action never sets it.
 */

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** True when a DB error is the case-insensitive vendor-name unique violation. */
function isNameClash(msg: string): boolean {
  return msg.includes("vendors_name_lower_uidx") || msg.includes("vendors_name_unique");
}

export async function createVendor(
  input: CreateVendorInput,
): Promise<ActionResult<{ id: string; vendorCode: string | null }>> {
  const me = await requireAdmin();

  const parsed = CreateVendorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  // Reject case-insensitive duplicates up front so the unique index never
  // surfaces as a raw DB error (mirrors createClient).
  const existing = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(sql`lower(${vendors.name}) = lower(${v.name})`)
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: "A vendor with this name already exists." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(vendors)
      .values({
        name: v.name,
        contactPerson: v.contactPerson ?? null,
        contactNo: v.contactNo ?? null,
        email: v.email ?? null,
        address: v.address ?? null,
        addressLine1: v.addressLine1 ?? null,
        addressLine2: v.addressLine2 ?? null,
        addressLine3: v.addressLine3 ?? null,
        addressLine4: v.addressLine4 ?? null,
        city: v.city ?? null,
        state: v.state ?? null,
        pinCode: v.pinCode ?? null,
        defaultCreditDays: v.defaultCreditDays ?? null,
        paymentTerms: v.paymentTerms ?? null,
        isGstApplicable: v.isGstApplicable ?? true,
        notes: v.notes ?? null,
        sortOrder: v.sortOrder ?? 100,
        createdById: me.id,
        // vendorCode omitted → drawn from vendors_vendor_code_seq default.
      })
      .returning({ id: vendors.id, vendorCode: vendors.vendorCode });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isNameClash(msg)) {
      return { ok: false, error: "A vendor with this name already exists." };
    }
    console.error("[createVendor] failed", err);
    return { ok: false, error: "Could not save the vendor. Please try again." };
  }
  if (!inserted) return { ok: false, error: "Could not save the vendor. Please try again." };

  revalidatePath("/vendors");
  return { ok: true, id: inserted.id, vendorCode: inserted.vendorCode };
}

export async function updateVendor(
  vendorId: string,
  input: UpdateVendorInput,
): Promise<ActionResult> {
  await requireAdmin();

  const parsedId = VendorIdSchema.safeParse(vendorId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid vendor id" };
  }
  const parsed = UpdateVendorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const vendor = await db.query.vendors.findFirst({
    where: eq(vendors.id, parsedId.data),
  });
  if (!vendor) return { ok: false, error: "Vendor not found" };

  // Block a rename that collides (case-insensitive) with another vendor.
  if (v.name.toLowerCase() !== vendor.name.toLowerCase()) {
    const clash = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(sql`lower(${vendors.name}) = lower(${v.name})`)
      .limit(1);
    if (clash[0] && clash[0].id !== vendor.id) {
      return { ok: false, error: "A vendor with this name already exists." };
    }
  }

  try {
    await db
      .update(vendors)
      .set({
        name: v.name,
        contactPerson: v.contactPerson ?? null,
        contactNo: v.contactNo ?? null,
        email: v.email ?? null,
        address: v.address ?? null,
        addressLine1: v.addressLine1 ?? null,
        addressLine2: v.addressLine2 ?? null,
        addressLine3: v.addressLine3 ?? null,
        addressLine4: v.addressLine4 ?? null,
        city: v.city ?? null,
        state: v.state ?? null,
        pinCode: v.pinCode ?? null,
        defaultCreditDays: v.defaultCreditDays ?? null,
        paymentTerms: v.paymentTerms ?? null,
        ...(v.isGstApplicable !== undefined ? { isGstApplicable: v.isGstApplicable } : {}),
        notes: v.notes ?? null,
        ...(v.sortOrder !== undefined ? { sortOrder: v.sortOrder } : {}),
        updatedAt: new Date(),
      })
      .where(eq(vendors.id, vendor.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isNameClash(msg)) {
      return { ok: false, error: "A vendor with this name already exists." };
    }
    console.error("[updateVendor] failed", err);
    return { ok: false, error: "Could not save the vendor. Please try again." };
  }

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendor.id}`);
  revalidatePath(`/vendors/${vendor.id}/edit`);
  return { ok: true };
}

/**
 * Deactivate a vendor (deactivate-only governance). Vendors are NEVER
 * hard-deleted: a master referenced by past bought-out costings must keep its
 * row. Sets is_active=false + deleted_at so it drops out of the picker but the
 * record survives. Idempotent. Kept alongside a `reactivate` twin.
 */
export async function deactivateVendor(vendorId: string): Promise<ActionResult> {
  await requireAdmin();

  const parsedId = VendorIdSchema.safeParse(vendorId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid vendor id" };
  }

  const vendor = await db.query.vendors.findFirst({
    where: eq(vendors.id, parsedId.data),
  });
  if (!vendor) return { ok: false, error: "Vendor not found" };
  if (!vendor.isActive) return { ok: true }; // already deactivated — idempotent

  try {
    await db
      .update(vendors)
      .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(vendors.id, vendor.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[deactivateVendor] failed", err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/vendors");
  return { ok: true };
}

/**
 * Reactivate a previously-deactivated vendor. Clears the deactivation flags so
 * the vendor returns to the picker. Idempotent.
 */
export async function reactivateVendor(vendorId: string): Promise<ActionResult> {
  await requireAdmin();

  const parsedId = VendorIdSchema.safeParse(vendorId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid vendor id" };
  }

  const vendor = await db.query.vendors.findFirst({
    where: eq(vendors.id, parsedId.data),
  });
  if (!vendor) return { ok: false, error: "Vendor not found" };
  if (vendor.isActive) return { ok: true }; // already active — idempotent

  try {
    await db
      .update(vendors)
      .set({ isActive: true, deletedAt: null, updatedAt: new Date() })
      .where(eq(vendors.id, vendor.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reactivateVendor] failed", err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/vendors");
  return { ok: true };
}
