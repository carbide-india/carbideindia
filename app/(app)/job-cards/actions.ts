"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobCards, type NewJobCard } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import {
  CreateJobCardSchema,
  UpdateJobCardSchema,
  type CreateJobCardInput,
  type UpdateJobCardInput,
} from "@/lib/validators/job-card";

type ActionResult =
  | { ok: true; id: string; jobCardNo: string }
  | { ok: false; error: string };

type ToggleResult = { ok: true } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID_RE.test(v);

const JOB_CARD_NO_UIDX = "job_cards_job_card_no_uidx";

const numStr = (v: number | undefined): string | null =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : null;

const dateOrNull = (v: string | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Is this error a unique-violation on the case-insensitive jobCardNo index? */
function isJobCardNoConflict(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code !== "23505") return false;
  // The lower() expression index surfaces by name on the constraint/message.
  return (
    e?.constraint === JOB_CARD_NO_UIDX ||
    (typeof e?.message === "string" && e.message.includes(JOB_CARD_NO_UIDX))
  );
}

/**
 * Map a validated input into the jobCards column shape (numeric cols take
 * strings, date cols take Date). Only used after `safeParse` so the input is
 * the parsed/coerced data.
 */
function toColumns(
  v: CreateJobCardInput | UpdateJobCardInput,
): Partial<NewJobCard> {
  const cols: Partial<NewJobCard> = {};
  if (v.jobCardNo !== undefined) cols.jobCardNo = v.jobCardNo;
  if (v.jobCardDate !== undefined) cols.jobCardDate = dateOrNull(v.jobCardDate);
  if (v.oaNo !== undefined) cols.oaNo = v.oaNo ?? null;
  if (v.deliveryDate !== undefined) cols.deliveryDate = dateOrNull(v.deliveryDate);

  if (v.salesOrderId !== undefined) cols.salesOrderId = v.salesOrderId ?? null;
  if (v.clientId !== undefined) cols.clientId = v.clientId ?? null;
  if (v.customerName !== undefined) cols.customerName = v.customerName ?? null;
  if (v.itemId !== undefined) cols.itemId = v.itemId ?? null;
  if (v.productCode !== undefined) cols.productCode = v.productCode ?? null;
  if (v.productName !== undefined) cols.productName = v.productName ?? null;

  if (v.diaSize !== undefined) cols.diaSize = v.diaSize ?? null;
  if (v.punchSize !== undefined) cols.punchSize = v.punchSize ?? null;
  if (v.proposedSize !== undefined) cols.proposedSize = v.proposedSize ?? null;

  if (v.gradeName !== undefined) cols.gradeName = v.gradeName ?? null;
  if (v.gradeColour !== undefined) cols.gradeColour = v.gradeColour ?? null;

  if (v.weight !== undefined) cols.weight = numStr(v.weight as number | undefined);
  if (v.heightMin !== undefined) cols.heightMin = numStr(v.heightMin as number | undefined);
  if (v.heightMax !== undefined) cols.heightMax = numStr(v.heightMax as number | undefined);
  if (v.orderQuantity !== undefined) cols.orderQuantity = numStr(v.orderQuantity as number | undefined);
  if (v.plannedQtyToPress !== undefined) cols.plannedQtyToPress = numStr(v.plannedQtyToPress as number | undefined);

  if (v.dispatchConditionId !== undefined) cols.dispatchConditionId = v.dispatchConditionId ?? null;
  if (v.toleranceId !== undefined) cols.toleranceId = v.toleranceId ?? null;
  if (v.pressingTypeId !== undefined) cols.pressingTypeId = v.pressingTypeId ?? null;

  if (v.ypNo !== undefined) cols.ypNo = v.ypNo ?? null;
  if (v.supportSizeTop !== undefined) cols.supportSizeTop = v.supportSizeTop ?? null;
  if (v.supportSizeBottom !== undefined) cols.supportSizeBottom = v.supportSizeBottom ?? null;

  if (v.makeSampleForSintering !== undefined) cols.makeSampleForSintering = v.makeSampleForSintering ?? null;
  if (v.outsource !== undefined) cols.outsource = v.outsource ?? null;
  if (v.supplierVendorName !== undefined) cols.supplierVendorName = v.supplierVendorName ?? null;
  if (v.process !== undefined) cols.process = v.process ?? null;

  if (v.prevWeight !== undefined) cols.prevWeight = numStr(v.prevWeight as number | undefined);
  if (v.prevPressure !== undefined) cols.prevPressure = v.prevPressure ?? null;
  if (v.prevGradeName !== undefined) cols.prevGradeName = v.prevGradeName ?? null;

  if (v.remarks !== undefined) cols.remarks = v.remarks ?? null;

  return cols;
}

/**
 * Create a Job Card. jobCardNo is user-entered, so a duplicate is rejected with
 * a friendly message (NO auto-retry — the user owns the number). Other fields
 * are optional snapshots. requireUser (sales-floor open like the other forms).
 */
export async function createJobCard(
  input: CreateJobCardInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = CreateJobCardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const cols = toColumns(v);

  try {
    const [row] = await db
      .insert(jobCards)
      .values({ ...cols, jobCardNo: v.jobCardNo, createdById: me.id })
      .returning({ id: jobCards.id, jobCardNo: jobCards.jobCardNo });
    if (!row) {
      return { ok: false, error: "Could not create the job card. Please try again." };
    }

    await recordAudit({
      entityType: "job_card",
      entityId: row.id,
      entityLabel: row.jobCardNo,
      action: "create",
      actorId: me.id,
      actorName: me.name,
      summary: `Job card ${row.jobCardNo} created`,
    });
    revalidatePath("/job-cards");
    return { ok: true, id: row.id, jobCardNo: row.jobCardNo };
  } catch (err) {
    if (isJobCardNoConflict(err)) {
      return { ok: false, error: "A job card with this number already exists." };
    }
    console.error("[createJobCard] failed", err);
    return { ok: false, error: "Could not create the job card. Please try again." };
  }
}

/**
 * Update a Job Card. requireUser. Blocks a jobCardNo collision with ANOTHER
 * row (case-insensitive) before writing, and still defends against the unique
 * index at insert time.
 */
export async function updateJobCard(
  id: string,
  input: UpdateJobCardInput,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid job card id." };
  const parsed = UpdateJobCardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const [existing] = await db
    .select({ id: jobCards.id, jobCardNo: jobCards.jobCardNo })
    .from(jobCards)
    .where(eq(jobCards.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: "Job card not found." };

  // Pre-check a duplicate number against OTHER rows (case-insensitive).
  if (v.jobCardNo !== undefined) {
    const [clash] = await db
      .select({ id: jobCards.id })
      .from(jobCards)
      .where(
        and(
          sql`lower(${jobCards.jobCardNo}) = lower(${v.jobCardNo})`,
          ne(jobCards.id, id),
        ),
      )
      .limit(1);
    if (clash) {
      return { ok: false, error: "A job card with this number already exists." };
    }
  }

  const cols = toColumns(v);
  if (Object.keys(cols).length === 0) {
    return { ok: true, id: existing.id, jobCardNo: existing.jobCardNo };
  }

  try {
    const [row] = await db
      .update(jobCards)
      .set({ ...cols, updatedAt: new Date() })
      .where(eq(jobCards.id, id))
      .returning({ id: jobCards.id, jobCardNo: jobCards.jobCardNo });
    if (!row) {
      return { ok: false, error: "Could not save the job card. Please try again." };
    }

    await recordAudit({
      entityType: "job_card",
      entityId: row.id,
      entityLabel: row.jobCardNo,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      summary: `Job card ${row.jobCardNo} updated`,
    });
    revalidatePath("/job-cards");
    revalidatePath(`/job-cards/${id}`);
    return { ok: true, id: row.id, jobCardNo: row.jobCardNo };
  } catch (err) {
    if (isJobCardNoConflict(err)) {
      return { ok: false, error: "A job card with this number already exists." };
    }
    console.error("[updateJobCard] failed", err);
    return { ok: false, error: "Could not save the job card. Please try again." };
  }
}

/**
 * Deactivate a Job Card (deactivate-only governance — mirrors deactivateItem).
 * Job cards are never hard-deleted. Admin-only. Sets is_active=false +
 * deleted_at.
 */
export async function deactivateJobCard(id: string): Promise<ToggleResult> {
  const me = await requireAdmin();
  if (!isUuid(id)) return { ok: false, error: "Invalid job card id." };

  const [jc] = await db
    .select({ id: jobCards.id, jobCardNo: jobCards.jobCardNo, isActive: jobCards.isActive })
    .from(jobCards)
    .where(eq(jobCards.id, id))
    .limit(1);
  if (!jc) return { ok: false, error: "Job card not found." };
  if (!jc.isActive) return { ok: true }; // idempotent

  try {
    await db
      .update(jobCards)
      .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobCards.id, jc.id));
  } catch (err) {
    console.error("[deactivateJobCard] failed", err);
    return { ok: false, error: "Could not deactivate the job card. Please try again." };
  }

  await recordAudit({
    entityType: "job_card",
    entityId: jc.id,
    entityLabel: jc.jobCardNo,
    action: "delete",
    actorId: me.id,
    actorName: me.name,
    summary: `Job card ${jc.jobCardNo} deactivated`,
  });
  revalidatePath("/job-cards");
  revalidatePath(`/job-cards/${jc.id}`);
  return { ok: true };
}

/** Reactivate a previously-deactivated Job Card. Admin-only. */
export async function reactivateJobCard(id: string): Promise<ToggleResult> {
  const me = await requireAdmin();
  if (!isUuid(id)) return { ok: false, error: "Invalid job card id." };

  const [jc] = await db
    .select({ id: jobCards.id, jobCardNo: jobCards.jobCardNo, isActive: jobCards.isActive })
    .from(jobCards)
    .where(eq(jobCards.id, id))
    .limit(1);
  if (!jc) return { ok: false, error: "Job card not found." };
  if (jc.isActive) return { ok: true }; // idempotent

  try {
    await db
      .update(jobCards)
      .set({ isActive: true, deletedAt: null, updatedAt: new Date() })
      .where(eq(jobCards.id, jc.id));
  } catch (err) {
    console.error("[reactivateJobCard] failed", err);
    return { ok: false, error: "Could not reactivate the job card. Please try again." };
  }

  await recordAudit({
    entityType: "job_card",
    entityId: jc.id,
    entityLabel: jc.jobCardNo,
    action: "restore",
    actorId: me.id,
    actorName: me.name,
    summary: `Job card ${jc.jobCardNo} reactivated`,
  });
  revalidatePath("/job-cards");
  revalidatePath(`/job-cards/${jc.id}`);
  return { ok: true };
}
