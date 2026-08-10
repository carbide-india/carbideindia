"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  negotiations,
  negotiationItems,
  costings,
  proformaInvoices,
  proformaInvoiceItems,
  salesOrders,
  inquiries,
  type NewNegotiation,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isNegotiationApprovedForSo } from "@/lib/negotiations/buckets";
// The revision MODEL is the costing stage's — call into it, never fork it.
import { reviseCosting } from "@/app/(app)/costings/actions";
import { negotiationLineRows, negotiationLineInsert } from "@/lib/negotiations/line-rows";
import {
  getQuoteAutofill,
  getQuotationAutofill,
  getInquiryItemSeeds,
  type QuoteLineSeed,
} from "@/lib/queries/quotes";
import { getNegotiationItems } from "@/lib/queries/negotiations";
import { provisionSalesOrderFromNegotiation } from "@/lib/workflow/provision";
import { NEGOTIATION_STATUSES, NEGOTIATION_STAGES, type NegotiationStatus } from "@/db/enums";
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

// ── Revise-costing loop (2026-08 pipeline review) ───────────────────────────
// "वो नया कॉस्टिंग बनेगा उसका" — when a negotiation is NOT approved the costing
// goes back for a fresh revision. The revision MODEL is the costing stage's
// (revisionNo / supersedesCostingId / isLatestRevision on `costings`); this
// action only starts it from the negotiation side.
//
// Deliberately NOT automatic: whether a not-approved negotiation should spawn a
// revision by itself is an open question for Manan, and an ERP that silently
// forks cost sheets is worse than one that asks. The user picks which cost
// sheets and states why.

const RequestCostingRevisionSchema = z.object({
  negotiationId: z.string().uuid(),
  /** Costing ids to revise — each must be the CURRENT revision of its chain. */
  costingIds: z.array(z.string().uuid()).min(1).max(50),
  reason: z
    .string()
    .trim()
    .min(3, "Say why the costing is being revised.")
    .max(2000),
});

export interface RequestCostingRevisionInput {
  negotiationId: string;
  costingIds: string[];
  reason: string;
}

type RequestRevisionResult =
  | { ok: true; created: number; failed: number; firstError: string | null }
  | { ok: false; error: string };

/**
 * Send the selected cost sheets back for a new costing revision.
 *
 * This is the NEGOTIATION side of the loop only. The revision model itself —
 * revisionNo / supersedesCostingId / isLatestRevision, the vendor-quote matrix
 * copy + re-rank, the approval reset — belongs to the costing stage and is
 * delegated to `reviseCosting` (app/(app)/costings/actions.ts). Nothing about a
 * revision is reimplemented here; what this action owns is the guard that the
 * picked sheets really belong to THIS negotiation's enquiry and are the head of
 * their revision chain, plus the back-link (`revisedFromNegotiationId`).
 *
 * Deliberately NOT automatic: whether a not-approved negotiation should spawn a
 * revision by itself is an open question for Manan, and an ERP that silently
 * forks cost sheets is worse than one that asks. The user picks the sheets and
 * states why. The negotiation's own status is left alone for the same reason.
 *
 * Per-sheet failures (e.g. the costing stage's own feasibility gate) do not
 * abort the whole run: the successes stand and the caller is told how many were
 * skipped and why.
 */
export async function requestCostingRevision(
  input: RequestCostingRevisionInput,
): Promise<RequestRevisionResult> {
  await requireUser();
  const parsed = RequestCostingRevisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { negotiationId, costingIds, reason } = parsed.data;

  let sources: { id: string }[];
  try {
    const [neg] = await db
      .select({ id: negotiations.id, inquiryId: negotiations.inquiryId })
      .from(negotiations)
      .where(eq(negotiations.id, negotiationId))
      .limit(1);
    if (!neg) return { ok: false, error: "Negotiation not found." };

    const ids = [...new Set(costingIds)];
    const rows = await db
      .select({
        id: costings.id,
        inquiryId: costings.inquiryId,
        isLatestRevision: costings.isLatestRevision,
      })
      .from(costings)
      .where(inArray(costings.id, ids));

    if (rows.length !== ids.length) {
      return { ok: false, error: "One of the selected cost sheets no longer exists." };
    }
    // Hostile-client guards: only cost sheets of THIS negotiation's enquiry, and
    // only the head of a revision chain (a superseded row is history).
    if (rows.some((c) => c.inquiryId !== neg.inquiryId)) {
      return { ok: false, error: "That cost sheet doesn't belong to this negotiation." };
    }
    if (rows.some((c) => !c.isLatestRevision)) {
      return {
        ok: false,
        error: "One of the selected cost sheets has already been revised - reload and try again.",
      };
    }
    sources = rows;
  } catch (err) {
    console.error("[requestCostingRevision] lookup failed", err);
    return { ok: false, error: "Could not start the costing revision. Please try again." };
  }

  let created = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const src of sources) {
    const res = await reviseCosting({ costingId: src.id, reason, negotiationId });
    if (res.ok) {
      created++;
    } else {
      failed++;
      firstError ??= res.error;
    }
  }

  if (created === 0) {
    return {
      ok: false,
      error: firstError ?? "Could not start the costing revision. Please try again.",
    };
  }

  revalidatePath("/costings");
  revalidatePath("/negotiations");
  revalidatePath(`/negotiations/${negotiationId}`);
  return { ok: true, created, failed, firstError };
}

// ---------------------------------------------------------------------------
// Delete (hard) — the Recycle Bin is drafts-only and negotiations carry no
// deleted_at / archived flag, so this is a permanent delete, guarded
// client-side by a confirm and here by an FK-safety check.
// ---------------------------------------------------------------------------

/**
 * Count downstream records that a delete would damage.
 *
 * - `proforma_invoices.negotiation_id` is ON DELETE **CASCADE**: deleting the
 *   negotiation would silently destroy every issued PI hanging off it (and, by
 *   the PI's own cascade, its `proforma_invoice_items`) with no FK error to warn
 *   us. This is the whole reason the guard exists.
 * - `sales_orders.negotiation_id` is ON DELETE SET NULL: the SO survives but its
 *   negotiation lineage is silently blanked. We refuse that too (same posture as
 *   `deleteQuotation`).
 *
 * `negotiation_items` is the negotiation's OWN line table (ON DELETE CASCADE),
 * so it goes with the parent by design and is NOT counted — same treatment as
 * `quotation_items` in the quotation reference.
 */
async function countNegotiationRefs(id: string): Promise<number> {
  const counts = await Promise.all([
    db.$count(proformaInvoices, eq(proformaInvoices.negotiationId, id)),
    db.$count(salesOrders, eq(salesOrders.negotiationId, id)),
  ]);
  return counts.reduce((sum, n) => sum + n, 0);
}

const NEGOTIATION_IN_USE_ERROR =
  "In use by a proforma invoice / sales order - can't delete.";

/** Hard-delete a single negotiation (cascades its line items). Refuses when a
 *  proforma invoice was issued from it or a sales order was won off it. */
export async function deleteNegotiation(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid negotiation id." };

  try {
    if ((await countNegotiationRefs(id)) > 0) {
      return { ok: false, error: NEGOTIATION_IN_USE_ERROR };
    }
    await db.delete(negotiations).where(eq(negotiations.id, id));
  } catch (err) {
    console.error("[deleteNegotiation] failed", err);
    return { ok: false, error: "Could not delete the negotiation. Please try again." };
  }

  revalidatePath("/negotiations");
  return { ok: true };
}

/** Hard-delete the selected negotiations, skipping any that already issued a
 *  proforma invoice or fed a sales order. Reports deleted vs. in-use counts so
 *  the caller can tell the user what was actually removed. */
export async function deleteNegotiationsBulk(
  ids: string[],
): Promise<
  | { ok: true; deleted: number; failed: number }
  | { ok: false; error: string }
> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid negotiation id." };

  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      if ((await countNegotiationRefs(id)) > 0) {
        failed++;
        continue;
      }
      await db.delete(negotiations).where(eq(negotiations.id, id));
      deleted++;
    } catch (err) {
      console.error("[deleteNegotiationsBulk] failed for", id, err);
      failed++;
    }
  }

  revalidatePath("/negotiations");
  return { ok: true, deleted, failed };
}

// ── Proforma Invoice pipeline (2026-08-02) ──────────────────────────────────
// A negotiation walks a linear stage: Quote Send → PI Issued → Negotiation
// Awarded → Customer PO Received → (Sales Order). The actions below drive that
// stage, distinct from the day-to-day negotiation_status pill.

/** One line of a proforma invoice — references its source negotiation line. */
export interface IssuePiItemInput {
  negotiationItemId?: string;
  inquiryItemId?: string;
  revisedUnitPrice: number;
  qty: number;
  notes?: string;
}

export interface IssuePiInput {
  negotiationId: string;
  items: IssuePiItemInput[];
  developmentTime?: string;
  deliveryTime?: string;
  validity?: string;
  notes?: string;
}

type PiResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Issue the next Proforma Invoice for a negotiation. Allocates the per-SM PI
 * number `<SM>-PI##` off `piIterationCount`, snapshots the priced lines
 * (revisedLineTotal = revisedUnitPrice × qty; revisedTotal = Σ), sets the stage
 * to `pi_issued` and bumps the iteration counter — all in one transaction.
 */
export async function issueProformaInvoice(
  input: IssuePiInput,
): Promise<PiResult> {
  const me = await requireUser();
  const { negotiationId } = input;
  if (!isUuid(negotiationId)) return { ok: false, error: "Invalid negotiation id." };
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Add at least one line to the proforma invoice." };
  }

  // Negotiation head + its SM number (the PI number prefix).
  const [neg] = await db
    .select({
      id: negotiations.id,
      inquiryId: negotiations.inquiryId,
      quotationId: negotiations.quotationId,
      piIterationCount: negotiations.piIterationCount,
      smNumber: inquiries.smNumber,
    })
    .from(negotiations)
    .leftJoin(inquiries, eq(negotiations.inquiryId, inquiries.id))
    .where(eq(negotiations.id, negotiationId))
    .limit(1);
  if (!neg) return { ok: false, error: "Negotiation not found." };

  // Resolve product name / part no / provenance read-through from the neg lines.
  const negLines = await getNegotiationItems(negotiationId);
  const byNegItem = new Map(negLines.map((l) => [l.id, l]));
  const byInqItem = new Map(
    negLines
      .filter((l) => l.inquiryItemId)
      .map((l) => [l.inquiryItemId as string, l]),
  );

  const toNum = (v: number | undefined | null): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;

  let revisedTotal = 0;
  const lineRows = input.items.map((it, i) => {
    const line =
      (it.negotiationItemId ? byNegItem.get(it.negotiationItemId) : undefined) ??
      (it.inquiryItemId ? byInqItem.get(it.inquiryItemId) : undefined);
    const unit = toNum(it.revisedUnitPrice);
    const qty = toNum(it.qty);
    const lineTotal = unit * qty;
    revisedTotal += lineTotal;
    return {
      negotiationItemId: it.negotiationItemId ?? line?.id ?? null,
      quotationItemId: line?.quotationItemId ?? null,
      inquiryItemId: it.inquiryItemId ?? line?.inquiryItemId ?? null,
      itemId: line?.itemId ?? null,
      sortOrder: line?.sortOrder ?? i,
      custProductName:
        line?.ask.custProductName ??
        line?.spec.gradeNameForCust ??
        line?.spec.itemCode ??
        null,
      partNo: line?.spec.partNo ?? null,
      qty: String(qty),
      revisedUnitPrice: String(unit),
      revisedLineTotal: String(lineTotal),
      notes: it.notes ?? null,
    };
  });

  const sm = neg.smNumber ?? "SM";
  const baseIter = (neg.piIterationCount ?? 0) + 1;

  for (let attempt = 0; attempt < MAX_NO_TRIES; attempt++) {
    const iteration = baseIter + attempt;
    const piNo = `${sm}-PI${String(iteration).padStart(2, "0")}`;
    try {
      const id = await db.transaction(async (tx) => {
        const now = new Date();
        const [head] = await tx
          .insert(proformaInvoices)
          .values({
            negotiationId,
            quotationId: neg.quotationId,
            inquiryId: neg.inquiryId,
            piNo,
            iteration,
            issuedAt: now,
            issuedById: me.id,
            developmentTime: input.developmentTime,
            deliveryTime: input.deliveryTime,
            validity: input.validity,
            revisedTotal: String(revisedTotal),
            notes: input.notes,
            status: "issued",
            createdById: me.id,
          })
          .returning({ id: proformaInvoices.id });
        if (!head) throw new Error("proforma_invoices insert returned no row");
        await tx
          .insert(proformaInvoiceItems)
          .values(lineRows.map((r) => ({ proformaInvoiceId: head.id, ...r })));
        await tx
          .update(negotiations)
          .set({
            negotiationStage: "pi_issued",
            piIterationCount: iteration,
            updatedAt: now,
          })
          .where(eq(negotiations.id, negotiationId));
        return head.id;
      });
      revalidatePath("/negotiations");
      revalidatePath(`/negotiations/${negotiationId}`);
      revalidatePath("/proforma-invoices");
      return { ok: true, id };
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string };
      if (
        e?.code === "23505" &&
        e?.constraint === "proforma_invoices_pi_no_unique"
      ) {
        continue;
      }
      console.error("[issueProformaInvoice] failed", err);
      return { ok: false, error: "Could not issue the proforma invoice. Please try again." };
    }
  }
  return { ok: false, error: "Could not allocate a unique PI number. Please try again." };
}

/**
 * Mark a negotiation awarded (stage → negotiation_awarded). Only allowed once a
 * PI has been issued (stage is pi_issued or later) — you cannot award straight
 * off the quote.
 */
export async function markNegotiationAwarded(
  negotiationId: string,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(negotiationId)) return { ok: false, error: "Invalid negotiation id." };
  try {
    const [neg] = await db
      .select({ stage: negotiations.negotiationStage })
      .from(negotiations)
      .where(eq(negotiations.id, negotiationId))
      .limit(1);
    if (!neg) return { ok: false, error: "Negotiation not found." };
    const minIdx = NEGOTIATION_STAGES.indexOf("pi_issued");
    if (NEGOTIATION_STAGES.indexOf(neg.stage) < minIdx) {
      return {
        ok: false,
        error: "Issue a proforma invoice before marking the negotiation awarded.",
      };
    }
    await db
      .update(negotiations)
      .set({ negotiationStage: "negotiation_awarded", updatedAt: new Date() })
      .where(eq(negotiations.id, negotiationId));
  } catch (err) {
    console.error("[markNegotiationAwarded] failed", err);
    return { ok: false, error: "Could not update the negotiation. Please try again." };
  }
  revalidatePath("/negotiations");
  revalidatePath(`/negotiations/${negotiationId}`);
  return { ok: true };
}

export interface SaveCustomerPoInput {
  negotiationId: string;
  customerPoNo?: string;
  customerPoDate?: string;
  customerPoLink?: string;
  customerPoRemarks?: string;
  /** Optional PO total — when given, reconciled against the latest PI total. */
  poTotal?: number;
}

/**
 * Persist the received customer PO (number / date / link / remarks) and advance
 * the stage to customer_po_received. When a PO total is supplied it is
 * reconciled against the latest PI's revised total → poMatchStatus
 * (matched | mismatch); otherwise 'unchecked'. The Blob upload happens
 * client-side via /api/documents/upload — this only persists the resulting URL.
 */
export async function saveCustomerPo(
  input: SaveCustomerPoInput,
): Promise<ActionResult> {
  await requireUser();
  const { negotiationId } = input;
  if (!isUuid(negotiationId)) return { ok: false, error: "Invalid negotiation id." };
  if (!input.customerPoNo && !input.customerPoLink) {
    return { ok: false, error: "Enter a PO number or attach the PO document." };
  }
  try {
    let poMatchStatus = "unchecked";
    if (typeof input.poTotal === "number" && Number.isFinite(input.poTotal)) {
      const [latestPi] = await db
        .select({ revisedTotal: proformaInvoices.revisedTotal })
        .from(proformaInvoices)
        .where(eq(proformaInvoices.negotiationId, negotiationId))
        .orderBy(desc(proformaInvoices.iteration))
        .limit(1);
      const piTotal = Number(latestPi?.revisedTotal ?? NaN);
      if (Number.isFinite(piTotal)) {
        poMatchStatus =
          Math.abs(piTotal - input.poTotal) < 0.01 ? "matched" : "mismatch";
      }
    }
    const poDate = input.customerPoDate ? new Date(input.customerPoDate) : null;
    await db
      .update(negotiations)
      .set({
        customerPoNo: input.customerPoNo ?? null,
        customerPoDate:
          poDate && !Number.isNaN(poDate.getTime()) ? poDate : null,
        customerPoLink: input.customerPoLink ?? null,
        customerPoRemarks: input.customerPoRemarks ?? null,
        poMatchStatus,
        negotiationStage: "customer_po_received",
        updatedAt: new Date(),
      })
      .where(eq(negotiations.id, negotiationId));
  } catch (err) {
    console.error("[saveCustomerPo] failed", err);
    return { ok: false, error: "Could not save the customer PO. Please try again." };
  }
  revalidatePath("/negotiations");
  revalidatePath(`/negotiations/${negotiationId}`);
  revalidatePath("/proforma-invoices");
  return { ok: true };
}

/**
 * Accept the customer PO and convert the negotiation into a Sales Order. GATE: a
 * customer PO must be present and the stage must be customer_po_received. Reuses
 * the canonical negotiation→SO conversion (provisionSalesOrderFromNegotiation —
 * idempotent, copies the lines by reference, no duplicated freeze logic), carries
 * the customer PO fields onto the SO, stamps systemRemark = "Okay for
 * processing", and marks the negotiation order_won. Returns the sales order id.
 */
export async function acceptAndConvertToSalesOrder(
  negotiationId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await requireUser();
  if (!isUuid(negotiationId)) return { ok: false, error: "Invalid negotiation id." };

  const [neg] = await db
    .select({
      id: negotiations.id,
      inquiryId: negotiations.inquiryId,
      quotationId: negotiations.quotationId,
      stage: negotiations.negotiationStage,
      status: negotiations.negotiationStatus,
      customerPoNo: negotiations.customerPoNo,
      customerPoDate: negotiations.customerPoDate,
      customerPoLink: negotiations.customerPoLink,
      smNumber: inquiries.smNumber,
    })
    .from(negotiations)
    .leftJoin(inquiries, eq(negotiations.inquiryId, inquiries.id))
    .where(eq(negotiations.id, negotiationId))
    .limit(1);
  if (!neg) return { ok: false, error: "Negotiation not found." };

  // GATE: a customer PO must be present and the stage must be at PO received.
  if (!neg.customerPoLink && !neg.customerPoNo) {
    return { ok: false, error: "Record the customer PO before converting to a sales order." };
  }
  if (neg.stage !== "customer_po_received") {
    return { ok: false, error: "The negotiation must be at Customer PO Received to convert." };
  }
  // GATE: an APPROVED negotiation is what enables Issue Sales Order (Manan).
  // `order_won` is accepted as the legacy synonym of `negotiation_approved` —
  // see NEGOTIATION_SO_READY_STATUSES — so already-won rows stay convertible.
  if (!isNegotiationApprovedForSo(neg.status)) {
    return {
      ok: false,
      error: "Approve the negotiation before issuing the sales order.",
    };
  }

  try {
    const soId = await db.transaction(async (tx) => {
      // Reuse the canonical negotiation→SO conversion (idempotent; copies lines
      // by reference — no duplicated freeze logic).
      const prov = await provisionSalesOrderFromNegotiation(tx, {
        negotiationId,
        quotationId: neg.quotationId,
        inquiryId: neg.inquiryId,
        smNumber: neg.smNumber ?? "SM",
        createdById: me.id,
      });
      const now = new Date();
      // Carry the customer PO onto the SO + stamp the processing remark.
      await tx
        .update(salesOrders)
        .set({
          customerPoNo: neg.customerPoNo,
          customerPoDate: neg.customerPoDate,
          customerPoLink: neg.customerPoLink,
          systemRemark: "Okay for processing",
          updatedAt: now,
        })
        .where(eq(salesOrders.id, prov.id));
      // Mark the negotiation won.
      await tx
        .update(negotiations)
        .set({ negotiationStatus: "order_won", updatedAt: now })
        .where(eq(negotiations.id, negotiationId));
      return prov.id;
    });
    revalidatePath("/negotiations");
    revalidatePath(`/negotiations/${negotiationId}`);
    revalidatePath("/sales-orders");
    return { ok: true, id: soId };
  } catch (err) {
    console.error("[acceptAndConvertToSalesOrder] failed", err);
    return { ok: false, error: "Could not convert to a sales order. Please try again." };
  }
}
