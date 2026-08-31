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

/**
 * Global purge of EVERY recycled draft past the 48h TTL, owner-agnostic.
 *
 * The lazy purge (`purgeExpired` in the actions, and `listRecycledDrafts` below)
 * only ever cleans the CURRENT owner's rows, and only when that owner saves a
 * draft or opens their recycle bin — so a user who recycles something and never
 * comes back leaves it forever. This is the nightly cron's job: one sweep across
 * all owners. Deliberately takes no `requireUser()` — it runs from the cron
 * route, which authenticates with CRON_SECRET instead.
 */
export async function purgeAllExpiredDrafts(): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - RECYCLE_TTL_MS);
  const rows = await db
    .delete(formDrafts)
    .where(and(isNotNull(formDrafts.deletedAt), lt(formDrafts.deletedAt, cutoff)))
    .returning({ id: formDrafts.id });
  return { purged: rows.length };
}

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

export interface ResumableDraft {
  id: string;
  payload: Record<string, unknown>;
  updatedAt: Date;
}

/**
 * The current user's most recent unfinished draft for one form kind.
 *
 * This is what makes autosave a real safety net rather than a write-only pile.
 * Before it, a draft could only be reached from the "Unfinished Forms" list, and
 * every visit to a new-form page minted a FRESH draft id — so the store grew a
 * row per abandoned visit (57 unfinished quotation forms against 2 actual
 * quotations) and nobody ever resumed one. The new-form page now picks this up
 * and carries on with the SAME draft, so a form has one draft, not a trail.
 *
 * Returns null when there is nothing to resume, or when what is there is empty.
 */
export async function getLatestFormDraft(
  kind: FormDraftKind,
): Promise<ResumableDraft | null> {
  const me = await requireUser();
  const rows = await db
    .select({
      id: formDrafts.id,
      payload: formDrafts.payload,
      updatedAt: formDrafts.updatedAt,
    })
    .from(formDrafts)
    .where(
      and(
        eq(formDrafts.ownerId, me.id),
        eq(formDrafts.formKey, kind),
        isNull(formDrafts.deletedAt),
      ),
    )
    .orderBy(desc(formDrafts.updatedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  // An autosave that captured nothing is not worth offering to resume.
  if (genericCompleteness(payload) === 0) return null;
  return { id: row.id, payload, updatedAt: row.updatedAt };
}

/**
 * What a new-form page should resume, if anything. One call per page so all
 * seven forms behave identically:
 *   ?fresh=1     → nothing (the explicit "start over" escape hatch)
 *   ?draft=<id>  → that exact draft, if it is the caller's
 *   otherwise    → the caller's latest unfinished draft for this form
 */
export async function resolveDraftToResume(
  kind: FormDraftKind,
  draftParam: string | undefined,
  fresh: boolean,
): Promise<ResumableDraft | null> {
  if (fresh) return null;
  if (draftParam) {
    const payload = await getFormDraft(kind, draftParam);
    return payload ? { id: draftParam, payload, updatedAt: new Date() } : null;
  }
  return getLatestFormDraft(kind);
}

/** A single ACTIVE draft's raw form payload - only if it belongs to the user. */
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
        // Per-form Recycle Bin - scope to one form kind when given.
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
