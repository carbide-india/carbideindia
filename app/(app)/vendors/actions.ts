"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
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
  const me = await requireUser();

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
        // A vendor explicitly marked non-GST cannot carry a GST number — the
        // form disables the input, and this is the hostile-client backstop.
        gstin: v.isGstApplicable === false ? null : (v.gstin ?? null),
        website: v.website ?? null,
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
  await requireUser();

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
        // Same rule as createVendor: "GST not applicable" wins over any number
        // a caller sent alongside it.
        gstin: v.isGstApplicable === false ? null : (v.gstin ?? null),
        website: v.website ?? null,
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
 * Bulk-deactivate the selected vendors — the multi-row extension of
 * `deactivateVendor`, wired to the register's bulk bar.
 *
 * There is deliberately NO bulk (or single) hard delete for vendors, and none
 * may be added. Two live FK columns point here and both are ON DELETE SET NULL:
 *   - `costings.vendor_id`              — the primary bought-out vendor on a costing
 *   - `costing_vendor_quotes.vendor_id` — the per-vendor BO quote-matrix rows
 * A hard delete would therefore not fail loudly; it would silently blank both,
 * orphaning the commercial basis of every bought-out costing that vendor priced
 * (the `vendor_*_snapshot` text columns would survive with no row to resolve).
 * That is also why no per-row reference guard REFUSES anything here:
 * deactivation leaves both columns intact, so a referenced vendor is exactly
 * the vendor you want to deactivate rather than one you must skip.
 *
 * Idempotent: a vendor already inactive counts toward `deleted` (nothing left
 * to do), never toward `failed`. `failed` means the id matched no row or the
 * write threw. Result field names mirror the shared bulk contract the register
 * consumes; the caller relabels them for the user ("deactivated", not "deleted").
 */
export async function deactivateVendorsBulk(
  ids: string[],
): Promise<
  | { ok: true; deleted: number; failed: number }
  | { ok: false; error: string }
> {
  await requireAdmin();

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every((id) => VendorIdSchema.safeParse(id).success)) {
    return { ok: false, error: "Invalid vendor id." };
  }

  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const vendor = await db.query.vendors.findFirst({
        where: eq(vendors.id, id),
      });
      if (!vendor) {
        failed++;
        continue;
      }
      if (!vendor.isActive) {
        deleted++; // already deactivated — idempotent, counts as succeeded
        continue;
      }
      await db
        .update(vendors)
        .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(vendors.id, vendor.id));
      deleted++;
    } catch (err) {
      console.error("[deactivateVendorsBulk] failed for", id, err);
      failed++;
    }
  }

  revalidatePath("/vendors");
  return { ok: true, deleted, failed };
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
