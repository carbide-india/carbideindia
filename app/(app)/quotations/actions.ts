"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  quotations,
  quotationItems,
  negotiations,
  salesOrders,
  inquiries,
  type NewQuotation,
} from "@/db/schema";
import { siteUrl } from "@/lib/site-url";
import {
  resolveRecipients,
  sendQuotationEmail,
} from "@/lib/email/send-quotation";
import {
  loadLogo,
  renderQuotationPdf,
} from "@/app/(app)/quotations/[id]/quotation.pdf/route";
import { requireUser } from "@/lib/auth/current";
import { approvalRefusal } from "@/lib/approval/gate";
import {
  getQuoteAutofill,
  getInquiryItemSeeds,
  type QuoteLineSeed,
} from "@/lib/queries/quotes";
import {
  COSTING_DONE_STATUSES,
  QUOTATION_STATUSES,
  type CostingDoneStatus,
  type QuotationStatus,
} from "@/db/enums";
import { getChosenCostingLocksForItems } from "@/lib/queries/costings";
import {
  CreateQuotationSchema,
  UpdateQuotationSchema,
  SetQuotationStatusSchema,
  type CreateQuotationInput,
  type UpdateQuotationInput,
} from "@/lib/validators/quotation";
import { quoteLineRows, quoteLineInsert } from "@/lib/quotations/line-rows";

/**
 * Quotation (Quote Master) server actions - Phase 4 write path.
 *
 * NOTE on audit logging: there is intentionally none here, same deferred call
 * as the sample/inquiry actions - `task_events`/`settings_events` don't fit
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
 * Quote-line seeds for the form's per-line editor - one per `inquiry_items`
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

/**
 * Options for createQuotation.
 * - `enforceCostingGate` (default true): require every quoted product line to
 *   have an admin-approved + locked chosen costing before the quote can be
 *   created (Phase 5 hard-gate). The legacy bulk importer of historical
 *   quote-master rows passes `false` - those rows predate the costing-lock
 *   workflow and carry no per-line inquiry_item link to gate against.
 * - `initialStatus` (default "draft"): the house bucket the new quotation lands
 *   in. A quotation created here always carries lines priced off an approved &
 *   locked costing, so it IS a draft - not "Not Started". The legacy importer
 *   passes "not_started" because a historical row's real stage is not knowable
 *   from the spreadsheet.
 */
export interface CreateQuotationOptions {
  enforceCostingGate?: boolean;
  initialStatus?: QuotationStatus;
}

export async function createQuotation(
  input: CreateQuotationInput,
  opts: CreateQuotationOptions = {},
): Promise<ActionResult> {
  const { enforceCostingGate = true, initialStatus = "draft" } = opts;
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
  const rawLineRows = quoteLineRows(v);

  // ── Phase 5 HARD-GATE + authoritative cost basis ─────────────────────────
  // Every product line being quoted must have an admin-approved + LOCKED chosen
  // costing on its inquiry_item. We reject the whole action (naming the
  // offending line(s)) if any line lacks one. For lines that pass, the per-piece
  // cost basis (`finalCost`) is sourced SERVER-SIDE from the locked
  // `finalUnitCost` - never from the client-sent value. Selling-side fields
  // (quotePrice / negotiation) keep whatever margin the client layered on top.
  let lineRows = rawLineRows;
  if (enforceCostingGate) {
    const gateIds = rawLineRows
      .map((l) => l.inquiryItemId)
      .filter((id): id is string => id !== null);
    const locks = await getChosenCostingLocksForItems(gateIds);

    const offending: string[] = [];
    lineRows = rawLineRows.map((l, i) => {
      const name =
        l.custProductName ?? auto.productDescription ?? `Line ${i + 1}`;
      const lock = l.inquiryItemId ? locks.get(l.inquiryItemId) : undefined;
      if (!lock || !lock.isLocked || lock.finalUnitCost == null) {
        offending.push(name);
        return l;
      }
      // Authoritative: seed the cost basis from the locked approved unit cost.
      return { ...l, finalCost: lock.finalUnitCost };
    });

    if (offending.length > 0) {
      const named = offending.map((n) => `"${n}"`).join(", ");
      const isOne = offending.length === 1;
      return {
        ok: false,
        error: `${named} ${isOne ? "has" : "have"} no approved & locked costing - approve ${isOne ? "its" : "their"} costing before quoting.`,
      };
    }
  }

  const line0 = lineRows[0];

  const values: Omit<NewQuotation, "quoteNo"> = {
    inquiryId: v.inquiryId,
    // snapshot from the SM (header - never per-line)
    companyName: auto.companyName,
    enquiryDate: auto.enquiryDate,
    // per-line legacy mirror - sourced from line #1
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
    quotationStatus: initialStatus,
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
          // Insert only the KEPT line columns - the spec/customer-ask mirrors are
          // dropped (migration 0036); spec reads through items via item_id.
          await tx
            .insert(quotationItems)
            .values(lineRows.map((x) => ({ quotationId: r.id, ...quoteLineInsert(x) })));
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
    error: "Could not allocate a unique quote number - enter one manually.",
  };
}

type SyncResult =
  | { ok: true; added: number }
  | { ok: false; error: string };

/**
 * Append products that were added to the linked enquiry AFTER this quotation
 * was created. Quotations snapshot their lines at creation, so a later-added
 * product is otherwise stranded. This inserts ONLY the missing lines (matched
 * by inquiryItemId) and never touches existing ones - a sent quote with edited
 * prices stays intact. User-triggered; never auto-runs.
 */
export async function syncProductsFromEnquiry(
  recordId: string,
): Promise<SyncResult> {
  await requireUser();
  if (!isUuid(recordId)) return { ok: false, error: "Invalid quotation id." };

  try {
    const [record] = await db
      .select({ id: quotations.id, inquiryId: quotations.inquiryId })
      .from(quotations)
      .where(eq(quotations.id, recordId))
      .limit(1);
    if (!record) return { ok: false, error: "Quotation not found." };
    if (!record.inquiryId) {
      return { ok: false, error: "This record isn't linked to an enquiry." };
    }

    const seeds = await getInquiryItemSeeds(record.inquiryId);

    const existing = await db
      .select({
        inquiryItemId: quotationItems.inquiryItemId,
        sortOrder: quotationItems.sortOrder,
      })
      .from(quotationItems)
      .where(eq(quotationItems.quotationId, recordId));

    const present = new Set(
      existing
        .map((r) => r.inquiryItemId)
        .filter((v): v is string => v !== null),
    );
    const missing = seeds.filter((s) => !present.has(s.inquiryItemId));
    if (missing.length === 0) return { ok: true, added: 0 };

    const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    // Only the KEPT line columns - spec/customer-ask mirrors are dropped
    // (migration 0036); they read through items/inquiry_item downstream.
    const rows = missing.map((s, i) => ({
      quotationId: recordId,
      inquiryItemId: s.inquiryItemId,
      itemId: s.itemId,
      sortOrder: maxSort + 1 + i,
      qty: s.qty,
      finalCost: s.finalCost,
    }));
    await db.insert(quotationItems).values(rows);

    revalidatePath("/quotations");
    revalidatePath(`/quotations/${recordId}`);
    return { ok: true, added: missing.length };
  } catch (err) {
    console.error("[syncProductsFromEnquiry:quotation] failed", err);
    return { ok: false, error: "Could not add the products. Please try again." };
  }
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

  // Mirror line-#1 per-line subset into quotation_items (sortOrder = 0). Only
  // the KEPT transactional columns - the spec/customer-ask mirrors are dropped
  // (migration 0036) and now read through items/inquiry_item, so they are no
  // longer synced onto the line.
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
  const me = await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid quotation id." };
  const parsed = SetQuotationStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  const refusal = approvalRefusal({ status: parsed.data.status }, me);
  if (refusal) return { ok: false, error: refusal };
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

// ---------------------------------------------------------------------------
// Quotation stage buckets (house vocabulary, 2026-08)
//
// `quotation_status` is THIS stage's own state - distinct from the mirrored
// upstream `costing_done_status` (display of what costing did) and from
// `quote_sent` (a fact about the send). The register dashboard groups and
// counts on it, so these are the only writers.
// ---------------------------------------------------------------------------

/** Validated against the pgEnum's values, so a hostile client can never write
 *  a status Postgres would reject (or one from another stage's vocabulary). */
const SetQuotationBucketSchema = z.object({
  status: z.enum(QUOTATION_STATUSES),
});

/** Set one quotation's house bucket. */
export async function setQuotationBucket(
  id: string,
  status: string,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid quotation id." };
  const parsed = SetQuotationBucketSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  const refusal = approvalRefusal({ status: parsed.data.status }, me);
  if (refusal) return { ok: false, error: refusal };

  try {
    await db
      .update(quotations)
      .set({ quotationStatus: parsed.data.status, updatedAt: new Date() })
      .where(eq(quotations.id, id));
  } catch (err) {
    console.error("[setQuotationBucket] failed", err);
    return { ok: false, error: "Could not update the status. Please try again." };
  }
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

/** Bulk-set the house bucket over the selected quotation rows. */
export async function setQuotationBucketBulk(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid quotation id." };
  const parsed = SetQuotationBucketSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  const refusal = approvalRefusal({ status: parsed.data.status }, me);
  if (refusal) return { ok: false, error: refusal };

  try {
    await db
      .update(quotations)
      .set({ quotationStatus: parsed.data.status, updatedAt: new Date() })
      .where(inArray(quotations.id, ids));
  } catch (err) {
    console.error("[setQuotationBucketBulk] failed", err);
    return { ok: false, error: "Could not update the statuses. Please try again." };
  }
  revalidatePath("/quotations");
  return { ok: true };
}

/**
 * Mark the quote as sent / unsent from the register (the "Not Sent" tile is the
 * queue this empties). Only the boolean moves - the bucket is a separate axis,
 * because "approved" and "sent" are different facts and Manan asked to see both.
 */
export async function setQuotationSentBulk(
  ids: string[],
  sent: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid quotation id." };
  const parsed = z.enum(["yes", "no"]).safeParse(sent);
  if (!parsed.success) return { ok: false, error: "Invalid value" };

  try {
    await db
      .update(quotations)
      .set({ quoteSent: parsed.data === "yes", updatedAt: new Date() })
      .where(inArray(quotations.id, ids));
  } catch (err) {
    console.error("[setQuotationSentBulk] failed", err);
    return { ok: false, error: "Could not update the rows. Please try again." };
  }
  revalidatePath("/quotations");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete (hard) — the Recycle Bin is drafts-only, so quotations have no
// record-level bin: this is a permanent delete, guarded client-side by a
// confirm and here by an FK-safety check.
// ---------------------------------------------------------------------------

/**
 * Count downstream records that would be silently orphaned by deleting this
 * quotation. `negotiations.quotation_id` and `sales_orders.quotation_id` are
 * both ON DELETE SET NULL, so a delete wouldn't fail — it would blank the link
 * on those live records. We refuse instead (same posture as
 * `deleteMasterOption`). `quotation_items` are ON DELETE CASCADE and go
 * automatically, so they aren't counted.
 */
async function countQuotationRefs(id: string): Promise<number> {
  const counts = await Promise.all([
    db.$count(negotiations, eq(negotiations.quotationId, id)),
    db.$count(salesOrders, eq(salesOrders.quotationId, id)),
  ]);
  return counts.reduce((sum, n) => sum + n, 0);
}

const QUOTATION_IN_USE_ERROR =
  "In use by a negotiation / sales order - can't delete.";

/** Hard-delete a single quotation (cascades its line items). Refuses when a
 *  negotiation or sales order was built from it. */
export async function deleteQuotation(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid quotation id." };

  try {
    if ((await countQuotationRefs(id)) > 0) {
      return { ok: false, error: QUOTATION_IN_USE_ERROR };
    }
    await db.delete(quotations).where(eq(quotations.id, id));
  } catch (err) {
    console.error("[deleteQuotation] failed", err);
    return { ok: false, error: "Could not delete the quotation. Please try again." };
  }

  revalidatePath("/quotations");
  return { ok: true };
}

/** Hard-delete the selected quotations, skipping any still referenced by a
 *  negotiation / sales order. Reports how many were deleted vs. in-use. */
export async function deleteQuotationsBulk(
  ids: string[],
): Promise<
  | { ok: true; deleted: number; failed: number }
  | { ok: false; error: string }
> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid quotation id." };

  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      if ((await countQuotationRefs(id)) > 0) {
        failed++;
        continue;
      }
      await db.delete(quotations).where(eq(quotations.id, id));
      deleted++;
    } catch (err) {
      console.error("[deleteQuotationsBulk] failed for", id, err);
      failed++;
    }
  }

  revalidatePath("/quotations");
  return { ok: true, deleted, failed };
}

/** Bulk-set the costing-done status over the selected quotation rows. */
export async function setQuotationStatusBulk(
  ids: string[],
  status: string,
): Promise<ActionResult> {
  const me = await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid quotation id." };
  if (!(COSTING_DONE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  const refusal = approvalRefusal({ status }, me);
  if (refusal) return { ok: false, error: refusal };
  try {
    const updated = await db
      .update(quotations)
      .set({ costingDoneStatus: status as CostingDoneStatus, updatedAt: new Date() })
      .where(inArray(quotations.id, ids))
      .returning({ id: quotations.id });

    if (updated.length === 0) {
      return {
        ok: false,
        error: "Those quotations no longer exist - refresh the register and try again.",
      };
    }
  } catch (err) {
    console.error("[setQuotationStatusBulk] failed", err);
    return { ok: false, error: "Could not update the statuses. Please try again." };
  }
  revalidatePath("/quotations");
  return { ok: true };
}

/**
 * Send the quotation to the customer.
 *
 * Replaces the hand-flipped "Quote Sent" Yes/No, which recorded a claim rather
 * than a send. Here the flag is only ever set BY the send: the PDF is rendered,
 * the mail goes out through Resend, and only then are `quote_sent`, the
 * timestamp, the sender and the exact recipient list stamped. If the mail
 * fails, nothing is written — a quote that says "Sent" and never went is worse
 * than one that says nothing.
 *
 * Any signed-in employee may send (Hetesh, 2026-08-13). Sending is not an
 * approval, so it is not behind the approver flag.
 */
export async function sendQuotation(input: {
  id: string;
  /** Extra addresses typed in the send dialog, on top of the enquiry's. */
  extraTo?: string | null;
  extraCc?: string | null;
  /** Optional covering note shown above the summary in the email. */
  message?: string | null;
}): Promise<
  { ok: true; to: string[]; cc: string[] } | { ok: false; error: string }
> {
  const me = await requireUser();
  if (!isUuid(input.id)) return { ok: false, error: "Invalid quotation id." };

  const [quotation] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, input.id))
    .limit(1);
  if (!quotation) return { ok: false, error: "Quotation not found." };

  // Recipients come from the ENQUIRY, which is where the contact person and the
  // CC list are captured.
  const [enquiry] = await db
    .select({
      contactEmail: inquiries.contactEmail,
      ccEmails: inquiries.ccEmails,
    })
    .from(inquiries)
    .where(eq(inquiries.id, quotation.inquiryId))
    .limit(1);

  const { to, cc } = resolveRecipients({
    contactEmail: enquiry?.contactEmail,
    ccEmails: enquiry?.ccEmails,
    extraTo: input.extraTo,
    extraCc: input.extraCc,
  });
  if (to.length === 0) {
    return {
      ok: false,
      error:
        "No recipient address. Add a contact email on the enquiry, or type one in the To box.",
    };
  }

  const pdf = await renderQuotationPdf(quotation, { logo: await loadLogo(siteUrl()) });

  const sent = await sendQuotationEmail({
    quotation,
    to,
    cc,
    pdf,
    senderName: me.name,
    message: input.message,
  });
  if (!sent.ok) return { ok: false, error: sent.error };

  try {
    await db
      .update(quotations)
      .set({
        quoteSent: true,
        quoteSentAt: new Date(),
        quoteSentById: me.id,
        quoteSentTo: { to, cc },
        updatedAt: new Date(),
      })
      .where(eq(quotations.id, input.id));
  } catch (err) {
    // The mail is already gone; say so rather than reporting a clean failure.
    console.error("[sendQuotation] sent but could not stamp the record", err);
    return {
      ok: false,
      error:
        "The quotation was emailed, but the record could not be updated. Set Quote Sent manually.",
    };
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${input.id}`);
  return { ok: true, to, cc };
}
