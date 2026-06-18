"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotations, quotationItems, type NewQuotation } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  getQuoteAutofill,
  getInquiryItemSeeds,
  type QuoteLineSeed,
} from "@/lib/queries/quotes";
import { COSTING_DONE_STATUSES, type CostingDoneStatus } from "@/db/enums";
import {
  CreateQuotationSchema,
  UpdateQuotationSchema,
  SetQuotationStatusSchema,
  type CreateQuotationInput,
  type UpdateQuotationInput,
} from "@/lib/validators/quotation";
import { quoteLineRows } from "@/lib/quotations/line-rows";

/**
 * Quotation (Quote Master) server actions — Phase 4 write path.
 *
 * NOTE on audit logging: there is intentionally none here, same deferred call
 * as the sample/inquiry actions — `task_events`/`settings_events` don't fit
 * app-data writes and a third audit table is a later-phase decision.
 */

type ActionResult =
  | { ok: true; id?: string; quoteNo?: string }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID_RE.test(v);

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

const MAX_NO_TRIES = 5;

/**
 * Quote-line seeds for the form's per-line editor — one per `inquiry_items`
 * row of the picked SM, ordered by sort order. Called client-side on SM select
 * to pre-fill the lines (product/drawing/qty/grade/tolerance/condition);
 * pricing + timeline stay blank for the user to fill.
 */
export async function getInquiryItemsForQuote(
  inquiryId: string,
): Promise<QuoteLineSeed[]> {
  await requireUser();
  if (!isUuid(inquiryId)) return [];
  return getInquiryItemSeeds(inquiryId);
}

export async function createQuotation(
  input: CreateQuotationInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = CreateQuotationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  // SM snapshot + smNumber (for numbering) come from one autofetch query.
  const auto = await getQuoteAutofill(v.inquiryId);
  if (!auto) return { ok: false, error: "Linked enquiry not found." };

  let existingCount = 0;
  if (!v.quoteNo) {
    try {
      const [cnt] = await db
        .select({ n: count() })
        .from(quotations)
        .where(eq(quotations.inquiryId, v.inquiryId));
      existingCount = Number(cnt?.n ?? 0);
    } catch (err) {
      console.error("[createQuotation] count failed", err);
      return { ok: false, error: "Could not create the quotation. Please try again." };
    }
  }

  // Build per-line rows first so line #1 can mirror into the legacy columns.
  const lineRows = quoteLineRows(v);
  const line0 = lineRows[0];

  const values: Omit<NewQuotation, "quoteNo"> = {
    inquiryId: v.inquiryId,
    // snapshot from the SM (header — never per-line)
    companyName: auto.companyName,
    enquiryDate: auto.enquiryDate,
    // per-line legacy mirror — sourced from line #1
    custProductName: line0?.custProductName ?? auto.productDescription ?? undefined,
    custDrawingNo: line0?.custDrawingNo ?? undefined,
    drawingRevisionNo: line0?.drawingRevisionNo ?? undefined,
    qty: line0?.qty ?? auto.quantityNos ?? undefined,
    gradeCustomer: line0?.gradeCustomer ?? auto.gradeName ?? undefined,
    gradeNameForCust: line0?.gradeNameForCust ?? undefined,
    tolerance: line0?.tolerance ?? auto.toleranceName ?? undefined,
    condition: line0?.condition ?? auto.conditionName ?? undefined,
    partNo: line0?.partNo ?? undefined,
    finalCost: line0?.finalCost ?? undefined,
    negotiation: line0?.negotiation ?? undefined,
    quotePrice: line0?.quotePrice ?? undefined,
    developmentTime: line0?.developmentTime ?? undefined,
    deliveryTime: line0?.deliveryTime ?? undefined,
    validity: line0?.validity ?? undefined,
    costingDoneStatus: v.costingDoneStatus,
    quotationLink: v.quotationLink,
    quoteSent: v.quoteSent,
    createdById: me.id,
  };

  const tries = v.quoteNo ? 1 : MAX_NO_TRIES;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const quoteNo =
      v.quoteNo ?? `${auto.smNumber}-Q${String(existingCount + attempt).padStart(2, "0")}`;
    try {
      const row = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(quotations)
          .values({ ...values, quoteNo })
          .returning({ id: quotations.id });
        if (!r) throw new Error("quotations insert returned no row");
        if (lineRows.length) {
          await tx.insert(quotationItems).values(lineRows.map((x) => ({ quotationId: r.id, ...x })));
        }
        return r;
      });
      revalidatePath("/quotations");
      return { ok: true, id: row.id, quoteNo };
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string };
      if (e?.code === "23505" && e?.constraint === "quotations_quote_no_unique") {
        if (v.quoteNo) {
          return { ok: false, error: "A quotation with this number already exists." };
        }
        continue;
      }
      console.error("[createQuotation] failed", err);
      return { ok: false, error: "Could not create the quotation. Please try again." };
    }
  }
  return {
    ok: false,
    error: "Could not allocate a unique quote number — enter one manually.",
  };
}

export async function updateQuotation(
  id: string,
  input: UpdateQuotationInput,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid quotation id." };
  const parsed = UpdateQuotationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = stripUndefined(parsed.data);
  if (Object.keys(v).length === 0) return { ok: true };

  const { finalCost, negotiation, quotePrice, qty, ...rest } = v;
  const patch: Partial<NewQuotation> = { ...rest };
  if (finalCost !== undefined) patch.finalCost = String(finalCost);
  if (negotiation !== undefined) patch.negotiation = String(negotiation);
  if (quotePrice !== undefined) patch.quotePrice = String(quotePrice);
  if (qty !== undefined) patch.qty = String(qty);

  try {
    await db
      .update(quotations)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(quotations.id, id));
  } catch (err) {
    console.error("[updateQuotation] failed", err);
    return { ok: false, error: "Could not save the quotation. Please try again." };
  }

  // Mirror line-#1 per-line subset into quotation_items (sortOrder = 0).
  const LINE1_KEYS = [
    "custProductName", "custDrawingNo", "drawingRevisionNo", "qty",
    "gradeCustomer", "gradeNameForCust", "tolerance", "condition", "partNo",
    "finalCost", "negotiation", "quotePrice",
    "developmentTime", "deliveryTime", "validity",
  ] as const;
  type Line1Key = typeof LINE1_KEYS[number];
  const line1Patch: Partial<Record<Line1Key, string | null>> = {};
  for (const k of LINE1_KEYS) {
    const val = (patch as Record<string, unknown>)[k];
    if (val !== undefined) {
      line1Patch[k] = val === null ? null : String(val);
    }
  }
  if (Object.keys(line1Patch).length > 0) {
    try {
      await db
        .update(quotationItems)
        .set({ ...line1Patch, updatedAt: new Date() })
        .where(
          and(
            eq(quotationItems.quotationId, id),
            eq(quotationItems.sortOrder, 0),
          ),
        );
    } catch (err) {
      // Non-fatal: the main quotation row was already saved.
      console.error("[updateQuotation] line-1 sync failed", err);
    }
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

export async function setQuotationStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid quotation id." };
  const parsed = SetQuotationStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  try {
    await db
      .update(quotations)
      .set({ costingDoneStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(quotations.id, id));
  } catch (err) {
    console.error("[setQuotationStatus] failed", err);
    return { ok: false, error: "Could not update the status. Please try again." };
  }
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

/** Bulk-set the costing-done status over the selected quotation rows. */
export async function setQuotationStatusBulk(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid quotation id." };
  if (!(COSTING_DONE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  try {
    await db
      .update(quotations)
      .set({ costingDoneStatus: status as CostingDoneStatus, updatedAt: new Date() })
      .where(inArray(quotations.id, ids));
  } catch (err) {
    console.error("[setQuotationStatusBulk] failed", err);
    return { ok: false, error: "Could not update the statuses. Please try again." };
  }
  revalidatePath("/quotations");
  return { ok: true };
}
