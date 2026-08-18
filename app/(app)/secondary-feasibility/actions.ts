"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, masterOptions, type NewInquiry } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { approvalRefusal } from "@/lib/approval/gate";
import { CHECK_STATES, DOC_GIVEN_OPTIONS, INQUIRY_SHAPES, type CheckState } from "@/db/enums";
import { SECONDARY_SETTABLE_BUCKETS } from "@/lib/feasibility/stage-buckets";
import { syncProductToItem, type ItemSpec } from "@/lib/item-master/sync";

type Result = { ok: true } | { ok: false; error: string };
type NewInquiryItem = typeof inquiryItems.$inferInsert;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A decimal box: "" → null, otherwise a finite non-negative number as text. */
const DecimalText = z
  .string()
  .trim()
  .max(24)
  .refine((s) => s === "" || (Number.isFinite(Number(s)) && Number(s) >= 0), "Enter a valid number")
  .transform((s) => (s === "" ? null : s));

/** A uuid select: "" → null. */
const OptionalUuid = z
  .string()
  .trim()
  .refine((s) => s === "" || UUID_RE.test(s), "Invalid selection")
  .transform((s) => (s === "" ? null : s));

/** Free text: "" → null. */
const Text = (max: number) =>
  z.string().trim().max(max).transform((s) => (s === "" ? null : s));

/** A member of `values` (or "" for cleared) → the value or null. */
const OneOf = <T extends string>(values: readonly T[], message: string) =>
  z
    .string()
    .trim()
    .refine((s) => s === "" || (values as readonly string[]).includes(s), message)
    .transform((s) => (s === "" ? null : (s as T)));

/**
 * The two editable bands of the Secondary review's enquiry panel. Every field is
 * optional so an autosave only ever sends a patch; `.strict()` rejects stray
 * keys instead of silently dropping them.
 */
const SaveProductDetailsSchema = z
  .object({
    // ── Product & Quantity (the enquiry row) ──
    productDescription: z.string().trim().max(2000).optional(),
    quantityStatus: OneOf<CheckState>(CHECK_STATES, "Invalid quantity status").optional(),
    quantityNos: DecimalText.optional(),
    quantityUom: z.string().trim().max(20).optional(),
    sampleReceived: z.union([z.boolean(), z.null()]).optional(),
    docsGiven: z.array(z.enum(DOC_GIVEN_OPTIONS)).optional(),
    // ── Enquiry Checks (the enquiry row; Given / Not Given / Assumed) ──
    shapeDimensionCheck: OneOf<CheckState>(CHECK_STATES, "Invalid check").optional(),
    gradeCheck: OneOf<CheckState>(CHECK_STATES, "Invalid check").optional(),
    toleranceCheck: OneOf<CheckState>(CHECK_STATES, "Invalid check").optional(),
    conditionCheck: OneOf<CheckState>(CHECK_STATES, "Invalid check").optional(),
    // ── Dimensions & Specification (the product line + the enquiry mirror) ──
    shape: OneOf(INQUIRY_SHAPES, "Invalid shape").optional(),
    outerDia: DecimalText.optional(),
    innerDia: DecimalText.optional(),
    length: DecimalText.optional(),
    width: DecimalText.optional(),
    thickness: DecimalText.optional(),
    gradeCustomer: Text(120).optional(),
    toleranceId: OptionalUuid.optional(),
    conditionId: OptionalUuid.optional(),
    dimensionNotes: Text(1000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });

/** The spec keys — any of these present in the patch ⇒ the line spec is edited. */
const SPEC_KEYS = [
  "shape",
  "outerDia",
  "innerDia",
  "length",
  "width",
  "thickness",
  "gradeCustomer",
  "toleranceId",
  "conditionId",
  "dimensionNotes",
] as const;

/** Drop `undefined` keys so a partial save never nulls untouched columns. */
function clean<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

const toNum = (v: string | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Save the editable bands of the Secondary Feasibility review's enquiry panel —
 * "Product & Quantity", "Enquiry Checks" and "Dimensions & Specification".
 *
 * Product & Quantity and the Enquiry Checks live on the enquiry row. The spec/dimension fields are
 * displayed read-through from the FIRST product line (`inquiry_items`, lowest
 * sort order) with the enquiry's legacy columns as the fallback — so a spec edit
 * writes BOTH: the line (the source of truth, which then re-syncs to the Item
 * Master via `syncProductToItem`) and the enquiry's mirror columns, keeping the
 * two consistent. Spec edits are refused once that line's dimensions are locked
 * or its feasibility is confirmed — the frozen baseline must stay frozen.
 */
export async function saveSecondaryProductDetails(
  inquiryId: string,
  input: unknown,
): Promise<Result> {
  const me = await requireUser();
  if (!UUID_RE.test(inquiryId)) return { ok: false, error: "Invalid enquiry." };

  const parsed = SaveProductDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;
  const editsSpec = SPEC_KEYS.some((k) => v[k] !== undefined);

  const lines = await db
    .select()
    .from(inquiryItems)
    .where(eq(inquiryItems.inquiryId, inquiryId))
    .orderBy(asc(inquiryItems.sortOrder));
  const line = lines[0];

  if (editsSpec) {
    if (!line) return { ok: false, error: "This enquiry has no product line to edit." };
    if (line.isDimensionsLocked || line.feasibilityConfirmed) {
      return {
        ok: false,
        error: "Dimensions are locked for this line — un-confirm it before editing the spec.",
      };
    }
  }

  // Enquiry-row patch: Product & Quantity + the legacy spec mirror columns.
  // `productDescription` and `quantityUom` are NOT NULL, so they only ever take
  // a real value (an emptied UoM box keeps whatever is on file).
  const inquiryPatch = clean({
    productDescription: v.productDescription,
    quantityStatus: v.quantityStatus,
    quantityNos: v.quantityNos,
    quantityUom: v.quantityUom === "" ? undefined : v.quantityUom,
    sampleReceived: v.sampleReceived,
    docsGiven: v.docsGiven,
    shapeDimensionCheck: v.shapeDimensionCheck,
    gradeCheck: v.gradeCheck,
    toleranceCheck: v.toleranceCheck,
    conditionCheck: v.conditionCheck,
    ...(editsSpec
      ? {
          shape: v.shape,
          outerDia: v.outerDia,
          innerDia: v.innerDia,
          length: v.length,
          width: v.width,
          thickness: v.thickness,
          toleranceId: v.toleranceId,
          conditionId: v.conditionId,
          dimensionNotes: v.dimensionNotes,
        }
      : {}),
  }) as Partial<NewInquiry>;

  // The line carries quantity too — keep it in step with the enquiry so Costing
  // (which reads the line) never sees a stale quantity.
  const linePatch = clean({
    quantityNos: v.quantityNos,
    quantityUom: v.quantityUom === "" ? undefined : v.quantityUom,
    ...(editsSpec
      ? {
          shape: v.shape,
          outerDia: v.outerDia,
          innerDia: v.innerDia,
          length: v.length,
          width: v.width,
          thickness: v.thickness,
          gradeCustomer: v.gradeCustomer,
          toleranceId: v.toleranceId,
          conditionId: v.conditionId,
          dimensionNotes: v.dimensionNotes,
        }
      : {}),
  }) as Partial<NewInquiryItem>;

  try {
    await db.transaction(async (tx) => {
      if (Object.keys(inquiryPatch).length > 0) {
        await tx
          .update(inquiries)
          .set({ ...inquiryPatch, updatedAt: new Date() })
          .where(eq(inquiries.id, inquiryId));
      }

      if (!line || Object.keys(linePatch).length === 0) return;

      await tx
        .update(inquiryItems)
        .set({ ...linePatch, updatedAt: new Date() })
        .where(eq(inquiryItems.id, line.id));

      if (!editsSpec) return;

      // Re-sync the line to the Item Master: the spec changed, so the line may
      // now dedup onto a different item (or need a fresh one). Mirrors the
      // re-sync `updateInquiry` runs — relink only, never delete/reinsert.
      const merged = { ...line, ...linePatch };
      const shapeName = merged.shape ?? null;
      let shapeId: string | null = null;
      if (shapeName) {
        const [row] = await tx
          .select({ id: masterOptions.id })
          .from(masterOptions)
          .where(and(eq(masterOptions.kind, "shape"), eq(masterOptions.name, shapeName)))
          .limit(1);
        shapeId = row?.id ?? null;
      }
      const spec: ItemSpec = {
        shapeId,
        internalGradeId: merged.gradeId,
        toleranceId: merged.toleranceId,
        conditionId: merged.conditionId,
        gradeCustomer: merged.gradeCustomer,
        outerDia: toNum(merged.outerDia),
        innerDia: toNum(merged.innerDia),
        length: toNum(merged.length),
        width: toNum(merged.width),
        thickness: toNum(merged.thickness),
        dimensionNotes: merged.dimensionNotes,
      };
      const res = await syncProductToItem(tx, spec, line.id, { id: me.id, name: me.name });
      if (res.itemId !== line.itemId) {
        await tx
          .update(inquiryItems)
          .set({ itemId: res.itemId, updatedAt: new Date() })
          .where(eq(inquiryItems.id, line.id));
      }
    });
  } catch (err) {
    console.error("[saveSecondaryProductDetails] failed", err);
    return { ok: false, error: "Could not save the product details - please try again." };
  }

  revalidatePath("/secondary-feasibility");
  revalidatePath(`/secondary-feasibility/${inquiryId}`);
  revalidatePath(`/feasibility/${inquiryId}`);
  revalidatePath(`/enquiries/register/${inquiryId}`);
  revalidatePath("/items");
  return { ok: true };
}

/* ── Secondary house-bucket quick-set (migration 0072) ───────────────────── */

/**
 * Only the WORKFLOW buckets can be set by hand. The two end buckets
 * (Secondary Feasibility Approved / Not Feasible) are produced exclusively by
 * "Mark Secondary Feasibility Done", because reaching Approved also locks the
 * dimensions and confirms the line into Costing — a register that could flip
 * that bit would create approved-but-uncostable lines.
 */
const SetSecondaryStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "No rows selected.").max(500),
  status: z.enum(SECONDARY_SETTABLE_BUCKETS),
});

/** Set the Secondary Feasibility bucket on one or more product LINES. */
export async function setSecondaryFeasibilityStatusBulk(
  ids: string[],
  status: string,
): Promise<Result> {
  const me = await requireUser();
  const parsed = SetSecondaryStatusSchema.safeParse({ ids, status });
  if (!parsed.success) {
    console.error("[setSecondaryStatusBulk] rejected", {
      status,
      idCount: ids.length,
      issue: parsed.error.issues[0]?.message,
    });
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid status." };
  }
  // Anyone may move a line up to Pending Approval; signing it off is the
  // approver's alone. Bulk carries the same gate as the single setter, since
  // bulk is the easiest way round a per-row check.
  const refusal = approvalRefusal({ status: parsed.data.status }, me);
  if (refusal) return { ok: false, error: refusal };

  try {
    // `returning` so a write that matched NOTHING is reported as a failure
    // instead of a cheerful "Updated 1 row." A silent zero-row update is the
    // one outcome the UI could not previously tell apart from success.
    const updated = await db
      .update(inquiryItems)
      .set({ secondaryFeasibilityStatus: parsed.data.status, updatedAt: new Date() })
      .where(inArray(inquiryItems.id, parsed.data.ids))
      .returning({ id: inquiryItems.id });

    if (updated.length === 0) {
      console.error("[setSecondaryStatusBulk] matched 0 rows", {
        status: parsed.data.status,
        ids: parsed.data.ids,
      });
      return {
        ok: false,
        error: "Those product lines no longer exist — refresh the register and try again.",
      };
    }
  } catch (err) {
    console.error("[setSecondaryStatusBulk] db error", err);
    return { ok: false, error: "Could not update the selected product lines." };
  }

  revalidatePath("/secondary-feasibility");
  return { ok: true };
}

/** Single-line convenience wrapper over {@link setSecondaryFeasibilityStatusBulk}. */
export async function setSecondaryFeasibilityStatus(
  inquiryItemId: string,
  status: string,
): Promise<Result> {
  return setSecondaryFeasibilityStatusBulk([inquiryItemId], status);
}
