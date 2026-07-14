"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { deleteBlob } from "@/lib/storage/blob";
import {
  MAX_DOCUMENT_BYTES,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Client document blobs live under this prefix. It nests inside the shared
 * `documents/` prefix that /api/documents/upload (the reused private-token
 * route) enforces, so client uploads need no route change - and pinning the
 * prefix here means a malicious caller can't register an `avatars/` blob it
 * doesn't own (which deleteClientDocument's blob cleanup would later reap).
 */
const CLIENT_DOCS_PATHNAME_PREFIX = "documents/client-documents/";

const TitleSchema = z.string().trim().min(1, "Title is required").max(200, "Title too long");

/**
 * Registers the metadata row for a document the browser uploaded straight to
 * Vercel Blob via /api/documents/upload, attaching it to a client. Admin-only.
 * The file itself never passes through the server (Next 1 MB action body cap),
 * only this metadata does - which is fully re-validated here.
 */
export async function saveClientDocument(input: {
  clientId: string;
  title: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number;
}): Promise<Result<{ id: string }>> {
  const me = await requireAdmin();

  if (!z.string().uuid().safeParse(input.clientId).success) {
    return { ok: false, error: "Invalid client id" };
  }
  const titleRes = TitleSchema.safeParse(input.title);
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };

  // The storage path is attacker-controllable - pin it under the client-docs
  // prefix and run the same shape/size guards the documents actions use.
  if (
    typeof input.storagePath !== "string" ||
    !input.storagePath.startsWith(CLIENT_DOCS_PATHNAME_PREFIX) ||
    input.storagePath.length <= CLIENT_DOCS_PATHNAME_PREFIX.length
  ) {
    return { ok: false, error: "Invalid storage path." };
  }
  const shape = validateDocumentFileShape({ name: input.storagePath, contentType: input.mimeType });
  if (!shape.ok) return shape;
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: "Pick a file to upload." };
  }
  if (input.sizeBytes > MAX_DOCUMENT_BYTES) return { ok: false, error: "File exceeds 25 MB." };

  // Guard against registering a blob pathname another row already points at -
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
        clientId: input.clientId,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
  } catch (err) {
    // Roll back the orphaned blob (pathname validated to live under the
    // client-docs prefix, so this can never delete an avatar etc.).
    await deleteBlob(input.storagePath).catch((cleanupErr) => {
      console.warn("[client-documents] blob cleanup failed", cleanupErr);
    });
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };

  revalidatePath(`/clients/${input.clientId}`);
  revalidatePath(`/clients/${input.clientId}/edit`);
  return { ok: true, id: inserted.id };
}

/**
 * Deletes a client document: best-effort Blob cleanup, then the DB row.
 * Admin-only. The row is the source of truth, so a Blob delete failure does
 * not block the row delete.
 */
export async function deleteClientDocument(documentId: string): Promise<Result> {
  await requireAdmin();

  if (!z.string().uuid().safeParse(documentId).success) {
    return { ok: false, error: "Invalid id" };
  }
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return { ok: false, error: "Document not found" };

  await deleteBlob(doc.storagePath).catch((err) => {
    console.warn("[client-documents] blob cleanup failed", err);
  });
  await db.delete(documents).where(eq(documents.id, documentId));

  if (doc.clientId) {
    revalidatePath(`/clients/${doc.clientId}`);
    revalidatePath(`/clients/${doc.clientId}/edit`);
  }
  return { ok: true };
}
