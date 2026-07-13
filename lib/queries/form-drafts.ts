import "server-only";
import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { formDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  FORM_DRAFT_META,
  genericCompleteness,
  isFormDraftKind,
  type FormDraftKind,
} from "@/lib/drafts/form-drafts";

/** Recycled drafts are purged this long after being recycled (48h). */
const RECYCLE_TTL_MS = 48 * 60 * 60 * 1000;

export interface FormDraftListItem {
  id: string;
  label: string;
  completeness: number;
  updatedAt: Date;
}

/** The current user's ACTIVE drafts for one form kind, newest first. */
export async function listFormDrafts(kind: FormDraftKind): Promise<FormDraftListItem[]> {
  const me = await requireUser();
  const rows = await db
    .select()
    .from(formDrafts)
    .where(
      and(
        eq(formDrafts.ownerId, me.id),
        eq(formDrafts.formKey, kind),
        isNull(formDrafts.deletedAt),
      ),
    )
    .orderBy(desc(formDrafts.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    label: r.label?.trim() || "Untitled",
    completeness: genericCompleteness((r.payload ?? {}) as Record<string, unknown>),
    updatedAt: r.updatedAt,
  }));
}

/** A single ACTIVE draft's raw form payload — only if it belongs to the user. */
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

export interface RecycledDraftItem {
  id: string;
  kind: FormDraftKind;
  /** Human form-type name (e.g. "Client KYC"). */
  typeLabel: string;
  label: string;
  deletedAt: Date;
  /** When this draft will be permanently purged (deletedAt + 48h). */
  expiresAt: Date;
}

/**
 * The current user's recycled drafts (all form kinds), newest-recycled first.
 * Lazily purges anything past the 48h window before returning.
 */
export async function listRecycledDrafts(
  kind?: FormDraftKind,
): Promise<RecycledDraftItem[]> {
  const me = await requireUser();
  const cutoff = new Date(Date.now() - RECYCLE_TTL_MS);
  // Purge expired first (NULL deletedAt never matches `lt`).
  await db
    .delete(formDrafts)
    .where(and(eq(formDrafts.ownerId, me.id), lt(formDrafts.deletedAt, cutoff)));

  const rows = await db
    .select()
    .from(formDrafts)
    .where(
      and(
        eq(formDrafts.ownerId, me.id),
        isNotNull(formDrafts.deletedAt),
        // Per-form Recycle Bin — scope to one form kind when given.
        ...(kind ? [eq(formDrafts.formKey, kind)] : []),
      ),
    )
    .orderBy(desc(formDrafts.deletedAt));

  return rows
    .filter((r) => r.deletedAt != null && isFormDraftKind(r.formKey))
    .map((r) => {
      const kind = r.formKey as FormDraftKind;
      const deletedAt = r.deletedAt as Date;
      return {
        id: r.id,
        kind,
        typeLabel: FORM_DRAFT_META[kind].noun,
        label: r.label?.trim() || "Untitled",
        deletedAt,
        expiresAt: new Date(deletedAt.getTime() + RECYCLE_TTL_MS),
      };
    });
}
