"use server";

import { revalidatePath } from "next/cache";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { salesOrders, type NewSalesOrder } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { getQuoteAutofill, getQuotationAutofill } from "@/lib/queries/quotes";
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

type ActionResult =
  | { ok: true; id?: string; soNo?: string }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string): boolean => UUID_RE.test(v);

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

  const values: Omit<NewSalesOrder, "soNo"> = {
    inquiryId: v.inquiryId,
    quotationId: v.quotationId,
    // snapshot from the SM
    companyName: auto.companyName,
    enquiryDate: auto.enquiryDate,
    salesPersonId: auto.salesPersonId,
    custProductName: v.custProductName ?? auto.productDescription,
    qty: v.qty != null ? String(v.qty) : auto.quantityNos,
    partNo: v.partNo ?? quote?.partNo ?? undefined,
    quotePrice: money(v.quotePrice) ?? quote?.quotePrice ?? undefined,
    developmentTime: v.developmentTime ?? quote?.developmentTime ?? undefined,
    deliveryTime: v.deliveryTime ?? quote?.deliveryTime ?? undefined,
    validity: v.validity ?? quote?.validity ?? undefined,
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
      const [row] = await db
        .insert(salesOrders)
        .values({ ...values, soNo })
        .returning({ id: salesOrders.id });
      if (!row) return { ok: false, error: "Insert returned no row" };
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
