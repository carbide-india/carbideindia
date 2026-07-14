"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { negotiations, negotiationItems, type NewNegotiation } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { negotiationLineRows, negotiationLineInsert } from "@/lib/negotiations/line-rows";
import {
  getQuoteAutofill,
  getQuotationAutofill,
  getInquiryItemSeeds,
  type QuoteLineSeed,
} from "@/lib/queries/quotes";
import { NEGOTIATION_STATUSES, type NegotiationStatus } from "@/db/enums";
import {
  CreateNegotiationSchema,
  UpdateNegotiationSchema,
  SetNegotiationStatusSchema,
  type CreateNegotiationInput,
  type UpdateNegotiationInput,
} from "@/lib/validators/negotiation";

/**
 * Negotiation server actions - Phase 4 write path. No audit logging (same
 * deferred call as the sample/quotation actions).
 */

/**
 * Negotiation line seeds for the form per-line editor -- one per
 * inquiry_items row of the picked SM, ordered by sort order.  Called
 * client-side on SM select to pre-fill the lines (product name + qty);
 * pricing stays blank for the user to fill.  Delegates to the shared
 * getInquiryItemSeeds query used by the quote form.
 */
export async function getInquiryItemsForNegotiation(
  inquiryId: string,
): Promise<QuoteLineSeed[]> {
  await requireUser();
  if (!isUuid(inquiryId)) return [];
  return getInquiryItemSeeds(inquiryId);
}

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

  // Build per-line rows first so line #1 can mirror into the legacy columns.
  const lineRows = negotiationLineRows(v);
  const line0 = lineRows[0];

  const values: Omit<NewNegotiation, "negotiationNo"> = {
    inquiryId: v.inquiryId,
    quotationId: v.quotationId,
    // snapshot from the SM
    companyName: auto.companyName,
    enquiryDate: auto.enquiryDate,
    salesPersonId: auto.salesPersonId,
    // per-line legacy mirror - sourced from line #1
    custProductName: line0?.custProductName ?? v.custProductName ?? auto.productDescription,
    qty: line0?.qty ?? (v.qty != null ? String(v.qty) : auto.quantityNos),
    partNo: line0?.partNo ?? quote?.partNo ?? undefined,
    finalCost: line0?.finalCost ?? quote?.finalCost ?? undefined,
    negotiation: line0?.negotiation ?? money(v.negotiation),
    quotePrice: line0?.quotePrice ?? quote?.quotePrice ?? undefined,
    developmentTime: line0?.developmentTime ?? quote?.developmentTime ?? undefined,
    deliveryTime: line0?.deliveryTime ?? quote?.deliveryTime ?? undefined,
    validity: line0?.validity ?? quote?.validity ?? undefined,
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
      const row = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(negotiations)
          .values({ ...values, negotiationNo })
          .returning({ id: negotiations.id });
        if (!r) throw new Error("negotiations insert returned no row");
        if (lineRows.length) {
          // Only the KEPT line columns - spec/customer-ask mirrors are dropped
          // (migration 0036); spec reads through items via item_id.
          await tx
            .insert(negotiationItems)
            .values(lineRows.map((x) => ({ negotiationId: r.id, ...negotiationLineInsert(x) })));
        }
        return r;
      });
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
    error: "Could not allocate a unique negotiation number - enter one manually.",
  };
}

type SyncResult =
  | { ok: true; added: number }
  | { ok: false; error: string };

/**
 * Append products that were added to the linked enquiry AFTER this negotiation
 * was created. Negotiations snapshot their lines at creation, so a later-added
 * product is otherwise stranded. This inserts ONLY the missing lines (matched
 * by inquiryItemId) and never touches existing ones. User-triggered; never
 * auto-runs.
 */
export async function syncProductsFromEnquiry(
  recordId: string,
): Promise<SyncResult> {
  await requireUser();
  if (!isUuid(recordId)) return { ok: false, error: "Invalid negotiation id." };

  try {
    const [record] = await db
      .select({ id: negotiations.id, inquiryId: negotiations.inquiryId })
      .from(negotiations)
      .where(eq(negotiations.id, recordId))
      .limit(1);
    if (!record) return { ok: false, error: "Negotiation not found." };
    if (!record.inquiryId) {
      return { ok: false, error: "This record isn't linked to an enquiry." };
    }

    const seeds = await getInquiryItemSeeds(record.inquiryId);

    const existing = await db
      .select({
        inquiryItemId: negotiationItems.inquiryItemId,
        sortOrder: negotiationItems.sortOrder,
      })
      .from(negotiationItems)
      .where(eq(negotiationItems.negotiationId, recordId));

    const present = new Set(
      existing
        .map((r) => r.inquiryItemId)
        .filter((v): v is string => v !== null),
    );
    const missing = seeds.filter((s) => !present.has(s.inquiryItemId));
    if (missing.length === 0) return { ok: true, added: 0 };

    const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    // Only the KEPT line columns - the spec/customer-ask mirror is dropped
    // (migration 0036); it reads through items/inquiry_item downstream.
    const rows = missing.map((s, i) => ({
      negotiationId: recordId,
      inquiryItemId: s.inquiryItemId,
      itemId: s.itemId,
      sortOrder: maxSort + 1 + i,
      qty: s.qty,
      finalCost: s.finalCost,
    }));
    await db.insert(negotiationItems).values(rows);

    revalidatePath("/negotiations");
    revalidatePath(`/negotiations/${recordId}`);
    return { ok: true, added: missing.length };
  } catch (err) {
    console.error("[syncProductsFromEnquiry:negotiation] failed", err);
    return { ok: false, error: "Could not add the products. Please try again." };
  }
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

  // Mirror line-#1 per-line subset into negotiation_items (sortOrder = 0). Only
  // the KEPT transactional columns - the spec/customer-ask mirrors (custProductName,
  // partNo) are dropped (migration 0036) and read through items/inquiry_item.
  const LINE1_KEYS = [
    "qty",
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
        .update(negotiationItems)
        .set({ ...line1Patch, updatedAt: new Date() })
        .where(
          and(
            eq(negotiationItems.negotiationId, id),
            eq(negotiationItems.sortOrder, 0),
          ),
        );
    } catch (err) {
      console.error("[updateNegotiation] line-1 sync failed", err);
    }
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

/** Bulk-set the negotiation status over the selected rows. */
export async function setNegotiationStatusBulk(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid negotiation id." };
  if (!(NEGOTIATION_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  try {
    await db
      .update(negotiations)
      .set({ negotiationStatus: status as NegotiationStatus, updatedAt: new Date() })
      .where(inArray(negotiations.id, ids));
  } catch (err) {
    console.error("[setNegotiationStatusBulk] failed", err);
    return { ok: false, error: "Could not update the statuses. Please try again." };
  }
  revalidatePath("/negotiations");
  return { ok: true };
}
