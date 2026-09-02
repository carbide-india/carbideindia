"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { costings, quotations, quotationItems, type NewQuotation } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { reviseCosting } from "@/app/(app)/costings/actions";

/**
 * Sending work BACK — the two revise paths out of the Quotation stage.
 *
 * Neither edits what was already approved (or already sent). Both FREEZE the
 * current record and open a fresh revision, exactly as costings have always
 * done, because the price you actually quoted has to stay readable after you
 * re-quote: `quote_sent_to` on the superseded row is the record of who saw it.
 *
 * They live in their own module rather than in actions.ts because that file
 * already imports from the costing module, and importing back the other way
 * would close a cycle.
 */

const ReviseSchema = z.object({
  quotationId: z.string().uuid("Invalid quotation id."),
  reason: z
    .string()
    .trim()
    .min(3, "Say why this is going back.")
    .max(2000, "Reason is too long."),
});

export type ReviseInput = z.infer<typeof ReviseSchema>;

/**
 * "Revise Costing" — send the quotation's cost basis back to the Costing stage.
 *
 * Opens a NEW costing revision per product line on the quote (each existing
 * approved costing stays frozen and readable), stamped with this quotation as
 * its origin so the Costing register can say who sent it back and why. The
 * quotation itself drops to Need Info: its price is not trustworthy until the
 * costing returns.
 */
export async function reviseCostingFromQuotation(
  input: ReviseInput,
): Promise<
  { ok: true; revised: number; skipped: number } | { ok: false; error: string }
> {
  await requireUser();
  const parsed = ReviseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const [quotation] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(eq(quotations.id, v.quotationId))
    .limit(1);
  if (!quotation) return { ok: false, error: "Quotation not found." };

  const lines = await db
    .select({ inquiryItemId: quotationItems.inquiryItemId })
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, v.quotationId));
  const itemIds = lines
    .map((l) => l.inquiryItemId)
    .filter((id): id is string => id !== null);
  if (itemIds.length === 0) {
    return { ok: false, error: "This quotation has no product lines to send back." };
  }

  const chosen = await db
    .select({ id: costings.id })
    .from(costings)
    .where(and(inArray(costings.inquiryItemId, itemIds), eq(costings.isChosen, true)));
  if (chosen.length === 0) {
    return {
      ok: false,
      error: "No approved costing behind this quotation — there is nothing to revise.",
    };
  }

  let revised = 0;
  let skipped = 0;
  for (const c of chosen) {
    const res = await reviseCosting({
      costingId: c.id,
      reason: v.reason,
      quotationId: v.quotationId,
    });
    if (res.ok) revised += 1;
    else skipped += 1;
  }
  if (revised === 0) {
    return { ok: false, error: "Could not open a costing revision for any line." };
  }

  // The quote's basis is in flight, so the quote is no longer sound.
  await db
    .update(quotations)
    .set({
      quotationStatus: "need_info",
      revisionReason: v.reason,
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, v.quotationId));

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${v.quotationId}`);
  revalidatePath("/costings");
  return { ok: true, revised, skipped };
}

/**
 * "Revise Quotation" — freeze this quote and open the next revision of it.
 *
 * The superseded row keeps its price, its sent flag and its recipient list, so
 * "what did we actually quote them, and who saw it" survives the re-quote. The
 * copy starts as an UNSENT draft: a revision that inherited `quote_sent = true`
 * would claim a send that never happened.
 */
export async function reviseQuotation(
  input: ReviseInput,
): Promise<{ ok: true; id: string; revisionNo: number } | { ok: false; error: string }> {
  const me = await requireUser();
  const parsed = ReviseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  try {
    const created = await db.transaction(async (tx) => {
      const [src] = await tx
        .select()
        .from(quotations)
        .where(eq(quotations.id, v.quotationId))
        .limit(1);
      if (!src) throw new Error("not-found");

      // Chain-local numbering: the next revision is one past the row being
      // revised (always the latest of its OWN chain — the Revise button is
      // disabled on superseded rows). Counting enquiry-wide would let a separate
      // quote (Q02) inflate another's (Q01) revision number.
      const revisionNo = src.revisionNo + 1;

      // Only the row we are superseding stops being the latest — NOT the other
      // quotes (Q01, Q03…) of the same enquiry.
      await tx
        .update(quotations)
        .set({ isLatestRevision: false })
        .where(eq(quotations.id, src.id));

      const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        quoteNo: _quoteNo,
        ...carried
      } = src;

      // Build the revision number off the ORIGINAL quote number, not the
      // previous revision's — otherwise the -R suffix accumulates
      // (Q02 → Q02-R1 → Q02-R1-R2 …). Strip any trailing -R<n> group(s) to get
      // the base, then append the single current revision suffix.
      const baseQuoteNo = src.quoteNo.replace(/(?:-R\d+)+$/i, "");

      const values: NewQuotation = {
        ...carried,
        // Revisions keep the original number with ONE -R suffix. The FIRST
        // revision is R1: the original's revisionNo is 1, so the first revision
        // (revisionNo 2) → -R1, the next (3) → -R2, etc.
        quoteNo: `${baseQuoteNo}-R${revisionNo - 1}`,
        revisionNo,
        supersedesQuotationId: src.id,
        isLatestRevision: true,
        revisionReason: v.reason,
        quotationStatus: "draft",
        quoteSent: false,
        quoteSentAt: null,
        quoteSentById: null,
        quoteSentTo: null,
        createdById: me.id,
      };

      const [row] = await tx
        .insert(quotations)
        .values(values)
        .returning({ id: quotations.id });
      if (!row) throw new Error("insert-failed");

      // Carry the product lines over — a revision without its lines is empty.
      const srcLines = await tx
        .select()
        .from(quotationItems)
        .where(eq(quotationItems.quotationId, src.id));
      if (srcLines.length > 0) {
        await tx.insert(quotationItems).values(
          srcLines.map(({ id: _lineId, quotationId: _q, ...line }) => ({
            ...line,
            quotationId: row.id,
          })),
        );
      }
      return { id: row.id, revisionNo };
    });

    revalidatePath("/quotations");
    revalidatePath(`/quotations/${v.quotationId}`);
    return { ok: true, id: created.id, revisionNo: created.revisionNo };
  } catch (err) {
    console.error("[reviseQuotation]", err);
    return { ok: false, error: "Could not open a quotation revision. Please try again." };
  }
}
