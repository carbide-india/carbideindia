"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, type NewSalesOrder } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  getQuoteAutofill,
  getQuotationAutofill,
  getInquiryItemSeeds,
  type QuoteLineSeed,
} from "@/lib/queries/quotes";
import { soLineRows, soLineInsert } from "@/lib/sales-orders/line-rows";
import {
  CreateSalesOrderSchema,
  UpdateSalesOrderSchema,
  SetSalesOrderSentSchema,
  type CreateSalesOrderInput,
  type UpdateSalesOrderInput,
} from "@/lib/validators/sales-order";

/**
 * Sales Order server actions — Phase 4 write path. No audit logging (same
 * deferred call as the sample/quotation actions).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID_RE.test(v);

/**
 * Sales-order line seeds for the form per-line editor -- one per
 * inquiry_items row of the picked SM, ordered by sort order.  Called
 * client-side on SM select to pre-fill the lines (product name + qty);
 * pricing + timeline stay blank for the user to fill.  Delegates to the
 * shared getInquiryItemSeeds query used by the quote + negotiation forms.
 */
export async function getInquiryItemsForSalesOrder(
  inquiryId: string,
): Promise<QuoteLineSeed[]> {
  await requireUser();
  if (!isUuid(inquiryId)) return [];
  return getInquiryItemSeeds(inquiryId);
}

type ActionResult =
  | { ok: true; id?: string; soNo?: string }
  | { ok: false; error: string };

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

const isParseableDate = (s: string): boolean =>
  !Number.isNaN(new Date(s).getTime());

const MAX_NO_TRIES = 5;

export async function createSalesOrder(
  input: CreateSalesOrderInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = CreateSalesOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  if (v.customerPoDate !== undefined && !isParseableDate(v.customerPoDate)) {
    return { ok: false, error: "Invalid date value" };
  }

  const auto = await getQuoteAutofill(v.inquiryId);
  if (!auto) return { ok: false, error: "Linked enquiry not found." };

  const quote = v.quotationId ? await getQuotationAutofill(v.quotationId) : null;

  let existingCount = 0;
  if (!v.soNo) {
    try {
      const [cnt] = await db
        .select({ n: count() })
        .from(salesOrders)
        .where(eq(salesOrders.inquiryId, v.inquiryId));
      existingCount = Number(cnt?.n ?? 0);
    } catch (err) {
      console.error("[createSalesOrder] count failed", err);
      return { ok: false, error: "Could not create the sales order. Please try again." };
    }
  }

  const money = (n: number | undefined): string | undefined =>
    n !== undefined ? String(n) : undefined;

  // Build per-line rows first so line #1 can mirror into the legacy columns.
  const lineRows = soLineRows(v);
  const line0 = lineRows[0];

  const values: Omit<NewSalesOrder, "soNo"> = {
    inquiryId: v.inquiryId,
    quotationId: v.quotationId,
    // snapshot from the SM
    companyName: auto.companyName,
    enquiryDate: auto.enquiryDate,
    salesPersonId: auto.salesPersonId,
    // per-line legacy mirror — sourced from line #1
    custProductName: line0?.custProductName ?? v.custProductName ?? auto.productDescription,
    qty: line0?.qty ?? (v.qty != null ? String(v.qty) : auto.quantityNos),
    partNo: line0?.partNo ?? quote?.partNo ?? undefined,
    quotePrice: line0?.quotePrice ?? quote?.quotePrice ?? undefined,
    developmentTime: line0?.developmentTime ?? quote?.developmentTime ?? undefined,
    deliveryTime: line0?.deliveryTime ?? quote?.deliveryTime ?? undefined,
    validity: line0?.validity ?? quote?.validity ?? undefined,
    quotationLink: v.quotationLink ?? quote?.quotationLink ?? undefined,
    customerPoNo: v.customerPoNo,
    customerPoDate: v.customerPoDate ? new Date(v.customerPoDate) : undefined,
    customerPoLink: v.customerPoLink,
    customerSoLink: v.customerSoLink,
    customerSoSent: v.customerSoSent,
    productionSoLink: v.productionSoLink,
    createdById: me.id,
  };

  const tries = v.soNo ? 1 : MAX_NO_TRIES;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const soNo =
      v.soNo ?? `${auto.smNumber}-SO${String(existingCount + attempt).padStart(2, "0")}`;
    try {
      const row = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(salesOrders)
          .values({ ...values, soNo })
          .returning({ id: salesOrders.id });
        if (!r) throw new Error("salesOrders insert returned no row");
        if (lineRows.length) {
          // Only the KEPT line columns — spec/customer-ask mirrors are dropped
          // (migration 0036); spec reads through items via item_id.
          await tx
            .insert(salesOrderItems)
            .values(lineRows.map((x) => ({ salesOrderId: r.id, ...soLineInsert(x) })));
        }
        return r;
      });
      revalidatePath("/sales-orders");
      return { ok: true, id: row.id, soNo };
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string };
      if (e?.code === "23505" && e?.constraint === "sales_orders_so_no_unique") {
        if (v.soNo) {
          return { ok: false, error: "A sales order with this number already exists." };
        }
        continue;
      }
      console.error("[createSalesOrder] failed", err);
      return { ok: false, error: "Could not create the sales order. Please try again." };
    }
  }
  return {
    ok: false,
    error: "Could not allocate a unique SO number — enter one manually.",
  };
}

type SyncResult =
  | { ok: true; added: number }
  | { ok: false; error: string };

/**
 * Append products that were added to the linked enquiry AFTER this sales order
 * was created. Sales orders snapshot their lines at creation, so a later-added
 * product is otherwise stranded. This inserts ONLY the missing lines (matched
 * by inquiryItemId) and never touches existing ones. User-triggered; never
 * auto-runs. (Sales orders carry no finalCost — that seed field is dropped.)
 */
export async function syncProductsFromEnquiry(
  recordId: string,
): Promise<SyncResult> {
  await requireUser();
  if (!isUuid(recordId)) return { ok: false, error: "Invalid sales order id." };

  try {
    const [record] = await db
      .select({ id: salesOrders.id, inquiryId: salesOrders.inquiryId })
      .from(salesOrders)
      .where(eq(salesOrders.id, recordId))
      .limit(1);
    if (!record) return { ok: false, error: "Sales order not found." };
    if (!record.inquiryId) {
      return { ok: false, error: "This record isn't linked to an enquiry." };
    }

    const seeds = await getInquiryItemSeeds(record.inquiryId);

    const existing = await db
      .select({
        inquiryItemId: salesOrderItems.inquiryItemId,
        sortOrder: salesOrderItems.sortOrder,
      })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.salesOrderId, recordId));

    const present = new Set(
      existing
        .map((r) => r.inquiryItemId)
        .filter((v): v is string => v !== null),
    );
    const missing = seeds.filter((s) => !present.has(s.inquiryItemId));
    if (missing.length === 0) return { ok: true, added: 0 };

    const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    // Only the KEPT line columns — the spec/customer-ask mirror is dropped
    // (migration 0036); it reads through items/inquiry_item downstream.
    const rows = missing.map((s, i) => ({
      salesOrderId: recordId,
      inquiryItemId: s.inquiryItemId,
      itemId: s.itemId,
      sortOrder: maxSort + 1 + i,
      qty: s.qty,
    }));
    await db.insert(salesOrderItems).values(rows);

    revalidatePath("/sales-orders");
    revalidatePath(`/sales-orders/${recordId}`);
    return { ok: true, added: missing.length };
  } catch (err) {
    console.error("[syncProductsFromEnquiry:salesOrder] failed", err);
    return { ok: false, error: "Could not add the products. Please try again." };
  }
}

export async function updateSalesOrder(
  id: string,
  input: UpdateSalesOrderInput,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid sales order id." };
  const parsed = UpdateSalesOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = stripUndefined(parsed.data);
  if (Object.keys(v).length === 0) return { ok: true };

  const { quotePrice, qty, customerPoDate, ...rest } = v;
  const patch: Partial<NewSalesOrder> = { ...rest };
  if (quotePrice !== undefined) patch.quotePrice = String(quotePrice);
  if (qty !== undefined) patch.qty = String(qty);
  if (customerPoDate !== undefined) {
    if (!isParseableDate(customerPoDate)) {
      return { ok: false, error: "Invalid date value" };
    }
    patch.customerPoDate = new Date(customerPoDate);
  }

  try {
    await db
      .update(salesOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(salesOrders.id, id));
  } catch (err) {
    console.error("[updateSalesOrder] failed", err);
    return { ok: false, error: "Could not save the sales order. Please try again." };
  }

  // Mirror line-#1 per-line subset into sales_order_items (sortOrder = 0). Only
  // the KEPT transactional columns — the spec/customer-ask mirrors (custProductName,
  // partNo) are dropped (migration 0036) and read through items/inquiry_item.
  const LINE1_KEYS = [
    "qty",
    "quotePrice",
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
        .update(salesOrderItems)
        .set({ ...line1Patch, updatedAt: new Date() })
        .where(
          and(
            eq(salesOrderItems.salesOrderId, id),
            eq(salesOrderItems.sortOrder, 0),
          ),
        );
    } catch (err) {
      console.error("[updateSalesOrder] line-1 sync failed", err);
    }
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${id}`);
  return { ok: true };
}

/** Toggle the Customer SO Sent flag (the SO's only "status" mutator). */
export async function setSalesOrderSent(
  id: string,
  sent: boolean,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Invalid sales order id." };
  const parsed = SetSalesOrderSentSchema.safeParse({ sent });
  if (!parsed.success) return { ok: false, error: "Invalid value" };
  try {
    await db
      .update(salesOrders)
      .set({ customerSoSent: parsed.data.sent, updatedAt: new Date() })
      .where(eq(salesOrders.id, id));
  } catch (err) {
    console.error("[setSalesOrderSent] failed", err);
    return { ok: false, error: "Could not update the sales order. Please try again." };
  }
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${id}`);
  return { ok: true };
}

/** Bulk-toggle the Customer SO Sent flag over the selected rows. `value` is
 *  "yes" / "no" (the register table's only clean bulk target). */
export async function setSalesOrderSentBulk(
  ids: string[],
  value: string,
): Promise<ActionResult> {
  await requireUser();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "No rows selected." };
  }
  if (!ids.every(isUuid)) return { ok: false, error: "Invalid sales order id." };
  if (value !== "yes" && value !== "no") {
    return { ok: false, error: "Invalid value" };
  }
  try {
    await db
      .update(salesOrders)
      .set({ customerSoSent: value === "yes", updatedAt: new Date() })
      .where(inArray(salesOrders.id, ids));
  } catch (err) {
    console.error("[setSalesOrderSentBulk] failed", err);
    return { ok: false, error: "Could not update the sales orders. Please try again." };
  }
  revalidatePath("/sales-orders");
  return { ok: true };
}
