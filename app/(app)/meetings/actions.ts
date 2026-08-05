"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientMeetings, type NewClientMeeting } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { MEETING_PURPOSES, type MeetingPurpose } from "@/db/enums";
import {
  CreateClientMeetingSchema,
  UpdateClientMeetingSchema,
  SetMeetingPurposeSchema,
  type CreateClientMeetingInput,
  type UpdateClientMeetingInput,
} from "@/lib/validators/client-meeting";

/**
 * Daily Client Meeting Feedback server actions (write path).
 *
 * NOTE on audit logging: there is intentionally none here - same call as the
 * sample/inquiry actions (no app-data audit table exists yet).
 */

type ActionResult =
  | { ok: true; id?: string; meetingNo?: string }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Drops keys whose value is `undefined` - OptionalText fields fold `""` →
 * `undefined`, so a "filled" patch can arrive as `{ field: undefined }`, which
 * passes the nonempty refine but must not reach `.set()`.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Date fields are free strings in the validator - guard before `new Date`. */
function isParseableDate(s: string): boolean {
  return !Number.isNaN(new Date(s).getTime());
}

export async function createClientMeeting(
  input: CreateClientMeetingInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = CreateClientMeetingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  for (const s of [v.meetingDate, v.nextFollowUpDate]) {
    if (s !== undefined && !isParseableDate(s)) {
      return { ok: false, error: "Invalid date value" };
    }
  }

  // No explicit salesPersonId → log it against the signed-in user (drives the
  // register's filter/column). The meeting number is left unset so the DB
  // default (MTG<seq>) allocates it.
  const salesPersonId = v.salesPersonId ?? me.id;
  // Combined contact name for the register's existing column / back-compat.
  const contactPersonName =
    `${v.contactFirstName} ${v.contactLastName ?? ""}`.trim();
  const values: Omit<NewClientMeeting, "meetingNo"> = {
    salesPersonId,
    salesName: v.salesName,
    salesNumber: v.salesNumber,
    salesDesignation: v.salesDesignation,
    salesEmail: v.salesEmail,
    clientId: v.clientId,
    companyName: v.companyName,
    contactPersonName,
    contactFirstName: v.contactFirstName,
    contactLastName: v.contactLastName,
    contactPersonDesignation: v.contactPersonDesignation,
    contactNumber: v.contactNumber,
    contactEmail: v.contactEmail,
    meetingDate: v.meetingDate ? new Date(v.meetingDate) : undefined,
    meetingStartTime: v.meetingStartTime,
    meetingEndTime: v.meetingEndTime,
    meetingSource: v.meetingSource,
    clientType: v.clientType,
    purpose: v.purpose,
    purposeOther: v.purposeOther,
    meetingNotes: v.meetingNotes,
    nextFollowUpDate: v.nextFollowUpDate ? new Date(v.nextFollowUpDate) : undefined,
    createdById: me.id,
  };

  try {
    const [row] = await db
      .insert(clientMeetings)
      .values(values)
      .returning({ id: clientMeetings.id, meetingNo: clientMeetings.meetingNo });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidatePath("/meetings");
    return { ok: true, id: row.id, meetingNo: row.meetingNo };
  } catch (err) {
    console.error("[createClientMeeting] failed", err);
    return { ok: false, error: "Could not log the meeting. Please try again." };
  }
}

export async function updateClientMeeting(
  id: string,
  input: UpdateClientMeetingInput,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid meeting id." };
  const parsed = UpdateClientMeetingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = stripUndefined(parsed.data);
  if (Object.keys(v).length === 0) return { ok: true }; // everything folded away

  // Timestamp columns take Dates, the validator carries ISO strings.
  const { meetingDate, nextFollowUpDate, ...rest } = v;
  const patch: Partial<NewClientMeeting> = { ...rest };
  const dates: Array<[string | undefined, keyof NewClientMeeting]> = [
    [meetingDate, "meetingDate"],
    [nextFollowUpDate, "nextFollowUpDate"],
  ];
  for (const [value, key] of dates) {
    if (value === undefined) continue;
    if (!isParseableDate(value)) return { ok: false, error: "Invalid date value" };
    (patch as Record<string, unknown>)[key] = new Date(value);
  }

  try {
    await db
      .update(clientMeetings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(clientMeetings.id, id));
  } catch (err) {
    console.error("[updateClientMeeting] failed", err);
    return { ok: false, error: "Could not save the meeting. Please try again." };
  }
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${id}`);
  return { ok: true };
}

/** Bulk-set the meeting purpose over the selected rows. */
export async function setMeetingPurposeBulk(
  ids: string[],
  purpose: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid meeting id." };
  if (!(MEETING_PURPOSES as readonly string[]).includes(purpose)) {
    return { ok: false, error: "Invalid purpose" };
  }
  try {
    await db
      .update(clientMeetings)
      .set({ purpose: purpose as MeetingPurpose, updatedAt: new Date() })
      .where(inArray(clientMeetings.id, ids));
  } catch (err) {
    console.error("[setMeetingPurposeBulk] failed", err);
    return { ok: false, error: "Could not update the purposes. Please try again." };
  }
  revalidatePath("/meetings");
  return { ok: true };
}

export async function setMeetingPurpose(
  id: string,
  purpose: string,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid meeting id." };
  const parsed = SetMeetingPurposeSchema.safeParse({ purpose });
  if (!parsed.success) return { ok: false, error: "Invalid purpose" };
  try {
    await db
      .update(clientMeetings)
      .set({ purpose: parsed.data.purpose, updatedAt: new Date() })
      .where(eq(clientMeetings.id, id));
  } catch (err) {
    console.error("[setMeetingPurpose] failed", err);
    return { ok: false, error: "Could not update the purpose. Please try again." };
  }
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete (hard) — the Recycle Bin is drafts-only and `client_meetings` carries
// no deleted_at / is_active column, so there is no soft-delete or deactivate
// semantic to respect here: this is a permanent delete, guarded client-side by
// a confirm and here by the reference check below.
// ---------------------------------------------------------------------------

/**
 * Counts downstream rows that would be silently orphaned by deleting a meeting.
 *
 * `client_meetings` is a LEAF today — nothing in `db/schema.ts` carries a
 * `meeting_id` (documents key off task / client / item / job_card), and the
 * meeting's own FKs point OUTWARD to employees/clients, so deleting one can't
 * strand a quotation, costing, sales order, invoice or job card. The counter
 * list is therefore empty and the guard structurally returns 0.
 *
 * It still exists, and both delete paths still route through it, so the day a
 * table starts referencing a meeting the only change needed is one more entry
 * here, e.g. `(id) => db.$count(followUps, eq(followUps.meetingId, id))` —
 * after which the single and bulk deletes both start refusing in-use rows with
 * no further edits.
 */
type MeetingRefCounter = (id: string) => Promise<number>;

const MEETING_REF_COUNTERS: MeetingRefCounter[] = [];

async function countClientMeetingRefs(id: string): Promise<number> {
  const counts = await Promise.all(MEETING_REF_COUNTERS.map((c) => c(id)));
  return counts.reduce((sum, n) => sum + n, 0);
}

const MEETING_IN_USE_ERROR =
  "In use by a linked record - can't delete.";

/** Hard-delete a single meeting log. Refuses when a downstream record depends
 *  on it (see `countClientMeetingRefs`). */
export async function deleteClientMeeting(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid meeting id." };

  try {
    if ((await countClientMeetingRefs(id)) > 0) {
      return { ok: false, error: MEETING_IN_USE_ERROR };
    }
    await db.delete(clientMeetings).where(eq(clientMeetings.id, id));
  } catch (err) {
    console.error("[deleteClientMeeting] failed", err);
    return { ok: false, error: "Could not delete the meeting. Please try again." };
  }

  revalidatePath("/meetings");
  return { ok: true };
}

/** Hard-delete the selected meeting logs, skipping any a downstream record
 *  depends on. Reports how many were deleted vs. skipped. */
export async function deleteClientMeetingsBulk(
  ids: string[],
): Promise<
  | { ok: true; deleted: number; failed: number }
  | { ok: false; error: string }
> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid meeting id." };

  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      if ((await countClientMeetingRefs(id)) > 0) {
        failed++;
        continue;
      }
      await db.delete(clientMeetings).where(eq(clientMeetings.id, id));
      deleted++;
    } catch (err) {
      console.error("[deleteClientMeetingsBulk] failed for", id, err);
      failed++;
    }
  }

  revalidatePath("/meetings");
  return { ok: true, deleted, failed };
}
