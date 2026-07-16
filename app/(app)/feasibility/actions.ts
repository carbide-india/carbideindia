"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
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
    feasibilityCheckedById: v.feasibilityCheckedById,
    assignedSalesPersonId: v.assignedSalesPersonId,
    feasibilityStatus: v.status,
    updatedAt: new Date(),
  });

  await db.update(inquiries).set(patch).where(eq(inquiries.id, inquiryId));

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
  await db
    .update(inquiries)
    .set({ feasibilityStatus: parsed.data.status, updatedAt: new Date() })
    .where(eq(inquiries.id, inquiryId));
  revalidatePath("/feasibility");
  revalidatePath(`/feasibility/${inquiryId}`);
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
  await db
    .update(inquiries)
    .set({ feasibilityStatus: status as FeasibilityStatus, updatedAt: new Date() })
    .where(inArray(inquiries.id, ids));
  revalidatePath("/feasibility");
  return { ok: true };
}
