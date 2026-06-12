"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { negotiations, type NewNegotiation } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { getQuoteAutofill, getQuotationAutofill } from "@/lib/queries/quotes";
import {
  CreateNegotiationSchema,
  UpdateNegotiationSchema,
  SetNegotiationStatusSchema,
  type CreateNegotiationInput,
  type UpdateNegotiationInput,
} from "@/lib/validators/negotiation";

/**
 * Negotiation server actions — Phase 4 write path. No audit logging (same
 * deferred call as the sample/quotation actions).
 */

type ActionResult =
  | { ok: true; id?: string; negotiationNo?: string }
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

export async function createNegotiation(
  input: CreateNegotiationInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = CreateNegotiationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const auto = await getQuoteAutofill(v.inquiryId);
  if (!auto) return { ok: false, error: "Linked enquiry not found." };

  // Optional linked quotation prefills price/timeline/link for any field the
  // form left unset.
  const quote = v.quotationId ? await getQuotationAutofill(v.quotationId) : null;

  let existingCount = 0;
  if (!v.negotiationNo) {
    try {
      const [cnt] = await db
        .select({ n: count() })
        .from(negotiations)
        .where(eq(negotiations.inquiryId, v.inquiryId));
      existingCount = Number(cnt?.n ?? 0);
    } catch (err) {
      console.error("[createNegotiation] count failed", err);
      return { ok: false, error: "Could not create the negotiation. Please try again." };
    }
  }

  const money = (n: number | undefined): string | undefined =>
    n !== undefined ? String(n) : undefined;

  const values: Omit<NewNegotiation, "negotiationNo"> = {
    inquiryId: v.inquiryId,
    quotationId: v.quotationId,
    // snapshot from the SM
    companyName: auto.companyName,
    enquiryDate: auto.enquiryDate,
    salesPersonId: auto.salesPersonId,
    custProductName: v.custProductName ?? auto.productDescription,
    qty: v.qty != null ? String(v.qty) : auto.quantityNos,
    partNo: v.partNo ?? quote?.partNo ?? undefined,
    finalCost: money(v.finalCost) ?? quote?.finalCost ?? undefined,
    negotiation: money(v.negotiation),
    quotePrice: money(v.quotePrice) ?? quote?.quotePrice ?? undefined,
    developmentTime: v.developmentTime ?? quote?.developmentTime ?? undefined,
    deliveryTime: v.deliveryTime ?? quote?.deliveryTime ?? undefined,
    validity: v.validity ?? quote?.validity ?? undefined,
    quotationLink: v.quotationLink ?? quote?.quotationLink ?? undefined,
    negotiationStatus: v.negotiationStatus,
    negotiationNotes: v.negotiationNotes,
    createdById: me.id,
  };

  const tries = v.negotiationNo ? 1 : MAX_NO_TRIES;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const negotiationNo =
      v.negotiationNo ??
      `${auto.smNumber}-N${String(existingCount + attempt).padStart(2, "0")}`;
    try {
      const [row] = await db
        .insert(negotiations)
        .values({ ...values, negotiationNo })
        .returning({ id: negotiations.id });
      if (!row) return { ok: false, error: "Insert returned no row" };
      revalidatePath("/negotiations");
      return { ok: true, id: row.id, negotiationNo };
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string };
      if (
        e?.code === "23505" &&
        e?.constraint === "negotiations_negotiation_no_unique"
      ) {
        if (v.negotiationNo) {
          return { ok: false, error: "A negotiation with this number already exists." };
        }
        continue;
      }
      console.error("[createNegotiation] failed", err);
      return { ok: false, error: "Could not create the negotiation. Please try again." };
    }
  }
  return {
    ok: false,
    error: "Could not allocate a unique negotiation number — enter one manually.",
  };
}

export async function updateNegotiation(
  id: string,
  input: UpdateNegotiationInput,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid negotiation id." };
  const parsed = UpdateNegotiationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = stripUndefined(parsed.data);
  if (Object.keys(v).length === 0) return { ok: true };

  const { finalCost, negotiation, quotePrice, qty, ...rest } = v;
  const patch: Partial<NewNegotiation> = { ...rest };
  if (finalCost !== undefined) patch.finalCost = String(finalCost);
  if (negotiation !== undefined) patch.negotiation = String(negotiation);
  if (quotePrice !== undefined) patch.quotePrice = String(quotePrice);
  if (qty !== undefined) patch.qty = String(qty);

  try {
    await db
      .update(negotiations)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(negotiations.id, id));
  } catch (err) {
    console.error("[updateNegotiation] failed", err);
    return { ok: false, error: "Could not save the negotiation. Please try again." };
  }
  revalidatePath("/negotiations");
  revalidatePath(`/negotiations/${id}`);
  return { ok: true };
}

export async function setNegotiationStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid negotiation id." };
  const parsed = SetNegotiationStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  try {
    await db
      .update(negotiations)
      .set({ negotiationStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(negotiations.id, id));
  } catch (err) {
    console.error("[setNegotiationStatus] failed", err);
    return { ok: false, error: "Could not update the status. Please try again." };
  }
  revalidatePath("/negotiations");
  revalidatePath(`/negotiations/${id}`);
  return { ok: true };
}
