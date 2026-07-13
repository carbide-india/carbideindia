"use server";

import { revalidatePath } from "next/cache";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { samples, inquiries, type NewSample } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { SAMPLE_STATUSES, type SampleStatus } from "@/db/enums";
import {
  CreateSampleSchema,
  UpdateSampleSchema,
  SetSampleStatusSchema,
  type CreateSampleInput,
  type UpdateSampleInput,
} from "@/lib/validators/sample";

/**
 * Sample Register server actions (Phase 3 — write path).
 *
 * NOTE on audit logging: there is intentionally none here. `task_events` is
 * FK'd to tasks and `settings_events` is scoped to admin settings — neither
 * fits sample (app-data) writes, and inventing a third audit table is a
 * decision deferred to a later phase (same call as the inquiry actions).
 */

type ActionResult =
  | { ok: true; id?: string; sampleNo?: string }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Drops keys whose value is `undefined`. The validators' OptionalText fields
 * fold `""` → `undefined`, so a "filled" form patch can legitimately arrive
 * as `{ field: undefined }` — which passes the nonempty refine but must not
 * reach `.set()` (and an all-undefined patch must not reach the db at all).
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

/** How many times to bump the `-NN` suffix when a derived sampleNo collides. */
const MAX_SAMPLE_NO_TRIES = 5;

export async function createSample(
  input: CreateSampleInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = CreateSampleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  for (const s of [
    v.sampleDate, v.dimensionCompletedOn, v.chemicalCompletedOn,
    v.drawingCompletedOn, v.costingCompletedOn, v.processedDate,
  ]) {
    if (s !== undefined && !isParseableDate(s)) {
      return { ok: false, error: "Invalid date value" };
    }
  }

  // Derivation inputs: a linked sample numbers itself off the enquiry's SM
  // (`SM9579-01`, per-SM counter); an unlinked sample must bring its own no.
  let smBase: string | null = null;
  let existingCount = 0;
  if (!v.sampleNo) {
    const inquiryId = v.inquiryId;
    if (!inquiryId) {
      return { ok: false, error: "Sample No is required when no enquiry is linked." };
    }
    try {
      const [inq] = await db
        .select({ smNumber: inquiries.smNumber })
        .from(inquiries)
        .where(eq(inquiries.id, inquiryId))
        .limit(1);
      if (!inq) return { ok: false, error: "Linked enquiry not found." };
      const [cnt] = await db
        .select({ n: count() })
        .from(samples)
        .where(eq(samples.inquiryId, inquiryId));
      smBase = inq.smNumber;
      existingCount = Number(cnt?.n ?? 0);
    } catch (err) {
      console.error("[createSample] sampleNo derivation failed", err);
      return { ok: false, error: "Could not create the sample. Please try again." };
    }
  }

  const values: Omit<NewSample, "sampleNo"> = {
    sampleDate: v.sampleDate ? new Date(v.sampleDate) : undefined,
    inquiryId: v.inquiryId,
    location: v.location,
    responsiblePersonId: v.responsiblePersonId,
    photoUrls: v.photoUrls,
    sampleNotes: v.sampleNotes,
    sampleStatus: v.sampleStatus,
    dimensionStatus: v.dimensionStatus,
    dimensionLocation: v.dimensionLocation,
    dimensionCompletedOn: v.dimensionCompletedOn ? new Date(v.dimensionCompletedOn) : undefined,
    dimensionNotes: v.dimensionNotes,
    dimensionAudioUrl: v.dimensionAudioUrl,
    chemicalStatus: v.chemicalStatus,
    chemicalLocation: v.chemicalLocation,
    chemicalCompletedOn: v.chemicalCompletedOn ? new Date(v.chemicalCompletedOn) : undefined,
    chemicalNotes: v.chemicalNotes,
    chemicalAudioUrl: v.chemicalAudioUrl,
    drawingStatus: v.drawingStatus,
    drawingLocation: v.drawingLocation,
    drawingCompletedOn: v.drawingCompletedOn ? new Date(v.drawingCompletedOn) : undefined,
    drawingNotes: v.drawingNotes,
    drawingAudioUrl: v.drawingAudioUrl,
    costingStatus: v.costingStatus,
    costingCompletedOn: v.costingCompletedOn ? new Date(v.costingCompletedOn) : undefined,
    reportsUploaded: v.reportsUploaded,
    reportsInSmFolder: v.reportsInSmFolder,
    processedDate: v.processedDate ? new Date(v.processedDate) : undefined,
    processNotes: v.processNotes,
    createdById: me.id,
  };

  // Explicit sampleNo inserts once; a derived one bumps its `-NN` suffix and
  // retries when a concurrent create grabbed the same number (23505 against
  // samples_sample_no_unique — same retry shape as tasks' short_id).
  const tries = v.sampleNo ? 1 : MAX_SAMPLE_NO_TRIES;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const sampleNo =
      v.sampleNo ?? `${smBase}-${String(existingCount + attempt).padStart(2, "0")}`;
    try {
      const [row] = await db
        .insert(samples)
        .values({ ...values, sampleNo })
        .returning({ id: samples.id });
      if (!row) return { ok: false, error: "Insert returned no row" };
      revalidatePath("/samples");
      return { ok: true, id: row.id, sampleNo };
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string };
      if (e?.code === "23505" && e?.constraint === "samples_sample_no_unique") {
        if (v.sampleNo) {
          return { ok: false, error: "A sample with this number already exists." };
        }
        continue; // derived: bump the suffix and retry
      }
      console.error("[createSample] failed", err);
      return { ok: false, error: "Could not create the sample. Please try again." };
    }
  }
  return {
    ok: false,
    error: "Could not allocate a unique sample number — enter one manually.",
  };
}

export async function updateSample(
  id: string,
  input: UpdateSampleInput,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid sample id." };
  const parsed = UpdateSampleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = stripUndefined(parsed.data);
  if (Object.keys(v).length === 0) return { ok: true }; // everything folded away

  // Timestamp columns take Dates, the validator carries ISO strings.
  const {
    sampleDate, dimensionCompletedOn, chemicalCompletedOn,
    drawingCompletedOn, costingCompletedOn, processedDate,
    ...rest
  } = v;
  const patch: Partial<NewSample> = { ...rest };
  const dates: Array<[string | undefined, keyof NewSample]> = [
    [sampleDate, "sampleDate"],
    [dimensionCompletedOn, "dimensionCompletedOn"],
    [chemicalCompletedOn, "chemicalCompletedOn"],
    [drawingCompletedOn, "drawingCompletedOn"],
    [costingCompletedOn, "costingCompletedOn"],
    [processedDate, "processedDate"],
  ];
  for (const [value, key] of dates) {
    if (value === undefined) continue;
    if (!isParseableDate(value)) return { ok: false, error: "Invalid date value" };
    (patch as Record<string, unknown>)[key] = new Date(value);
  }

  try {
    await db
      .update(samples)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(samples.id, id));
  } catch (err) {
    console.error("[updateSample] failed", err);
    return { ok: false, error: "Could not save the sample. Please try again." };
  }
  revalidatePath("/samples");
  revalidatePath(`/samples/${id}`);
  return { ok: true };
}

export async function setSampleStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid sample id." };
  const parsed = SetSampleStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  try {
    await db
      .update(samples)
      .set({ sampleStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(samples.id, id));
  } catch (err) {
    console.error("[setSampleStatus] failed", err);
    return { ok: false, error: "Could not update the status. Please try again." };
  }
  revalidatePath("/samples");
  revalidatePath(`/samples/${id}`);
  return { ok: true };
}

/**
 * Bulk-set the sample status on many samples at once (register table's
 * "Set status" bulk action). Validates the status against the enum and the ids
 * are UUID-shaped before a single `inArray` update.
 */
export async function setSampleStatusBulk(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid sample id." };
  if (!(SAMPLE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  try {
    await db
      .update(samples)
      .set({ sampleStatus: status as SampleStatus, updatedAt: new Date() })
      .where(inArray(samples.id, ids));
  } catch (err) {
    console.error("[setSampleStatusBulk] failed", err);
    return { ok: false, error: "Could not update the statuses. Please try again." };
  }
  revalidatePath("/samples");
  return { ok: true };
}
