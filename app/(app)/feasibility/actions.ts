"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { FEASIBILITY_STATUSES, type FeasibilityStatus } from "@/db/enums";
import {
  SaveFeasibilityChecklistSchema,
  SetFeasibilityStatusSchema,
} from "@/lib/validators/feasibility";

type Result = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Drop `undefined` keys so a partial save never nulls untouched columns. */
function clean<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
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
  await requireUser();
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
  await requireUser();
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
 * Lock one product line's dimensions & specifications (Form 04 → Form 05 gate,
 * migration 0062). Freezes a JSON snapshot of the live spec fields into
 * `feasibility_baseline` — the frozen PF baseline the PF-vs-Costing variance
 * report compares against — and flips the line to locked. Re-locking an already
 * unlocked line simply re-snapshots the current values. Any user may lock.
 */
export async function lockItemDimensions(inquiryItemId: string): Promise<Result> {
  const me = await requireUser();
  if (!UUID_RE.test(inquiryItemId)) return { ok: false, error: "Invalid product line." };

  const [item] = await db
    .select()
    .from(inquiryItems)
    .where(eq(inquiryItems.id, inquiryItemId))
    .limit(1);
  if (!item) return { ok: false, error: "Product line not found." };

  const now = new Date();
  // Frozen snapshot of the LIVE spec columns at lock time (baseline for variance).
  const baseline = {
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
    lockedById: me.id,
  };

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
        updatedAt: new Date(),
      })
      .where(eq(inquiryItems.id, inquiryItemId));
  } catch {
    return { ok: false, error: "Could not unlock the dimensions." };
  }

  revalidatePath(`/feasibility/${item.inquiryId}`);
  revalidatePath(`/enquiries/register/${item.inquiryId}`);
  return { ok: true };
}

/** Bulk status set from the queue. */
export async function setFeasibilityStatusBulk(
  ids: string[],
  status: string,
): Promise<Result> {
  await requireUser();
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
