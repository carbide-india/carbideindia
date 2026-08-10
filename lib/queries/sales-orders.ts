import "server-only";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  salesOrders,
  salesOrderItems,
  inquiries,
  inquiryItems,
  employees,
  masterOptions,
  type SalesOrder,
  type SalesOrderItem,
} from "@/db/schema";
import type { SalesOrderStatus } from "@/db/enums";
import {
  resolveSpecsByItemId,
  resolveCustomerAskByInquiryItemId,
  EMPTY_SPEC,
  EMPTY_CUSTOMER_ASK,
  type ResolvedSpec,
  type ResolvedCustomerAsk,
} from "@/lib/flow/spec-resolve";
import type { SoDocInput, SoDocLineInput } from "@/lib/sales-orders/so-document";

/** One row of the /sales-orders register table. */
export interface SalesOrderListItem {
  id: string;
  soNo: string;
  companyName: string | null;
  quotePrice: string | null;
  customerPoNo: string | null;
  /** House stage bucket (NOT NULL DEFAULT 'not_started' - always set). */
  salesOrderStatus: SalesOrderStatus;
  /** Customer copy send-state. */
  customerSoSent: boolean;
  /** Factory / production copy send-state - its OWN flag, not a mirror. */
  productionSoSent: boolean;
  /** SM snapshot of the enquiry date; null on legacy rows - date filters fall
   *  back to createdAt. */
  enquiryDate: Date | null;
  createdAt: Date;
}

export interface SalesOrderFilters {
  q?: string;
}

/**
 * Sales Order register list. Uncached (URL-driven, per-user). `q` matches the
 * SO number OR company name, case-insensitive substring (wildcards escaped).
 */
export async function listSalesOrders(
  filters: SalesOrderFilters = {},
): Promise<SalesOrderListItem[]> {
  const conds = [];
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(ilike(salesOrders.soNo, like), ilike(salesOrders.companyName, like)),
    );
  }
  return db
    .select({
      id: salesOrders.id,
      soNo: salesOrders.soNo,
      companyName: salesOrders.companyName,
      quotePrice: salesOrders.quotePrice,
      customerPoNo: salesOrders.customerPoNo,
      salesOrderStatus: salesOrders.salesOrderStatus,
      customerSoSent: salesOrders.customerSoSent,
      productionSoSent: salesOrders.productionSoSent,
      enquiryDate: salesOrders.enquiryDate,
      createdAt: salesOrders.createdAt,
    })
    .from(salesOrders)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(salesOrders.createdAt));
}

/** Full sales-order row for the detail page. */
export async function getSalesOrderById(
  id: string,
): Promise<SalesOrder | null> {
  const [row] = await db
    .select()
    .from(salesOrders)
    .where(eq(salesOrders.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * All line items for a sales order, in sort order, with product SPEC resolved
 * read-through from the linked Item (§2.4). Price / qty / timeline stay on the
 * line; product-describing fields come from `items` via `item_id`.
 */
export type SalesOrderLineWithSpec = SalesOrderItem & {
  spec: ResolvedSpec;
  ask: ResolvedCustomerAsk;
};

export async function getSalesOrderItems(
  salesOrderId: string,
): Promise<SalesOrderLineWithSpec[]> {
  const rows = await db
    .select()
    .from(salesOrderItems)
    .where(eq(salesOrderItems.salesOrderId, salesOrderId))
    .orderBy(asc(salesOrderItems.sortOrder));
  const [specs, asks] = await Promise.all([
    resolveSpecsByItemId(rows.map((r) => r.itemId)),
    resolveCustomerAskByInquiryItemId(rows.map((r) => r.inquiryItemId)),
  ]);
  return rows.map((r) => ({
    ...r,
    spec: (r.itemId && specs.get(r.itemId)) || EMPTY_SPEC,
    ask: (r.inquiryItemId && asks.get(r.inquiryItemId)) || EMPTY_CUSTOMER_ASK,
  }));
}

/**
 * The internal PRODUCTION identifiers that live on the provenance
 * `inquiry_items` row as master-option FKs, resolved to their master NAMES.
 *
 * These are the fields Manan named as examples of what the FACTORY copy carries
 * and the customer copy must not: the shop-floor grade, the internal production
 * code and the production part number. They are read THROUGH the line's
 * `inquiry_item_id` - never duplicated onto `sales_order_items` - so the factory
 * sheet always prints what the enquiry currently says.
 */
export interface LineProductionIdentity {
  internalGradeName: string | null;
  internalProductionCodeName: string | null;
  productionPartNoName: string | null;
}

const EMPTY_PRODUCTION_IDENTITY: LineProductionIdentity = {
  internalGradeName: null,
  internalProductionCodeName: null,
  productionPartNoName: null,
};

async function resolveProductionIdentity(
  inquiryItemIds: ReadonlyArray<string | null>,
): Promise<Map<string, LineProductionIdentity>> {
  const out = new Map<string, LineProductionIdentity>();
  const ids = Array.from(
    new Set(inquiryItemIds.filter((v): v is string => typeof v === "string" && v !== "")),
  );
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      id: inquiryItems.id,
      gradeInternalProductionId: inquiryItems.gradeInternalProductionId,
      internalProductionCodeId: inquiryItems.internalProductionCodeId,
      partNoId: inquiryItems.partNoId,
    })
    .from(inquiryItems)
    .where(inArray(inquiryItems.id, ids));

  // One lookup for every master id referenced across all lines (no N+1).
  const optionIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [
          r.gradeInternalProductionId,
          r.internalProductionCodeId,
          r.partNoId,
        ])
        .filter((v): v is string => typeof v === "string" && v !== ""),
    ),
  );
  const names = new Map<string, string>();
  if (optionIds.length > 0) {
    const opts = await db
      .select({ id: masterOptions.id, name: masterOptions.name })
      .from(masterOptions)
      .where(inArray(masterOptions.id, optionIds));
    for (const o of opts) names.set(o.id, o.name);
  }

  const nameOf = (id: string | null): string | null =>
    id ? names.get(id) ?? null : null;

  for (const r of rows) {
    out.set(r.id, {
      internalGradeName: nameOf(r.gradeInternalProductionId),
      internalProductionCodeName: nameOf(r.internalProductionCodeId),
      productionPartNoName: nameOf(r.partNoId),
    });
  }
  return out;
}

/**
 * Everything the two SO copies print, in ONE load: the order header, the SM
 * number, the sales person, every line with its read-through spec + customer
 * ask, and the per-line internal production identity.
 *
 * The copy split happens later, in `buildSalesOrderDocument` - this query is
 * copy-agnostic on purpose so the customer PDF, the factory PDF and both
 * on-screen previews are guaranteed to be looking at identical data.
 */
export async function getSalesOrderDocInput(
  id: string,
): Promise<SoDocInput | null> {
  const [so] = await db
    .select()
    .from(salesOrders)
    .where(eq(salesOrders.id, id))
    .limit(1);
  if (!so) return null;

  const lines = await getSalesOrderItems(so.id);

  const [inquiryRow, salesPersonRow, identity] = await Promise.all([
    so.inquiryId
      ? db
          .select({ smNumber: inquiries.smNumber })
          .from(inquiries)
          .where(eq(inquiries.id, so.inquiryId))
          .limit(1)
      : Promise.resolve([]),
    so.salesPersonId
      ? db
          .select({ name: employees.name })
          .from(employees)
          .where(eq(employees.id, so.salesPersonId))
          .limit(1)
      : Promise.resolve([]),
    resolveProductionIdentity(lines.map((l) => l.inquiryItemId)),
  ]);

  const docLines: SoDocLineInput[] = lines.map((l) => {
    const ident =
      (l.inquiryItemId && identity.get(l.inquiryItemId)) ||
      EMPTY_PRODUCTION_IDENTITY;
    return {
      id: l.id,
      sortOrder: l.sortOrder,
      qty: l.qty,
      qtyOrdered: l.qtyOrdered,
      unitPrice: l.unitPrice,
      quotePrice: l.quotePrice,
      developmentTime: l.developmentTime,
      deliveryTime: l.deliveryTime,
      validity: l.validity,
      productionNotes: l.productionNotes,
      spec: l.spec,
      ask: l.ask,
      ...ident,
    };
  });

  return {
    soNo: so.soNo,
    companyName: so.companyName,
    smNumber: inquiryRow[0]?.smNumber ?? null,
    salesOrderStatus: so.salesOrderStatus,
    enquiryDate: so.enquiryDate,
    customerPoNo: so.customerPoNo,
    customerPoDate: so.customerPoDate,
    quotePrice: so.quotePrice,
    developmentTime: so.developmentTime,
    deliveryTime: so.deliveryTime,
    validity: so.validity,
    customerSoSent: so.customerSoSent,
    productionSoSent: so.productionSoSent,
    productionNotes: so.productionNotes,
    systemRemark: so.systemRemark,
    salesPersonName: salesPersonRow[0]?.name ?? null,
    lines: docLines,
  };
}

/**
 * The per-line factory notes editor's data set - the same lines the factory copy
 * prints, trimmed to what the editor needs. Kept separate from
 * `getSalesOrderDocInput` so the detail page does not pay for the full document
 * build just to render the notes form.
 */
export interface SalesOrderLineNote {
  id: string;
  sortOrder: number;
  productName: string | null;
  itemCode: string | null;
  productionNotes: string | null;
}

export async function getSalesOrderLineNotes(
  salesOrderId: string,
): Promise<SalesOrderLineNote[]> {
  const lines = await getSalesOrderItems(salesOrderId);
  return lines.map((l) => ({
    id: l.id,
    sortOrder: l.sortOrder,
    productName: l.ask.custProductName,
    itemCode: l.spec.itemCode,
    productionNotes: l.productionNotes,
  }));
}
