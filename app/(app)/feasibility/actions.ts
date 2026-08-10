"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { FEASIBILITY_STATUSES, type FeasibilityStatus } from "@/db/enums";
import {
  SaveFeasibilityChecklistSchema,
  SetFeasibilityStatusSchema,
} from "@/lib/validators/feasibility";
import {
  effectiveSecondaryBucket,
  nextSecondaryBucket,
} from "@/lib/feasibility/stage-buckets";

type Result = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Drop `undefined` keys so a partial save never nulls untouched columns. */
function clean<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

type InquiryItemRow = typeof inquiryItems.$inferSelect;

/**
 * Build the frozen PF baseline snapshot from a live inquiry_item row — the exact
 * object `lockItemDimensions` freezes into `feasibility_baseline` (the variance
 * baseline). Shared by lock and by the Secondary-done → confirm path so both
 * produce an identically-shaped snapshot. Shape MUST NOT change (variance report
 * reads these keys).
 */
function buildFeasibilityBaseline(
  item: InquiryItemRow,
  lockedById: string,
  now: Date,
) {
  return {
    shape: item.shape,
    outerDia: item.outerDia,
    innerDia: item.innerDia,
    length: item.length,
    width: item.width,
    thickness: item.thickness,
    dimensionUnit: item.dimensionUnit,
    dimensionNotes: item.dimensionNotes,
    gradeCustomer: item.gradeCustomer,
    gradeCustomerFacingId: item.gradeCustomerFacingId,
    gradeInternalProductionId: item.gradeInternalProductionId,
    toleranceId: item.toleranceId,
    conditionId: item.conditionId,
    internalProductionCodeId: item.internalProductionCodeId,
    partNoId: item.partNoId,
    quantityNos: item.quantityNos,
    quantityUom: item.quantityUom,
    lockedAt: now.toISOString(),
    lockedById,
  };
}

/**
 * Save the Primary-Feasibility review for one enquiry (client-sheet model):
 * the five checks + notes, priority, export, actions list, who checked it, the
 * sales person, and the feasibility status — all onto the `inquiries` row.
 */
export async function saveFeasibilityChecklist(
  inquiryId: string,
  input: unknown,
): Promise<Result> {
  await requireAdmin();
  if (!UUID_RE.test(inquiryId)) return { ok: false, error: "Invalid enquiry." };

  const parsed = SaveFeasibilityChecklistSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const patch = clean({
    feasSizeDrawingCheck: v.sizeDrawingCheck,
    feasSizeDrawingNotes: v.sizeDrawingNotes,
    feasToleranceCheck: v.toleranceCheck,
    feasToleranceNotes: v.toleranceNotes,
    feasGradeAppCheck: v.gradeAppCheck,
    feasGradeAppNotes: v.gradeAppNotes,
    feasQuantityCheck: v.quantityCheck,
    feasQuantityNotes: v.quantityNotes,
    feasConditionCheck: v.conditionCheck,
    feasConditionNotes: v.conditionNotes,
    feasPriority: v.priority,
    feasExport: v.export,
    feasActionsList: v.actionsList,
    feasNotes: v.notes,
    feasAttachments: v.attachments,
    feasibilityCheckedById: v.feasibilityCheckedById,
    assignedSalesPersonId: v.assignedSalesPersonId,
    feasibilityStatus: v.status,
    updatedAt: new Date(),
  });

  try {
    const updated = await db
      .update(inquiries)
      .set(patch)
      .where(eq(inquiries.id, inquiryId))
      .returning({ id: inquiries.id });
    if (updated.length === 0) return { ok: false, error: "Enquiry not found." };
  } catch {
    // A bad/deactivated employee id (checked-by / sales person) or other FK
    // violation would otherwise throw a raw 500 - surface a typed error instead.
    return {
      ok: false,
      error: "Could not save the review - please re-check the selected people and try again.",
    };
  }

  revalidatePath("/feasibility");
  revalidatePath(`/feasibility/${inquiryId}`);
  revalidatePath(`/enquiries/register/${inquiryId}`);
  return { ok: true };
}

/** Set the feasibility status for one enquiry (queue quick-set). */
export async function setFeasibilityStatus(
  inquiryId: string,
  status: string,
): Promise<Result> {
  await requireAdmin();
  const parsed = SetFeasibilityStatusSchema.safeParse({ status });
  if (!parsed.success || !UUID_RE.test(inquiryId)) {
    return { ok: false, error: "Invalid status." };
  }
  try {
    const updated = await db
      .update(inquiries)
      .set({ feasibilityStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(inquiries.id, inquiryId))
      .returning({ id: inquiries.id });
    if (updated.length === 0) return { ok: false, error: "Enquiry not found." };
  } catch {
    return { ok: false, error: "Could not update the feasibility status." };
  }
  revalidatePath("/feasibility");
  revalidatePath(`/feasibility/${inquiryId}`);
  return { ok: true };
}

/**
 * Save the Secondary / Technical Feasibility for one product line — the detailed
 * technical-spec stage that sits between Primary Feasibility (the 5-check review +
 * Lock Dimensions) and Confirm. Writes per-dimension tolerances, secondary weights,
 * manufacturability (process route + tooling/material availability), the technical
 * verdict and notes. When `markDone` is passed it stamps the line as done
 * (secondaryFeasibilityDone + at + by) AND — unless the verdict is not_feasible —
 * atomically locks the dimensions (snapshotting the PF baseline) and confirms the
 * line's feasibility, so a done Secondary line flows straight to Costing. If every
 * line of the enquiry is then confirmed, the enquiry rolls to proceed_to_costing.
 * Any user may save.
 */
export async function saveSecondaryFeasibility(input: {
  inquiryItemId: string;
  outerDiaTol?: string | null;
  innerDiaTol?: string | null;
  lengthTol?: string | null;
  widthTol?: string | null;
  thicknessTol?: string | null;
  secBlockWt?: string | null;
  secNetWt?: string | null;
  secMaterialWt?: string | null;
  gradeInternalProductionId?: string | null;
  conditionId?: string | null;
  secProcessRoute?: string | null;
  secToolingAvailability?: string | null;
  secMaterialAvailability?: string | null;
  secVerdict?: string | null;
  secNotes?: string | null;
  markDone?: boolean;
}): Promise<{ ok: true; note?: string } | { ok: false; error: string }> {
  const me = await requireAdmin();
  const { inquiryItemId, markDone, ...fields } = input;
  if (!UUID_RE.test(inquiryItemId)) return { ok: false, error: "Invalid product line." };

  const [item] = await db
    .select()
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  if (!item) return { ok: false, error: "Product line not found." };

  const now = new Date();

  // Verdict effective after this save (the incoming value, else what's on file).
  const effVerdict = fields.secVerdict !== undefined ? fields.secVerdict : item.secVerdict;
  // Marking Secondary done confirms the line (locks + confirms) UNLESS the verdict
  // is not_feasible — a not-feasible line is stamped done but never confirmed.
  const notFeasible = markDone === true && effVerdict === "not_feasible";
  const willConfirm = markDone === true && !notFeasible;

  // House bucket for the Secondary stage (migration 0072). Derived from the
  // line's EFFECTIVE bucket so a legacy row (status still at the column default
  // while its done/verdict stamps say otherwise) is never demoted by a save.
  // `hasSecondaryData: true` because reaching this line IS a secondary capture.
  const currentBucket = effectiveSecondaryBucket({
    storedStatus: item.secondaryFeasibilityStatus,
    secondaryDone: item.secondaryFeasibilityDone,
    secVerdict: item.secVerdict,
    hasSecondaryData: true,
  });
  const secondaryBucket = nextSecondaryBucket({
    current: currentBucket,
    markDone: markDone === true,
    verdict: effVerdict,
  });

  const patch = clean({
    outerDiaTol: fields.outerDiaTol,
    innerDiaTol: fields.innerDiaTol,
    lengthTol: fields.lengthTol,
    widthTol: fields.widthTol,
    thicknessTol: fields.thicknessTol,
    secBlockWt: fields.secBlockWt,
    secNetWt: fields.secNetWt,
    secMaterialWt: fields.secMaterialWt,
    // Internal production grade + condition/finish reuse the existing spine
    // columns (also captured in the lock baseline snapshot).
    gradeInternalProductionId: fields.gradeInternalProductionId,
    conditionId: fields.conditionId,
    secProcessRoute: fields.secProcessRoute,
    secToolingAvailability: fields.secToolingAvailability,
    secMaterialAvailability: fields.secMaterialAvailability,
    secVerdict: fields.secVerdict,
    secNotes: fields.secNotes,
    // The bucket the Secondary register groups + counts by. Marking done is the
    // only path to an end bucket (Approved / Not Feasible); a plain save lands
    // on Draft, or Need Info when that verdict is set.
    secondaryFeasibilityStatus: secondaryBucket,
    ...(markDone
      ? {
          secondaryFeasibilityDone: true,
          secondaryFeasibilityAt: now,
          secondaryFeasibilityById: me.id,
        }
      : {}),
    updatedAt: now,
  }) as Record<string, unknown>;

  if (willConfirm) {
    // Baseline reflects the spec AFTER this secondary save — the only spec columns
    // secondary touches are gradeInternalProductionId + conditionId, so merge those.
    const merged: InquiryItemRow = {
      ...item,
      gradeInternalProductionId:
        fields.gradeInternalProductionId !== undefined
          ? fields.gradeInternalProductionId
          : item.gradeInternalProductionId,
      conditionId:
        fields.conditionId !== undefined ? fields.conditionId : item.conditionId,
    };
    Object.assign(patch, {
      // Lock the baseline (Secondary-done IS the lock step).
      isDimensionsLocked: true,
      lockedById: me.id,
      lockedAt: now,
      feasibilityBaseline: buildFeasibilityBaseline(merged, me.id, now),
      // Confirm the line so it becomes costable.
      feasibilityConfirmed: true,
      feasibilityConfirmedById: me.id,
      feasibilityConfirmedAt: now,
    });
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(inquiryItems)
        .set(patch)
        .where(eq(inquiryItems.id, inquiryItemId));

      if (willConfirm) {
        // Roll the enquiry to proceed_to_costing once ALL its lines are confirmed
        // (keeps the queue label + Confirmed register + costing gate consistent).
        const siblings = await tx
          .select({ feasibilityConfirmed: inquiryItems.feasibilityConfirmed })
          .from(inquiryItems)
          .where(eq(inquiryItems.inquiryId, item.inquiryId));
        const allConfirmed =
          siblings.length > 0 && siblings.every((s) => s.feasibilityConfirmed === true);
        if (allConfirmed) {
          await tx
            .update(inquiries)
            .set({ feasibilityStatus: "proceed_to_costing", updatedAt: now })
            .where(eq(inquiries.id, item.inquiryId));
        }
      }
    });
  } catch {
    return { ok: false, error: "Could not save Secondary Feasibility - please try again." };
  }

  revalidatePath("/feasibility");
  revalidatePath(`/feasibility/${item.inquiryId}`);
  revalidatePath("/secondary-feasibility/confirmed");
  revalidatePath("/secondary-feasibility");
  revalidatePath(`/secondary-feasibility/${item.inquiryId}`);
  revalidatePath("/costings/new");
  revalidatePath(`/enquiries/register/${item.inquiryId}`);

  if (notFeasible) {
    return {
      ok: true,
      note: "Marked done as not feasible — line was not confirmed for costing.",
    };
  }
  return { ok: true };
}

/**
 * Lock one product line's dimensions & specifications (Form 04 → Form 05 gate,
 * migration 0062). Freezes a JSON snapshot of the live spec fields into
 * `feasibility_baseline` — the frozen PF baseline the PF-vs-Costing variance
 * report compares against — and flips the line to locked. Re-locking an already
 * unlocked line simply re-snapshots the current values. Any user may lock.
 */
export async function lockItemDimensions(inquiryItemId: string): Promise<Result> {
  const me = await requireAdmin();
  if (!UUID_RE.test(inquiryItemId)) return { ok: false, error: "Invalid product line." };

  const [item] = await db
    .select()
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  if (!item) return { ok: false, error: "Product line not found." };

  // Gate: Secondary / Technical Feasibility must be completed before Confirm (lock).
  if (item.secondaryFeasibilityDone !== true) {
    return { ok: false, error: "Complete Secondary Feasibility before confirming." };
  }

  const now = new Date();
  // Frozen snapshot of the LIVE spec columns at lock time (baseline for variance).
  const baseline = buildFeasibilityBaseline(item, me.id, now);

  try {
    await db
      .update(inquiryItems)
      .set({
        isDimensionsLocked: true,
        lockedById: me.id,
        lockedAt: now,
        feasibilityBaseline: baseline,
        updatedAt: now,
      })
      .where(eq(inquiryItems.id, inquiryItemId));
  } catch {
    return { ok: false, error: "Could not lock the dimensions - please try again." };
  }

  revalidatePath(`/feasibility/${item.inquiryId}`);
  revalidatePath(`/secondary-feasibility/${item.inquiryId}`);
  revalidatePath("/secondary-feasibility");
  revalidatePath(`/enquiries/register/${item.inquiryId}`);
  return { ok: true };
}

/**
 * Unlock one product line (admin-only, reversible). Clears the locked flag and
 * who/when, but KEEPS `feasibility_baseline` for history so an earlier PF
 * snapshot is never lost.
 */
export async function unlockItemDimensions(inquiryItemId: string): Promise<Result> {
  await requireAdmin();
  if (!UUID_RE.test(inquiryItemId)) return { ok: false, error: "Invalid product line." };

  const [item] = await db
    .select({ inquiryId: inquiryItems.inquiryId })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  if (!item) return { ok: false, error: "Product line not found." };

  try {
    await db
      .update(inquiryItems)
      .set({
        isDimensionsLocked: false,
        lockedById: null,
        lockedAt: null,
        // A line can't stay feasibility-confirmed once its dimensions are unlocked
        // (confirmation requires a lock) — clear the confirmed fields too.
        feasibilityConfirmed: false,
        feasibilityConfirmedById: null,
        feasibilityConfirmedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(inquiryItems.id, inquiryItemId));
  } catch {
    return { ok: false, error: "Could not unlock the dimensions." };
  }

  revalidatePath(`/feasibility/${item.inquiryId}`);
  revalidatePath(`/secondary-feasibility/${item.inquiryId}`);
  revalidatePath(`/secondary-feasibility`);
  revalidatePath(`/secondary-feasibility/confirmed`);
  revalidatePath(`/costings/new`);
  revalidatePath(`/enquiries/register/${item.inquiryId}`);
  return { ok: true };
}

/**
 * Confirm one product line's feasibility — the per-item step AFTER Lock
 * Dimensions. Confirming REQUIRES the line to be locked first (Lock = the
 * Secondary/Technical stage). Only confirmed lines flow to Costing (the strong
 * per-item costing gate). Any user may confirm.
 */
export async function confirmItemFeasibility(inquiryItemId: string): Promise<Result> {
  const me = await requireAdmin();
  if (!UUID_RE.test(inquiryItemId)) return { ok: false, error: "Invalid product line." };

  const [item] = await db
    .select({
      inquiryId: inquiryItems.inquiryId,
      isDimensionsLocked: inquiryItems.isDimensionsLocked,
    })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  if (!item) return { ok: false, error: "Product line not found." };
  if (!item.isDimensionsLocked) {
    return { ok: false, error: "Lock the dimensions before confirming feasibility." };
  }

  const now = new Date();
  try {
    await db
      .update(inquiryItems)
      .set({
        feasibilityConfirmed: true,
        feasibilityConfirmedById: me.id,
        feasibilityConfirmedAt: now,
        updatedAt: now,
      })
      .where(eq(inquiryItems.id, inquiryItemId));
  } catch {
    return { ok: false, error: "Could not confirm the feasibility - please try again." };
  }

  revalidatePath(`/feasibility/${item.inquiryId}`);
  revalidatePath(`/secondary-feasibility/${item.inquiryId}`);
  revalidatePath(`/secondary-feasibility`);
  revalidatePath(`/secondary-feasibility/confirmed`);
  revalidatePath(`/costings/new`);
  revalidatePath(`/enquiries/register/${item.inquiryId}`);
  return { ok: true };
}

/**
 * Un-confirm one product line (admin-only, reversible). Clears the confirmed
 * flag + who/when so the line drops out of the Confirmed Feasibility Register
 * and can no longer be costed until re-confirmed.
 */
export async function unconfirmItemFeasibility(inquiryItemId: string): Promise<Result> {
  await requireAdmin();
  if (!UUID_RE.test(inquiryItemId)) return { ok: false, error: "Invalid product line." };

  const [item] = await db
    .select({ inquiryId: inquiryItems.inquiryId })
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  if (!item) return { ok: false, error: "Product line not found." };

  try {
    await db
      .update(inquiryItems)
      .set({
        feasibilityConfirmed: false,
        feasibilityConfirmedById: null,
        feasibilityConfirmedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(inquiryItems.id, inquiryItemId));
  } catch {
    return { ok: false, error: "Could not un-confirm the feasibility." };
  }

  revalidatePath(`/feasibility/${item.inquiryId}`);
  revalidatePath(`/secondary-feasibility/${item.inquiryId}`);
  revalidatePath(`/secondary-feasibility`);
  revalidatePath(`/secondary-feasibility/confirmed`);
  revalidatePath(`/costings/new`);
  revalidatePath(`/enquiries/register/${item.inquiryId}`);
  return { ok: true };
}

/** Bulk status set from the queue. */
export async function setFeasibilityStatusBulk(
  ids: string[],
  status: string,
): Promise<Result> {
  await requireAdmin();
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: "No rows selected." };
  if (!ids.every((id) => UUID_RE.test(id))) return { ok: false, error: "Invalid selection." };
  if (!FEASIBILITY_STATUSES.includes(status as FeasibilityStatus)) {
    return { ok: false, error: "Invalid status." };
  }
  try {
    await db
      .update(inquiries)
      .set({ feasibilityStatus: status as FeasibilityStatus, updatedAt: new Date() })
      .where(inArray(inquiries.id, ids));
  } catch {
    return { ok: false, error: "Could not update the selected enquiries." };
  }
  revalidatePath("/feasibility");
  return { ok: true };
}
