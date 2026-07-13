"use server";

import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { formDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  FORM_DRAFT_META,
  genericDraftLabel,
  genericHasContent,
  isFormDraftKind,
  type FormDraftKind,
} from "@/lib/drafts/form-drafts";

/** Keep at most this many ACTIVE drafts per form family; older ones recycle. */
const MAX_ACTIVE_PER_FORM = 10;
/** Recycled drafts are permanently purged this long after being recycled. */
const RECYCLE_TTL_MS = 48 * 60 * 60 * 1000;

/** Hard-delete this owner's recycled drafts that are past the 48h window. */
async function purgeExpired(ownerId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RECYCLE_TTL_MS);
  // `lt(deletedAt, cutoff)` is false for NULL, so active drafts are untouched.
  await db
    .delete(formDrafts)
    .where(and(eq(formDrafts.ownerId, ownerId), lt(formDrafts.deletedAt, cutoff)));
}

/**
 * Upsert one form's auto-saved draft. Idempotent on the client-generated `id`,
 * owner-guarded, skips empty payloads. Enforces the per-form active cap by
 * recycling the oldest overflow, and lazily purges expired recycled drafts.
 */
export async function saveFormDraft(input: {
  kind: FormDraftKind;
  id: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const me = await requireUser();
  if (!isFormDraftKind(input.kind)) return { ok: false };
  const payload = input.payload ?? {};
  if (!genericHasContent(payload)) return { ok: true, skipped: true };

  const label = genericDraftLabel(payload, FORM_DRAFT_META[input.kind]);
  const now = new Date();
  await db
    .insert(formDrafts)
    .values({ id: input.id, ownerId: me.id, formKey: input.kind, payload, label, updatedAt: now, deletedAt: null })
    .onConflictDoUpdate({
      target: formDrafts.id,
      // Editing an in-bin draft brings it back to life (deletedAt cleared).
      set: { payload, label, updatedAt: now, deletedAt: null },
      where: eq(formDrafts.ownerId, me.id),
    });

  // Cap active drafts per form family — recycle the oldest overflow.
  const active = await db
    .select({ id: formDrafts.id })
    .from(formDrafts)
    .where(
      and(
        eq(formDrafts.ownerId, me.id),
        eq(formDrafts.formKey, input.kind),
        isNull(formDrafts.deletedAt),
      ),
    )
    .orderBy(desc(formDrafts.updatedAt));
  if (active.length > MAX_ACTIVE_PER_FORM) {
    const overflow = active.slice(MAX_ACTIVE_PER_FORM).map((r) => r.id);
    await db
      .update(formDrafts)
      .set({ deletedAt: now })
      .where(and(eq(formDrafts.ownerId, me.id), inArray(formDrafts.id, overflow)));
  }

  await purgeExpired(me.id);
  return { ok: true };
}

/** Permanently delete a draft — used on final submit + "delete forever". */
export async function deleteFormDraft(
  kind: FormDraftKind,
  id: string,
): Promise<{ ok: boolean }> {
  const me = await requireUser();
  await db.delete(formDrafts).where(and(eq(formDrafts.id, id), eq(formDrafts.ownerId, me.id)));
  if (isFormDraftKind(kind)) {
    revalidatePath(FORM_DRAFT_META[kind].draftsRoute);
    revalidatePath(FORM_DRAFT_META[kind].recycleBinRoute);
  }
  return { ok: true };
}

/** Move a draft to the Recycle Bin (soft delete) — the Drafts list trash. */
export async function recycleFormDraft(
  kind: FormDraftKind,
  id: string,
): Promise<{ ok: boolean }> {
  const me = await requireUser();
  await db
    .update(formDrafts)
    .set({ deletedAt: new Date() })
    .where(and(eq(formDrafts.id, id), eq(formDrafts.ownerId, me.id), isNull(formDrafts.deletedAt)));
  if (isFormDraftKind(kind)) {
    revalidatePath(FORM_DRAFT_META[kind].draftsRoute);
    revalidatePath(FORM_DRAFT_META[kind].recycleBinRoute);
  }
  return { ok: true };
}

/** Restore a recycled draft back to its Drafts list. */
export async function restoreFormDraft(id: string): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const [row] = await db
    .update(formDrafts)
    .set({ deletedAt: null })
    .where(and(eq(formDrafts.id, id), eq(formDrafts.ownerId, me.id)))
    .returning({ formKey: formDrafts.formKey });
  if (row && isFormDraftKind(row.formKey)) {
    revalidatePath(FORM_DRAFT_META[row.formKey].draftsRoute);
    revalidatePath(FORM_DRAFT_META[row.formKey].recycleBinRoute);
  }
  return { ok: true };
}
