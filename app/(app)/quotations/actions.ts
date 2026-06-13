"use server";

import { revalidatePath } from "next/cache";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotations, type NewQuotation } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { getQuoteAutofill } from "@/lib/queries/quotes";
import { COSTING_DONE_STATUSES, type CostingDoneStatus } from "@/db/enums";
import {
  CreateQuotationSchema,
  UpdateQuotationSchema,
  SetQuotationStatusSchema,
  type CreateQuotationInput,
  type UpdateQuotationInput,
} from "@/lib/validators/quotation";

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

  const values: Omit<NewQuotation, "quoteNo"> = {
    inquiryId: v.inquiryId,
    // snapshot from the SM
    companyName: auto.companyName,
    enquiryDate: auto.enquiryDate,
    custProductName: v.custProductName ?? auto.productDescription,
    custDrawingNo: v.custDrawingNo,
    drawingRevisionNo: v.drawingRevisionNo,
    qty: v.qty != null ? String(v.qty) : auto.quantityNos,
    gradeCustomer: v.gradeCustomer ?? auto.gradeName,
    gradeNameForCust: v.gradeNameForCust,
    tolerance: v.tolerance ?? auto.toleranceName,
    condition: v.condition ?? auto.conditionName,
    partNo: v.partNo,
    finalCost: v.finalCost !== undefined ? String(v.finalCost) : undefined,
    negotiation: v.negotiation !== undefined ? String(v.negotiation) : undefined,
    quotePrice: v.quotePrice !== undefined ? String(v.quotePrice) : undefined,
    developmentTime: v.developmentTime,
    deliveryTime: v.deliveryTime,
    validity: v.validity,
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
      const [row] = await db
        .insert(quotations)
        .values({ ...values, quoteNo })
        .returning({ id: quotations.id });
      if (!row) return { ok: false, error: "Insert returned no row" };
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
