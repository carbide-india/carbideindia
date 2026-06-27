"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, items } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { deleteBlob } from "@/lib/storage/blob";
import { recordAudit } from "@/lib/audit/record";
import {
  MAX_DOCUMENT_BYTES,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Item drawings/documents live under this prefix. It nests inside the shared
 * `documents/` prefix that /api/documents/upload (the reused private-token
 * route) enforces, so item uploads need no route change — and pinning the
 * prefix here means a caller can't register an `avatars/…` or
 * `client-documents/…` blob it doesn't own (which deleteItemDocument's blob
 * cleanup would later reap).
 */
const ITEM_DOCS_PATHNAME_PREFIX = "documents/item-documents/";

const TitleSchema = z.string().trim().min(1, "Title is required").max(200, "Title too long");

/**
 * Registers the metadata row for a drawing/document the browser uploaded
 * straight to Vercel Blob via /api/documents/upload, attaching it to an item.
 * Sales-floor open (requireUser, like the item create form). The file itself
 * never passes through the server (Next 1 MB action body cap), only this
 * metadata does — which is fully re-validated here.
 */
export async function saveItemDocument(input: {
  itemId: string;
  title: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number;
}): Promise<Result<{ id: string }>> {
  const me = await requireUser();

  if (!z.string().uuid().safeParse(input.itemId).success) {
    return { ok: false, error: "Invalid item id" };
  }
  const titleRes = TitleSchema.safeParse(input.title);
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };

  // The storage path is attacker-controllable — pin it under the item-docs
  // prefix and run the same shape/size guards the documents actions use.
  if (
    typeof input.storagePath !== "string" ||
    !input.storagePath.startsWith(ITEM_DOCS_PATHNAME_PREFIX) ||
    input.storagePath.length <= ITEM_DOCS_PATHNAME_PREFIX.length
  ) {
    return { ok: false, error: "Invalid storage path." };
  }
  const shape = validateDocumentFileShape({ name: input.storagePath, contentType: input.mimeType });
  if (!shape.ok) return shape;
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: "Pick a file to upload." };
  }
  if (input.sizeBytes > MAX_DOCUMENT_BYTES) return { ok: false, error: "File exceeds 25 MB." };

  // Guard against registering a blob pathname another row already points at —
  // otherwise deleting this row would delete the other document's file.
  const existing = await db.query.documents.findFirst({
    where: eq(documents.storagePath, input.storagePath),
  });
  if (existing) return { ok: false, error: "This file is already registered." };

  let inserted;
  try {
    [inserted] = await db
      .insert(documents)
      .values({
        title: titleRes.data,
        storagePath: input.storagePath,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        itemId: input.itemId,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
  } catch (err) {
    // Roll back the orphaned blob (pathname validated to live under the
    // item-docs prefix, so this can never delete an avatar etc.).
    await deleteBlob(input.storagePath).catch((cleanupErr) => {
      console.warn("[item-documents] blob cleanup failed", cleanupErr);
    });
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };

  const [item] = await db
    .select({ itemCode: items.itemCode })
    .from(items)
    .where(eq(items.id, input.itemId))
    .limit(1);
  await recordAudit({
    entityType: "item",
    entityId: input.itemId,
    entityLabel: item?.itemCode ?? input.itemId,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: `Document added: ${titleRes.data}`,
  });

  revalidatePath(`/items/${input.itemId}`);
  return { ok: true, id: inserted.id };
}

/**
 * Deletes an item document: best-effort Blob cleanup, then the DB row.
 * Sales-floor open (requireUser). The row is the source of truth, so a Blob
 * delete failure does not block the row delete.
 */
export async function deleteItemDocument(documentId: string): Promise<Result> {
  const me = await requireUser();

  if (!z.string().uuid().safeParse(documentId).success) {
    return { ok: false, error: "Invalid id" };
  }
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return { ok: false, error: "Document not found" };

  await deleteBlob(doc.storagePath).catch((err) => {
    console.warn("[item-documents] blob cleanup failed", err);
  });
  await db.delete(documents).where(eq(documents.id, documentId));

  if (doc.itemId) {
    const [item] = await db
      .select({ itemCode: items.itemCode })
      .from(items)
      .where(eq(items.id, doc.itemId))
      .limit(1);
    await recordAudit({
      entityType: "item",
      entityId: doc.itemId,
      entityLabel: item?.itemCode ?? doc.itemId,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      summary: `Document removed: ${doc.title}`,
    });
    revalidatePath(`/items/${doc.itemId}`);
  }
  return { ok: true };
}
