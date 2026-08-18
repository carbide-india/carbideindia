"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, salesOrders, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { deleteBlob } from "@/lib/storage/blob";
import {
  MAX_DOCUMENT_BYTES,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";

/**
 * Sales-order attachments — above all the CUSTOMER PO.
 *
 * The sales order already recorded the PO's number, date and a link, but a link
 * means the document lives somewhere else and someone pastes a URL: the one
 * piece of paper the whole order rests on was the one thing the system never
 * held. This files it against the order itself.
 *
 * METADATA-ONLY, exactly like the vendor/client attachments: the bytes never
 * pass through a server action (Next caps action bodies at 1 MB, Vercel
 * functions at ~4.5 MB, while the UI promises 25 MB). The browser PUTs straight
 * to Vercel Blob via the shared /api/documents/upload token route, then calls
 * `saveSalesOrderDocument` with the resulting pathname.
 *
 * `requireUser`, not `requireAdmin`: attaching the PO you just received is
 * ordinary sales work, not master-data governance.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * SO attachment blobs live under this prefix, nested inside the shared
 * `documents/` prefix that /api/documents/upload enforces. Pinning it here
 * stops a caller registering an `avatars/` or another module's blob it does not
 * own — which the delete path would then reap.
 */
const SO_DOCS_PATHNAME_PREFIX = "documents/sales-order-documents/";

const SaveSalesOrderDocumentSchema = z.object({
  salesOrderId: z.string().uuid("Invalid sales order id"),
  title: z.string().trim().min(1, "Title is required").max(200, "Title too long"),
  storagePath: z.string().min(1, "Invalid storage path."),
  mimeType: z.string().max(200).nullable(),
  sizeBytes: z
    .number()
    .int("Invalid file size")
    .positive("Pick a file to upload.")
    .max(MAX_DOCUMENT_BYTES, "File exceeds 25 MB."),
});

export type SaveSalesOrderDocumentInput = z.input<typeof SaveSalesOrderDocumentSchema>;

export async function saveSalesOrderDocument(
  input: SaveSalesOrderDocumentInput,
): Promise<Result<{ id: string }>> {
  const me = await requireUser();

  const parsed = SaveSalesOrderDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  if (
    !v.storagePath.startsWith(SO_DOCS_PATHNAME_PREFIX) ||
    v.storagePath.length <= SO_DOCS_PATHNAME_PREFIX.length
  ) {
    return { ok: false, error: "Invalid storage path." };
  }
  const shape = validateDocumentFileShape({
    name: v.storagePath,
    contentType: v.mimeType,
  });
  if (!shape.ok) return shape;

  const so = await db.query.salesOrders.findFirst({
    where: eq(salesOrders.id, v.salesOrderId),
  });
  if (!so) return { ok: false, error: "Sales order not found" };

  // Never register a pathname another row already points at — deleting this row
  // would then delete that document's file.
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
        salesOrderId: v.salesOrderId,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
  } catch (err) {
    // Roll back the orphaned blob. The pathname is validated to live under the
    // SO prefix, so this can never delete someone else's file.
    await deleteBlob(v.storagePath).catch((cleanupErr) => {
      console.warn("[so-documents] blob cleanup failed", cleanupErr);
    });
    console.error("[saveSalesOrderDocument] failed", err);
    return { ok: false, error: "Could not attach the file. Please try again." };
  }
  if (!inserted) return { ok: false, error: "Could not attach the file. Please try again." };

  revalidatePath(`/sales-orders/${v.salesOrderId}`);
  return { ok: true, id: inserted.id };
}

/**
 * Removes a sales-order attachment: best-effort Blob cleanup, then the DB row.
 * The row is the source of truth, so a Blob failure never blocks the delete.
 */
export async function deleteSalesOrderDocument(documentId: string): Promise<Result> {
  await requireUser();

  if (!z.string().uuid().safeParse(documentId).success) {
    return { ok: false, error: "Invalid id" };
  }
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return { ok: false, error: "Document not found" };
  if (!doc.salesOrderId) {
    return { ok: false, error: "This file is not a sales-order attachment." };
  }

  await deleteBlob(doc.storagePath).catch((err) => {
    console.warn("[so-documents] blob cleanup failed", err);
  });
  await db.delete(documents).where(eq(documents.id, documentId));

  revalidatePath(`/sales-orders/${doc.salesOrderId}`);
  return { ok: true };
}

export interface SalesOrderDocumentRow {
  id: string;
  title: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  createdAt: Date;
}

/** Files attached to one sales order, newest first. */
export async function listSalesOrderDocuments(
  salesOrderId: string,
): Promise<SalesOrderDocumentRow[]> {
  await requireUser();
  if (!z.string().uuid().safeParse(salesOrderId).success) return [];
  return db
    .select({
      id: documents.id,
      title: documents.title,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploadedByName: employees.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(employees, eq(employees.id, documents.uploadedById))
    .where(eq(documents.salesOrderId, salesOrderId))
    .orderBy(desc(documents.createdAt));
}
