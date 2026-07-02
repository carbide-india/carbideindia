import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoices,
  invoiceLines,
  salesOrders,
  salesOrderItems,
  clients,
  type Invoice,
} from "@/db/schema";
import { SELLER_STATE } from "@/db/enums";
import { requireRole } from "@/lib/auth/roles";
import { nextDocNumber } from "@/lib/series/next-number";
import { computeGstDocument, resolveSupplyType, type GstLineInput } from "@/lib/gst/compute";

/**
 * Phase 7 — thin invoice create + issue path (§11.3). Draft invoices read
 * through live; the ISSUE transition is where statute bites: it (1) allocates
 * the gapless FY-scoped invoice number, (2) computes the CGST/SGST/IGST split
 * per line and the persisted header totals, and (3) freezes the lines — all in
 * ONE transaction so the number is never consumed without a committed invoice.
 * Full workspace/PDF/template-versioning is Phase 9.
 */

export interface InvoiceLineSeed {
  itemId?: string | null;
  salesOrderItemId?: string | null;
  dispatchLineId?: string | null;
  description?: string | null;
  hsnCode?: string | null;
  uom?: string | null;
  qty: number;
  unitPrice: number;
  discount?: number;
  /** Total GST rate percent for the line (e.g. 18). */
  taxRate: number;
}

export type CreateInvoiceResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Create a DRAFT invoice (no number, no frozen totals) against a sales order.
 * Requires the `accounts` role. Place of supply is resolved from the client's
 * `place_of_supply` (falling back to its state) so the issue step can split GST.
 */
export async function createDraftInvoice(input: {
  salesOrderId: string;
  clientId?: string | null;
  lines: InvoiceLineSeed[];
  placeOfSupply?: string | null;
  isExport?: boolean;
}): Promise<CreateInvoiceResult> {
  const me = await requireRole("accounts");

  const [so] = await db
    .select({ id: salesOrders.id })
    .from(salesOrders)
    .where(eq(salesOrders.id, input.salesOrderId))
    .limit(1);
  if (!so) return { ok: false, error: "Sales order not found" };
  if (input.lines.length === 0) return { ok: false, error: "No invoice lines" };

  // Resolve place of supply from the client when not passed explicitly.
  let placeOfSupply = input.placeOfSupply ?? null;
  let buyerGstin: string | null = null;
  if (input.clientId) {
    const [c] = await db
      .select({
        placeOfSupply: clients.placeOfSupply,
        state: clients.state,
        gstin: clients.gstin,
      })
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1);
    if (c) {
      placeOfSupply = placeOfSupply ?? c.placeOfSupply ?? c.state ?? null;
      buyerGstin = c.gstin ?? null;
    }
  }

  const supplyType = resolveSupplyType({
    placeOfSupply,
    sellerState: SELLER_STATE,
    isExport: input.isExport,
  });

  const id = await db.transaction(async (tx) => {
    const [head] = await tx
      .insert(invoices)
      .values({
        salesOrderId: input.salesOrderId,
        clientId: input.clientId ?? null,
        status: "draft",
        placeOfSupply,
        sellerState: SELLER_STATE,
        supplyType,
        isInterState: supplyType === "inter_state",
        buyerGstin,
        createdById: me.id,
      })
      .returning({ id: invoices.id });
    if (!head) throw new Error("invoices insert returned no row");

    await tx.insert(invoiceLines).values(
      input.lines.map((l, i) => {
        const taxable =
          Math.round((l.qty * l.unitPrice - (l.discount ?? 0) + Number.EPSILON) * 100) / 100;
        return {
          invoiceId: head.id,
          itemId: l.itemId ?? null,
          salesOrderItemId: l.salesOrderItemId ?? null,
          dispatchLineId: l.dispatchLineId ?? null,
          sortOrder: i,
          description: l.description ?? null,
          hsnCode: l.hsnCode ?? null,
          uom: l.uom ?? "Nos",
          qty: String(l.qty),
          unitPrice: String(l.unitPrice),
          discount: String(l.discount ?? 0),
          taxableValue: String(taxable),
          taxRate: String(l.taxRate),
          lineTotal: String(taxable),
        };
      }),
    );
    return head.id;
  });

  return { ok: true, id };
}

/**
 * Issue a draft invoice: allocate the gapless FY invoice number, compute the
 * CGST/SGST/IGST split + persisted header totals, freeze the lines, and flip to
 * `issued` — atomically. Re-issuing is a no-op error.
 */
export async function issueInvoice(
  invoiceId: string,
): Promise<{ ok: true; invoiceNo: string; grandTotal: number } | { ok: false; error: string }> {
  const me = await requireRole("accounts");
  const date = new Date();

  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!inv) return { ok: false as const, error: "Invoice not found" };
    if (inv.status !== "draft" || inv.invoiceNo != null) {
      return { ok: false as const, error: "Invoice already issued" };
    }

    const lines = await tx
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.sortOrder));
    if (lines.length === 0) return { ok: false as const, error: "Invoice has no lines" };

    const gstLines: GstLineInput[] = lines.map((l) => ({
      qty: Number(l.qty),
      unitPrice: Number(l.unitPrice),
      discount: Number(l.discount ?? 0),
      ratePct: Number(l.taxRate ?? 0),
      hsnCode: l.hsnCode,
    }));

    const doc = computeGstDocument({
      lines: gstLines,
      supplyType: inv.supplyType ?? undefined,
      placeOfSupply: inv.placeOfSupply,
      sellerState: inv.sellerState ?? SELLER_STATE,
    });

    // Freeze each line with its computed split.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const r = doc.lines[i];
      if (!line || !r) continue;
      await tx
        .update(invoiceLines)
        .set({
          taxableValue: String(r.taxableAmount),
          cgstRate: String(r.cgstRate),
          cgstAmount: String(r.cgstAmount),
          sgstRate: String(r.sgstRate),
          sgstAmount: String(r.sgstAmount),
          igstRate: String(r.igstRate),
          igstAmount: String(r.igstAmount),
          lineTotal: String(r.lineTotal),
          updatedAt: date,
        })
        .where(eq(invoiceLines.id, line.id));
    }

    const num = await nextDocNumber(tx, "invoice", date);
    await tx
      .update(invoices)
      .set({
        invoiceNo: num.formatted,
        fyLabel: num.fyLabel,
        status: "issued",
        invoiceDate: date,
        supplyType: doc.supplyType,
        isInterState: doc.isInterState,
        subTotal: String(doc.subTotal),
        cgstTotal: String(doc.cgstTotal),
        sgstTotal: String(doc.sgstTotal),
        igstTotal: String(doc.igstTotal),
        taxTotal: String(doc.taxTotal),
        grandTotal: String(doc.grandTotal),
        issuedAt: date,
        issuedById: me.id,
        updatedAt: date,
      })
      .where(eq(invoices.id, invoiceId));

    return { ok: true as const, invoiceNo: num.formatted, grandTotal: doc.grandTotal };
  });
}

/** Thin read of an invoice header (callers/tests). */
export async function getInvoice(id: string): Promise<Invoice | null> {
  await requireRole("accounts");
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return row ?? null;
}
