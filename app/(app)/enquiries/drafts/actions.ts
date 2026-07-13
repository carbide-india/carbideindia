"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { formDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { deriveDraftLabel, draftHasContent, type EnquiryDraftPayload } from "@/lib/drafts/enquiry-draft";

/**
 * Upsert a New-Enquiry draft (auto-save). Idempotent on the client-generated
 * `id`; owner-guarded so a draft can only be written by its owner. Skips
 * essentially-empty payloads so typing nothing never creates junk drafts.
 */
export async function saveEnquiryDraft(input: {
  id: string;
  payload: EnquiryDraftPayload;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const me = await requireUser();
  const payload = input.payload ?? {};
  if (!draftHasContent(payload)) return { ok: true, skipped: true };

  const label = deriveDraftLabel(payload);
  const now = new Date();
  await db
    .insert(formDrafts)
    .values({ id: input.id, ownerId: me.id, formKey: "enquiry", payload, label, updatedAt: now })
    .onConflictDoUpdate({
      target: formDrafts.id,
      set: { payload, label, updatedAt: now },
      where: eq(formDrafts.ownerId, me.id),
    });
  return { ok: true };
}

/** Delete a draft (on final submit, or from the Drafts list). Owner-guarded. */
export async function deleteEnquiryDraft(id: string): Promise<{ ok: boolean }> {
  const me = await requireUser();
  await db.delete(formDrafts).where(and(eq(formDrafts.id, id), eq(formDrafts.ownerId, me.id)));
  revalidatePath("/enquiries/drafts");
  return { ok: true };
}
