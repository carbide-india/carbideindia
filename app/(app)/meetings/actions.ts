"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientMeetings, type NewClientMeeting } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
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
 * NOTE on audit logging: there is intentionally none here — same call as the
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
 * Drops keys whose value is `undefined` — OptionalText fields fold `""` →
 * `undefined`, so a "filled" patch can arrive as `{ field: undefined }`, which
 * passes the nonempty refine but must not reach `.set()`.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Date fields are free strings in the validator — guard before `new Date`. */
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

  // No explicit salesPersonId → log it against the signed-in user. The meeting
  // number is left unset so the DB default (MTG<seq>) allocates it.
  const salesPersonId = v.salesPersonId ?? me.id;
  const values: Omit<NewClientMeeting, "meetingNo"> = {
    salesPersonId,
    clientId: v.clientId,
    companyName: v.companyName,
    contactPersonName: v.contactPersonName,
    contactPersonDesignation: v.contactPersonDesignation,
    meetingDate: v.meetingDate ? new Date(v.meetingDate) : undefined,
    meetingTime: v.meetingTime,
    clientType: v.clientType,
    purpose: v.purpose,
    purposeOther: v.purposeOther,
    meetingNotes: v.meetingNotes,
    nextFollowUpDate: v.nextFollowUpDate ? new Date(v.nextFollowUpDate) : undefined,
    selfieUrl: v.selfieUrl,
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
