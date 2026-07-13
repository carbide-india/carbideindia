"use server";

import { and, eq } from "drizzle-orm";
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

/**
 * Upsert one form's auto-saved draft. Idempotent on the client-generated `id`,
 * owner-guarded, and skips essentially-empty payloads (no junk drafts). One row
 * per form kind via `form_drafts.formKey`.
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
    .values({ id: input.id, ownerId: me.id, formKey: input.kind, payload, label, updatedAt: now })
    .onConflictDoUpdate({
      target: formDrafts.id,
      set: { payload, label, updatedAt: now },
      where: eq(formDrafts.ownerId, me.id),
    });
  return { ok: true };
}

/** Delete a draft (on final submit, or from the Drafts list). Owner-guarded. */
export async function deleteFormDraft(
  kind: FormDraftKind,
  id: string,
): Promise<{ ok: boolean }> {
  const me = await requireUser();
  await db.delete(formDrafts).where(and(eq(formDrafts.id, id), eq(formDrafts.ownerId, me.id)));
  if (isFormDraftKind(kind)) revalidatePath(FORM_DRAFT_META[kind].draftsRoute);
  return { ok: true };
}
