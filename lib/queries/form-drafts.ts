import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { genericCompleteness, type FormDraftKind } from "@/lib/drafts/form-drafts";

export interface FormDraftListItem {
  id: string;
  label: string;
  completeness: number;
  updatedAt: Date;
}

/** The current user's drafts for one form kind, newest first. */
export async function listFormDrafts(kind: FormDraftKind): Promise<FormDraftListItem[]> {
  const me = await requireUser();
  const rows = await db
    .select()
    .from(formDrafts)
    .where(and(eq(formDrafts.ownerId, me.id), eq(formDrafts.formKey, kind)))
    .orderBy(desc(formDrafts.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    label: r.label?.trim() || "Untitled",
    completeness: genericCompleteness((r.payload ?? {}) as Record<string, unknown>),
    updatedAt: r.updatedAt,
  }));
}

/** A single draft's raw form payload — only if it belongs to the current user. */
export async function getFormDraft(
  kind: FormDraftKind,
  id: string,
): Promise<Record<string, unknown> | null> {
  const me = await requireUser();
  const rows = await db
    .select({ payload: formDrafts.payload })
    .from(formDrafts)
    .where(and(eq(formDrafts.id, id), eq(formDrafts.ownerId, me.id), eq(formDrafts.formKey, kind)))
    .limit(1);
  return (rows[0]?.payload as Record<string, unknown> | undefined) ?? null;
}
