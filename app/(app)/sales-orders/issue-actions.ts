"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerPoRevisions, salesOrders, salesOrderItems } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { baseSoNo, revisionSoNo } from "@/lib/sales-orders/revision-no";

/**
 * What happens to a sales order AFTER the deal is won.
 *
 * Four operations, all of them things Manan named directly (Hetesh, 2026-08-13):
 * Attach Client PO, Revise Cust PO, Revise SO, Issue SO. They live together in
 * their own file because they share one idea that the ordinary edit path does
 * not: **an issued order is a promise somebody is already acting on.**
 *
 * That is why none of them overwrite history. Attaching a PO records it;
 * revising it files the old one in `customer_po_revisions` first; revising the
 * SO freezes the issued row and opens a new one at revision+1. The factory may
 * have started cutting against revision 1, and "what did we tell them?" has to
 * stay answerable after we tell them something else.
 *
 * Deliberately NOT gated to Alok. Approval is the negotiation's business; by the
 * time an order exists the commercial decision is made, and blocking the person
 * holding the customer's PO from filing it helps nobody.
 */

type ActionResult = { ok: true; id?: string; soNo?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

/** A date the user typed as yyyy-mm-dd, or nothing. */
const DateInput = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date.");

const PoSchema = z.object({
  salesOrderId: z.string().refine(isUuid, "Invalid sales order."),
  customerPoNo: z.string().trim().min(1, "Enter the customer's PO number.").max(120),
  customerPoDate: DateInput,
  /** A link to the PO document. The upload itself goes browser→Blob; this
   *  records where it landed. */
  customerPoLink: z.string().trim().max(2000).optional(),
});

/**
 * Attach Client PO — record the purchase order the customer sent.
 *
 * Refuses to overwrite a PO that is already attached: that is Revise Cust PO,
 * which keeps the old one. Getting here twice by accident should not silently
 * lose the first PO number.
 */
export async function attachCustomerPo(
  input: z.input<typeof PoSchema>,
): Promise<ActionResult> {
  await requireUser();
  const parsed = PoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const [current] = await db
    .select({ poNo: salesOrders.customerPoNo })
    .from(salesOrders)
    .where(eq(salesOrders.id, v.salesOrderId))
    .limit(1);
  if (!current) return { ok: false, error: "Sales order not found." };
  if (current.poNo) {
    return {
      ok: false,
      error: `PO ${current.poNo} is already attached. Use Revise Cust PO to replace it.`,
    };
  }

  try {
    await db
      .update(salesOrders)
      .set({
        customerPoNo: v.customerPoNo,
        customerPoDate: v.customerPoDate,
        customerPoLink: v.customerPoLink?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, v.salesOrderId));
  } catch (err) {
    console.error("[attachCustomerPo]", err);
    return { ok: false, error: "Could not attach the PO. Please try again." };
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${v.salesOrderId}`);
  return { ok: true, id: v.salesOrderId };
}

const RevisePoSchema = PoSchema.extend({
  reason: z.string().trim().min(3, "Say what changed on the PO.").max(2000),
});

/**
 * Revise Cust PO — the customer sent a replacement.
 *
 * The PO currently on the order is filed in `customer_po_revisions` (append-only
 * at the database level) before the new one lands, so the terms we originally
 * accepted stay readable. A reason is compulsory: a PO that changed for reasons
 * nobody wrote down is the one that later turns into an argument.
 */
export async function reviseCustomerPo(
  input: z.input<typeof RevisePoSchema>,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = RevisePoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const [current] = await db
    .select({
      poNo: salesOrders.customerPoNo,
      poDate: salesOrders.customerPoDate,
      poLink: salesOrders.customerPoLink,
      revisionNo: salesOrders.customerPoRevisionNo,
    })
    .from(salesOrders)
    .where(eq(salesOrders.id, v.salesOrderId))
    .limit(1);
  if (!current) return { ok: false, error: "Sales order not found." };
  if (!current.poNo) {
    return { ok: false, error: "No PO is attached yet — use Attach Client PO." };
  }

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(customerPoRevisions).values({
        salesOrderId: v.salesOrderId,
        revisionNo: current.revisionNo,
        customerPoNo: current.poNo,
        customerPoDate: current.poDate,
        customerPoLink: current.poLink,
        reason: v.reason,
        supersededById: me.id,
        supersededAt: now,
      });
      await tx
        .update(salesOrders)
        .set({
          customerPoNo: v.customerPoNo,
          customerPoDate: v.customerPoDate,
          customerPoLink: v.customerPoLink?.trim() || null,
          customerPoRevisionNo: current.revisionNo + 1,
          updatedAt: now,
        })
        .where(eq(salesOrders.id, v.salesOrderId));
    });
  } catch (err) {
    console.error("[reviseCustomerPo]", err);
    return { ok: false, error: "Could not revise the PO. Please try again." };
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${v.salesOrderId}`);
  return { ok: true, id: v.salesOrderId };
}

const ReviseSoSchema = z.object({
  salesOrderId: z.string().refine(isUuid, "Invalid sales order."),
  reason: z.string().trim().min(3, "Say why the order is being revised.").max(2000),
});

/**
 * Revise SO — freeze the current order and open the next revision.
 *
 * The same shape Revise Quotation uses: the existing row keeps its number, its
 * issued flags and everything the factory and the customer were given, and stops
 * being the latest. The new row is a copy at `-R<n>`, issued to nobody yet —
 * inheriting "already sent to production" would be a lie about a document that
 * has not been printed, let alone delivered.
 */
export async function reviseSalesOrder(
  input: z.infer<typeof ReviseSoSchema>,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = ReviseSoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const [current] = await db
    .select()
    .from(salesOrders)
    .where(eq(salesOrders.id, v.salesOrderId))
    .limit(1);
  if (!current) return { ok: false, error: "Sales order not found." };
  if (!current.isLatestRevision) {
    return {
      ok: false,
      error: "This revision has already been superseded — open the latest one.",
    };
  }

  // Base the suffix on the highest revision this order has ever reached, not on
  // the row in hand: two people revising at once must not both mint -R2.
  const baseNo = baseSoNo(current.soNo);
  const [top] = await db
    .select({ n: sql<number>`coalesce(max(${salesOrders.revisionNo}), 1)::int` })
    .from(salesOrders)
    .where(
      and(
        eq(salesOrders.inquiryId, current.inquiryId),
        sql`${salesOrders.soNo} like ${`${baseNo}%`}`,
      ),
    );
  const nextNo = (top?.n ?? current.revisionNo) + 1;

  const lines = await db
    .select()
    .from(salesOrderItems)
    .where(eq(salesOrderItems.salesOrderId, current.id))
    .orderBy(salesOrderItems.sortOrder);

  const now = new Date();
  let newId: string | null = null;
  const newSoNo = revisionSoNo(baseNo, nextNo);
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(salesOrders)
        .values({
          ...current,
          id: undefined,
          soNo: newSoNo,
          revisionNo: nextNo,
          supersedesSalesOrderId: current.id,
          isLatestRevision: true,
          revisionReason: v.reason,
          // A fresh revision has been issued to nobody.
          customerSoSent: false,
          customerSoSentAt: null,
          customerSoSentById: null,
          productionSoSent: false,
          productionSoSentAt: null,
          productionSoSentById: null,
          salesOrderStatus: "draft",
          createdById: me.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: salesOrders.id });
      if (!row) throw new Error("insert returned no row");
      newId = row.id;

      if (lines.length > 0) {
        await tx.insert(salesOrderItems).values(
          lines.map((l) => ({ ...l, id: undefined, salesOrderId: row.id })),
        );
      }

      await tx
        .update(salesOrders)
        .set({ isLatestRevision: false, updatedAt: now })
        .where(eq(salesOrders.id, current.id));
    });
  } catch (err) {
    console.error("[reviseSalesOrder]", err);
    return { ok: false, error: "Could not open a revision. Please try again." };
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${current.id}`);
  if (newId) revalidatePath(`/sales-orders/${newId}`);
  return { ok: true, id: newId ?? undefined, soNo: newSoNo };
}

const IssueSchema = z.object({
  salesOrderId: z.string().refine(isUuid, "Invalid sales order."),
  /** Which copy is going out. They are independent — production usually first. */
  to: z.enum(["production", "customer"]),
});

/**
 * Issue SO — hand a copy over, and record that it went.
 *
 * Production and Customer are separate on purpose (Hetesh: "Show SO Issued to
 * Production. Show SO Issued to Cust separately"): the factory copy usually goes
 * first and carries internal detail the customer never sees, so one combined
 * "issued" flag would answer the wrong question for both readers.
 *
 * Refuses without a customer PO. Issuing an order to the floor before the
 * customer has actually ordered it is the expensive mistake this guard exists
 * to prevent.
 */
export async function issueSalesOrder(
  input: z.infer<typeof IssueSchema>,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = IssueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  const [current] = await db
    .select({
      poNo: salesOrders.customerPoNo,
      isLatest: salesOrders.isLatestRevision,
      customerSent: salesOrders.customerSoSent,
      productionSent: salesOrders.productionSoSent,
    })
    .from(salesOrders)
    .where(eq(salesOrders.id, v.salesOrderId))
    .limit(1);
  if (!current) return { ok: false, error: "Sales order not found." };
  if (!current.poNo) {
    return { ok: false, error: "Attach the client PO before issuing this order." };
  }
  if (!current.isLatest) {
    return { ok: false, error: "This revision has been superseded — issue the latest one." };
  }
  const already = v.to === "production" ? current.productionSent : current.customerSent;
  if (already) {
    return {
      ok: false,
      error: `Already issued to ${v.to === "production" ? "production" : "the customer"}.`,
    };
  }

  const now = new Date();
  try {
    await db
      .update(salesOrders)
      .set(
        v.to === "production"
          ? { productionSoSent: true, productionSoSentAt: now, productionSoSentById: me.id, updatedAt: now }
          : { customerSoSent: true, customerSoSentAt: now, customerSoSentById: me.id, updatedAt: now },
      )
      .where(eq(salesOrders.id, v.salesOrderId));
  } catch (err) {
    console.error("[issueSalesOrder]", err);
    return { ok: false, error: "Could not issue the sales order. Please try again." };
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${v.salesOrderId}`);
  return { ok: true, id: v.salesOrderId };
}

/** The superseded PO trail for one order, newest first. */
export async function listCustomerPoRevisions(salesOrderId: string) {
  await requireUser();
  if (!isUuid(salesOrderId)) return [];
  return db
    .select()
    .from(customerPoRevisions)
    .where(eq(customerPoRevisions.salesOrderId, salesOrderId))
    .orderBy(desc(customerPoRevisions.revisionNo));
}
