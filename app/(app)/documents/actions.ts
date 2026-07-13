"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, documentEvents, type Document, type Employee } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { deleteBlob } from "@/lib/storage/blob";
import {
  DOCUMENTS_PATHNAME_PREFIX,
  MAX_DOCUMENT_BYTES,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TitleSchema = z.string().trim().min(1, "Title is required").max(200, "Title too long");
const DescSchema = z.string().trim().max(2000).optional();

/**
 * Phase 3.5 — write an append-only audit row for every document mutation.
 * Swallow-and-warn so a logging failure never crashes the mutation that
 * already succeeded. `documentTitle` is snapshotted so a delete-event
 * still reads sensibly after the document row is gone.
 */
async function logDocEvent(input: {
  documentId: string | null;
  documentTitle: string;
  actorId: string;
  eventType: "created" | "renamed" | "description_changed" | "file_replaced" | "deleted";
  fromValue?: unknown;
  toValue?: unknown;
}): Promise<void> {
  try {
    await db.insert(documentEvents).values({
      documentId: input.documentId,
      documentTitle: input.documentTitle,
      actorId: input.actorId,
      eventType: input.eventType,
      fromValue: (input.fromValue ?? null) as never,
      toValue: (input.toValue ?? null) as never,
    });
  } catch (err) {
    console.warn("[documents] audit write failed", err);
  }
}

/**
 * Loads a document and asserts the caller is allowed to mutate it.
 * Permission rule: uploader OR admin. The previous implementation only
 * checked `requireUser()` — any signed-in user could PATCH another
 * user's document by guessing the UUID.
 *
 * Returns the doc row on success, a Result-shaped error otherwise so
 * the caller can `return` it directly without further work.
 */
async function authorizeDocumentMutation(
  id: string,
  me: Employee,
): Promise<{ ok: true; doc: Document } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id" };
  }
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc) return { ok: false, error: "Document not found" };
  if (!me.isAdmin && doc.uploadedById !== me.id) {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, doc };
}

/**
 * Client-supplied metadata describing a blob the browser already uploaded
 * directly to Vercel Blob via /api/documents/upload. EVERYTHING here is
 * attacker-controllable, so it gets fully re-validated below.
 */
interface DocumentFileMeta {
  /** Blob pathname returned by upload() — must live under `documents/`. */
  pathname: string;
  contentType: string | null;
  sizeBytes: number;
}

/**
 * Re-validates client-direct upload metadata. The upload token route already
 * constrained the real upload, but this action can be called with arbitrary
 * arguments — CRITICALLY the pathname must live under `documents/`, otherwise
 * a malicious client could register (and later delete, via deleteDocument's
 * blob cleanup) an `avatars/` blob it doesn't own.
 */
function validateFileMeta(meta: DocumentFileMeta): { ok: true } | { ok: false; error: string } {
  if (
    typeof meta.pathname !== "string" ||
    !meta.pathname.startsWith(DOCUMENTS_PATHNAME_PREFIX) ||
    meta.pathname.length <= DOCUMENTS_PATHNAME_PREFIX.length
  ) {
    return { ok: false, error: "Invalid storage path." };
  }
  const shape = validateDocumentFileShape({ name: meta.pathname, contentType: meta.contentType });
  if (!shape.ok) return shape;
  if (!Number.isFinite(meta.sizeBytes) || meta.sizeBytes <= 0) {
    return { ok: false, error: "Pick a file to upload." };
  }
  if (meta.sizeBytes > MAX_DOCUMENT_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  return { ok: true };
}

/**
 * Guards against registering a blob pathname that another document row
 * already points at — otherwise deleting the new row would delete the
 * other document's file out from under it (storage paths come from the
 * client now, so this is no longer guaranteed by construction).
 */
async function pathnameAlreadyRegistered(pathname: string): Promise<boolean> {
  const existing = await db.query.documents.findFirst({
    where: eq(documents.storagePath, pathname),
  });
  return existing !== undefined && existing !== null;
}

/**
 * Registers the metadata row for a document the browser uploaded straight to
 * Vercel Blob (see /api/documents/upload). The file itself never passes
 * through the server — only this metadata does, which keeps us clear of
 * Next's 1 MB action body limit and Vercel's ~4.5 MB function body cap.
 */
export async function createDocumentRecord(input: {
  title: string;
  description?: string;
  pathname: string;
  contentType: string | null;
  sizeBytes: number;
}): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const titleRes = TitleSchema.safeParse(input.title);
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };
  const descRes = DescSchema.safeParse(input.description ?? undefined);
  if (!descRes.success) return { ok: false, error: "Description too long" };

  const meta: DocumentFileMeta = {
    pathname: input.pathname,
    contentType: input.contentType || null,
    sizeBytes: input.sizeBytes,
  };
  const valid = validateFileMeta(meta);
  if (!valid.ok) return valid;
  if (await pathnameAlreadyRegistered(meta.pathname)) {
    return { ok: false, error: "This file is already registered." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(documents)
      .values({
        title: titleRes.data,
        description: descRes.data ?? null,
        storagePath: meta.pathname,
        mimeType: meta.contentType,
        sizeBytes: meta.sizeBytes,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
  } catch (err) {
    // Roll back the orphaned blob (safe: pathname was validated above to
    // live under documents/, so this can never delete an avatar etc.).
    await deleteBlob(meta.pathname).catch((cleanupErr) => {
      console.warn("[documents] blob cleanup failed", cleanupErr);
    });
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };
  await logDocEvent({
    documentId: inserted.id,
    documentTitle: titleRes.data,
    actorId: me.id,
    eventType: "created",
    toValue: { title: titleRes.data, description: descRes.data ?? null, mimeType: meta.contentType, sizeBytes: meta.sizeBytes },
  });
  revalidatePath("/documents");
  return { ok: true, id: inserted.id };
}

export async function updateDocument(
  id: string,
  fields: { title?: string; description?: string | null },
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeDocumentMutation(id, me);
  if (!auth.ok) return auth;

  const patch: { title?: string; description?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (fields.title !== undefined) {
    const t = TitleSchema.safeParse(fields.title);
    if (!t.success) return { ok: false, error: t.error.issues[0]!.message };
    patch.title = t.data;
  }
  if (fields.description !== undefined) {
    patch.description = fields.description ? fields.description.trim().slice(0, 2000) : null;
  }
  // Belt-and-braces: even though authorizeDocumentMutation already
  // checked ownership, scope the WHERE so a concurrent ownership
  // transfer between the auth check and this UPDATE can't escalate.
  await db
    .update(documents)
    .set(patch)
    .where(
      me.isAdmin
        ? eq(documents.id, id)
        : and(eq(documents.id, id), eq(documents.uploadedById, me.id)),
    );

  // Emit audit rows for whichever fields actually changed.
  const titleChanged = patch.title !== undefined && patch.title !== auth.doc.title;
  const descChanged =
    patch.description !== undefined && (patch.description ?? null) !== (auth.doc.description ?? null);
  if (titleChanged) {
    await logDocEvent({
      documentId: id,
      documentTitle: patch.title ?? auth.doc.title,
      actorId: me.id,
      eventType: "renamed",
      fromValue: { title: auth.doc.title },
      toValue: { title: patch.title },
    });
  }
  if (descChanged) {
    await logDocEvent({
      documentId: id,
      documentTitle: patch.title ?? auth.doc.title,
      actorId: me.id,
      eventType: "description_changed",
      fromValue: { description: auth.doc.description },
      toValue: { description: patch.description },
    });
  }

  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Swaps a document's file for a blob the browser already uploaded directly
 * to Vercel Blob. Same client-direct flow (and same re-validation) as
 * createDocumentRecord.
 */
export async function replaceDocumentFile(id: string, file: DocumentFileMeta): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeDocumentMutation(id, me);
  if (!auth.ok) return auth;

  const meta: DocumentFileMeta = {
    pathname: file.pathname,
    contentType: file.contentType || null,
    sizeBytes: file.sizeBytes,
  };
  const valid = validateFileMeta(meta);
  if (!valid.ok) return valid;
  if (meta.pathname !== auth.doc.storagePath && (await pathnameAlreadyRegistered(meta.pathname))) {
    return { ok: false, error: "This file is already registered." };
  }

  try {
    await db
      .update(documents)
      .set({ storagePath: meta.pathname, mimeType: meta.contentType, sizeBytes: meta.sizeBytes, updatedAt: new Date() })
      .where(
        me.isAdmin
          ? eq(documents.id, id)
          : and(eq(documents.id, id), eq(documents.uploadedById, me.id)),
      );
  } catch (err) {
    // Roll back the orphaned blob (pathname validated to live under documents/).
    await deleteBlob(meta.pathname).catch((cleanupErr) => {
      console.warn("[documents] blob cleanup failed", cleanupErr);
    });
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  await logDocEvent({
    documentId: id,
    documentTitle: auth.doc.title,
    actorId: me.id,
    eventType: "file_replaced",
    fromValue: { storagePath: auth.doc.storagePath, mimeType: auth.doc.mimeType, sizeBytes: auth.doc.sizeBytes },
    toValue: { storagePath: meta.pathname, mimeType: meta.contentType, sizeBytes: meta.sizeBytes },
  });
  // Best-effort cleanup of the old blob.
  if (auth.doc.storagePath !== meta.pathname) {
    await deleteBlob(auth.doc.storagePath).catch((err) => {
      console.warn("[documents] blob cleanup failed", err);
    });
  }
  revalidatePath("/documents");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeDocumentMutation(id, me);
  // Distinguish "not there" from "forbidden" so the UI can show the
  // right message — the prior code returned ok:true on missing rows,
  // which silently masked permission denials.
  if (!auth.ok) return auth;

  // Best-effort blob cleanup — the DB row is the source of truth.
  await deleteBlob(auth.doc.storagePath).catch((err) => {
    console.warn("[documents] blob cleanup failed", err);
  });
  await db
    .delete(documents)
    .where(
      me.isAdmin
        ? eq(documents.id, id)
        : and(eq(documents.id, id), eq(documents.uploadedById, me.id)),
    );
  // Write the audit row AFTER the delete (documentId becomes a dangling
  // ref but the row's set-null FK keeps it pointing at NULL cleanly;
  // documentTitle is the persistent label).
  await logDocEvent({
    documentId: null,
    documentTitle: auth.doc.title,
    actorId: me.id,
    eventType: "deleted",
    fromValue: { id, title: auth.doc.title, storagePath: auth.doc.storagePath },
  });
  revalidatePath("/documents");
  return { ok: true };
}
