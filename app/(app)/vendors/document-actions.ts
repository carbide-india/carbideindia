"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, vendors } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { deleteBlob } from "@/lib/storage/blob";
import {
  MAX_DOCUMENT_BYTES,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";

/**
 * Vendor attachment actions (brochures, price lists, certificates, …).
 *
 * These are METADATA-ONLY: the file itself never passes through a server action
 * (Next caps action bodies at 1 MB, Vercel functions at ~4.5 MB, while the UI
 * promises 25 MB). The browser PUTs the bytes straight to Vercel Blob using the
 * shared /api/documents/upload token route, then calls `saveVendorDocument`
 * with the resulting pathname — exactly the flow client documents already use.
 *
 * Vendors are a MASTER, so writes are `requireAdmin`-gated like the rest of
 * app/(app)/vendors/actions.ts.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Vendor attachment blobs live under this prefix. It nests inside the shared
 * `documents/` prefix that /api/documents/upload enforces, so no route change
 * was needed — and pinning it here means a caller can't register an `avatars/`
 * or another module's blob it doesn't own (which the delete path would reap).
 */
const VENDOR_DOCS_PATHNAME_PREFIX = "documents/vendor-documents/";

const TitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title too long");

const SaveVendorDocumentSchema = z.object({
  vendorId: z.string().uuid("Invalid vendor id"),
  title: TitleSchema,
  storagePath: z.string().min(1, "Invalid storage path."),
  mimeType: z.string().max(200).nullable(),
  sizeBytes: z
    .number()
    .int("Invalid file size")
    .positive("Pick a file to upload.")
    .max(MAX_DOCUMENT_BYTES, "File exceeds 25 MB."),
});

export type SaveVendorDocumentInput = z.input<typeof SaveVendorDocumentSchema>;

/**
 * Registers the metadata row for a file the browser uploaded straight to Vercel
 * Blob, attaching it to a vendor. Everything the client sent is re-validated
 * here — the storage path especially, since it is attacker-controllable.
 */
export async function saveVendorDocument(
  input: SaveVendorDocumentInput,
): Promise<Result<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = SaveVendorDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  // Pin the pathname under the vendor-docs prefix, then run the same
  // shape/denylist guards the documents actions use.
  if (
    !v.storagePath.startsWith(VENDOR_DOCS_PATHNAME_PREFIX) ||
    v.storagePath.length <= VENDOR_DOCS_PATHNAME_PREFIX.length
  ) {
    return { ok: false, error: "Invalid storage path." };
  }
  const shape = validateDocumentFileShape({
    name: v.storagePath,
    contentType: v.mimeType,
  });
  if (!shape.ok) return shape;

  const vendor = await db.query.vendors.findFirst({ where: eq(vendors.id, v.vendorId) });
  if (!vendor) return { ok: false, error: "Vendor not found" };

  // Guard against registering a blob pathname another row already points at —
  // otherwise deleting this row would delete the other document's file.
  const existing = await db.query.documents.findFirst({
    where: eq(documents.storagePath, v.storagePath),
  });
  if (existing) return { ok: false, error: "This file is already registered." };

  let inserted;
  try {
    [inserted] = await db
      .insert(documents)
      .values({
        title: v.title,
        storagePath: v.storagePath,
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        vendorId: v.vendorId,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
  } catch (err) {
    // Roll back the orphaned blob (pathname is validated to live under the
    // vendor-docs prefix, so this can never delete someone else's file).
    await deleteBlob(v.storagePath).catch((cleanupErr) => {
      console.warn("[vendor-documents] blob cleanup failed", cleanupErr);
    });
    console.error("[saveVendorDocument] failed", err);
    return { ok: false, error: "Could not attach the file. Please try again." };
  }
  if (!inserted) return { ok: false, error: "Could not attach the file. Please try again." };

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${v.vendorId}`);
  return { ok: true, id: inserted.id };
}

/**
 * Removes a vendor attachment: best-effort Blob cleanup, then the DB row. The
 * row is the source of truth, so a Blob delete failure never blocks the delete.
 *
 * Note this deletes an ATTACHMENT, not the vendor — vendor governance stays
 * deactivate-only (see `deactivateVendor`); nothing here touches the master row.
 */
export async function deleteVendorDocument(documentId: string): Promise<Result> {
  await requireAdmin();

  if (!z.string().uuid().safeParse(documentId).success) {
    return { ok: false, error: "Invalid id" };
  }
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return { ok: false, error: "Document not found" };
  if (!doc.vendorId) return { ok: false, error: "This file is not a vendor attachment." };

  await deleteBlob(doc.storagePath).catch((err) => {
    console.warn("[vendor-documents] blob cleanup failed", err);
  });
  await db.delete(documents).where(eq(documents.id, documentId));

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${doc.vendorId}`);
  return { ok: true };
}
