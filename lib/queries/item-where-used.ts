import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients,
  costings,
  dispatchLines,
  inquiries,
  inquiryItems,
  invoiceLines,
  invoices,
  jobCards,
  negotiationItems,
  negotiations,
  productionOrders,
  quotationItems,
  quotations,
  salesOrderItems,
  salesOrders,
} from "@/db/schema";

/**
 * Item WHERE-USED graph (ERP redesign — Phase 9a, §6 "Product Intelligence").
 *
 * The heart of the Item as a reusable spec: for one `item_id`, resolve every
 * reference across ALL item_id-carrying tables that exist — inquiry_items (+
 * their inquiries / SMs / clients), quotation_items, negotiation_items,
 * sales_order_items, job_cards, costings, and the Phase-7 downstream entities
 * (production_orders, dispatch_lines, invoice_lines). Every reference is a
 * fan-out over the FK; NOTHING here reads a frozen origin_* snapshot for usage.
 *
 * PERFORMANCE (< 150ms budget): the reach counts + customer count come from ONE
 * `UNION ALL` pass over the indexed where-used columns (every referencing table
 * carries an `(item_id)` index — Phase 2, migration 0032). The tab detail lists
 * (related records, cost history, quote prices) are a small number of focused,
 * indexed queries run concurrently — no per-row N+1.
 */

/** Per-stage reach counts for the Reach chips + summary rail. */
export interface ItemReach {
  enquiryCount: number;
  quotationCount: number;
  negotiationCount: number;
  salesOrderCount: number;
  jobCardCount: number;
  costingCount: number;
  productionCount: number;
  dispatchCount: number;
  invoiceCount: number;
  customerCount: number;
}

/** A distinct customer using this spec (via the enquiries the item appears on). */
export interface ItemCustomer {
  clientId: string | null;
  name: string;
  enquiryCount: number;
}

/** One clickable related record (SM / quote / SO / job card / invoice). */
export interface RelatedRecord {
  kind:
    | "enquiry"
    | "quotation"
    | "negotiation"
    | "sales_order"
    | "job_card"
    | "invoice";
  id: string;
  /** The link target (a workspace/detail route), or null if no route exists yet. */
  href: string | null;
  /** The primary label (SM number / quote no / ). */
  label: string;
  /** A secondary muted line (customer). */
  sub: string | null;
  date: Date | null;
}

/** A costing row in this item's live cost history. */
export interface CostHistoryRow {
  id: string;
  inquiryId: string;
  smNumber: string | null;
  costingType: string;
  isChosen: boolean;
  finalCostPerPiece: string | null;
  quoteValue: string | null;
  createdAt: Date;
}

/** A quotation price point (frozen snapshot preferred, else live quote price). */
export interface QuotePriceRow {
  quotationItemId: string;
  quotationId: string;
  quoteNo: string;
  smNumber: string | null;
  companyName: string | null;
  qty: string | null;
  /** The frozen unit_price snapshot (what the customer saw), else live quotePrice. */
  unitPrice: string | null;
  quoteSent: boolean;
  createdAt: Date;
}

/** Latest production order touching this item. */
export interface LatestProduction {
  id: string;
  poNo: string;
  status: string;
  qtyPlanned: string | null;
  qtyProduced: string | null;
  updatedAt: Date;
}

/** The full where-used aggregate for the Item Workspace / drawer. */
export interface ItemWhereUsed {
  reach: ItemReach;
  customers: ItemCustomer[];
  related: RelatedRecord[];
  costHistory: CostHistoryRow[];
  quotePrices: QuotePriceRow[];
  latestProduction: LatestProduction | null;
}

/**
 * ONE UNION-ALL pass over the where-used columns → per-stage counts + the
 * distinct-customer count. Each branch is a single indexed COUNT / COUNT DISTINCT
 * on an `(item_id)` index.
 */
async function fetchReach(itemId: string): Promise<ItemReach> {
  const rows = (await db.execute(sql`
    SELECT 'enquiry'      AS k, count(*)::int AS n FROM inquiry_items      WHERE item_id = ${itemId}
    UNION ALL SELECT 'quotation',    count(*)::int FROM quotation_items    WHERE item_id = ${itemId}
    UNION ALL SELECT 'negotiation',  count(*)::int FROM negotiation_items  WHERE item_id = ${itemId}
    UNION ALL SELECT 'sales_order',  count(*)::int FROM sales_order_items  WHERE item_id = ${itemId}
    UNION ALL SELECT 'job_card',     count(*)::int FROM job_cards          WHERE item_id = ${itemId}
    UNION ALL SELECT 'costing',      count(*)::int FROM costings           WHERE item_id = ${itemId}
    UNION ALL SELECT 'production',   count(*)::int FROM production_orders  WHERE item_id = ${itemId}
    UNION ALL SELECT 'dispatch',     count(*)::int FROM dispatch_lines     WHERE item_id = ${itemId}
    UNION ALL SELECT 'invoice',      count(*)::int FROM invoice_lines      WHERE item_id = ${itemId}
    UNION ALL SELECT 'customer',     count(DISTINCT i.client_id)::int
      FROM inquiry_items ii JOIN inquiries i ON i.id = ii.inquiry_id
      WHERE ii.item_id = ${itemId}
  `)) as unknown as Array<{ k: string; n: number }>;

  const by = new Map<string, number>();
  for (const r of rows) by.set(r.k, Number(r.n) || 0);
  const g = (k: string) => by.get(k) ?? 0;

  return {
    enquiryCount: g("enquiry"),
    quotationCount: g("quotation"),
    negotiationCount: g("negotiation"),
    salesOrderCount: g("sales_order"),
    jobCardCount: g("job_card"),
    costingCount: g("costing"),
    productionCount: g("production"),
    dispatchCount: g("dispatch"),
    invoiceCount: g("invoice"),
    customerCount: g("customer"),
  };
}

/** Distinct customers using this spec, via the SMs the item appears on. */
async function fetchCustomers(itemId: string): Promise<ItemCustomer[]> {
  const rows = await db
    .select({
      clientId: inquiries.clientId,
      name: sql<string>`coalesce(${clients.name}, ${inquiries.companyName})`,
      enquiryCount: sql<number>`count(distinct ${inquiries.id})::int`,
    })
    .from(inquiryItems)
    .innerJoin(inquiries, eq(inquiries.id, inquiryItems.inquiryId))
    .leftJoin(clients, eq(clients.id, inquiries.clientId))
    .where(eq(inquiryItems.itemId, itemId))
    .groupBy(inquiries.clientId, clients.name, inquiries.companyName)
    .orderBy(desc(sql`count(distinct ${inquiries.id})`))
    .limit(50);

  return rows.map((r) => ({
    clientId: r.clientId,
    name: r.name,
    enquiryCount: Number(r.enquiryCount) || 0,
  }));
}

/**
 * The clickable related-records list — every SM / quote / neg / SO / job-card /
 * invoice this item touches, newest-first. A handful of small indexed selects
 * (one per referencing table), each limited, then merged + sorted in memory.
 */
async function fetchRelated(itemId: string): Promise<RelatedRecord[]> {
  const out: RelatedRecord[] = [];

  const [enq, quo, neg, so, jc, inv] = await Promise.all([
    db
      .select({
        id: inquiries.id,
        smNumber: inquiries.smNumber,
        companyName: inquiries.companyName,
        date: inquiries.enquiryDate,
      })
      .from(inquiryItems)
      .innerJoin(inquiries, eq(inquiries.id, inquiryItems.inquiryId))
      .where(eq(inquiryItems.itemId, itemId))
      .orderBy(desc(inquiries.enquiryDate))
      .limit(50),
    db
      .select({
        id: quotations.id,
        quoteNo: quotations.quoteNo,
        companyName: quotations.companyName,
        date: quotations.createdAt,
      })
      .from(quotationItems)
      .innerJoin(quotations, eq(quotations.id, quotationItems.quotationId))
      .where(eq(quotationItems.itemId, itemId))
      .orderBy(desc(quotations.createdAt))
      .limit(50),
    db
      .select({
        id: negotiations.id,
        negotiationNo: negotiations.negotiationNo,
        companyName: negotiations.companyName,
        date: negotiations.createdAt,
      })
      .from(negotiationItems)
      .innerJoin(negotiations, eq(negotiations.id, negotiationItems.negotiationId))
      .where(eq(negotiationItems.itemId, itemId))
      .orderBy(desc(negotiations.createdAt))
      .limit(50),
    db
      .select({
        id: salesOrders.id,
        soNo: salesOrders.soNo,
        companyName: salesOrders.companyName,
        date: salesOrders.createdAt,
      })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrders.id, salesOrderItems.salesOrderId))
      .where(eq(salesOrderItems.itemId, itemId))
      .orderBy(desc(salesOrders.createdAt))
      .limit(50),
    db
      .select({
        id: jobCards.id,
        jobCardNo: jobCards.jobCardNo,
        // Resolve customer live via the client FK (mirror is display-deprecated).
        customerName: clients.name,
        date: jobCards.jobCardDate,
      })
      .from(jobCards)
      .leftJoin(clients, eq(clients.id, jobCards.clientId))
      .where(eq(jobCards.itemId, itemId))
      .orderBy(desc(jobCards.createdAt))
      .limit(50),
    db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        date: invoices.invoiceDate,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(eq(invoiceLines.itemId, itemId))
      .groupBy(invoices.id, invoices.invoiceNo, invoices.invoiceDate)
      .orderBy(desc(invoices.invoiceDate))
      .limit(50),
  ]);

  for (const r of enq)
    out.push({
      kind: "enquiry",
      id: r.id,
      href: `/inquiries/${r.id}`,
      label: r.smNumber,
      sub: r.companyName,
      date: r.date,
    });
  for (const r of quo)
    out.push({
      kind: "quotation",
      id: r.id,
      href: `/quotations/${r.id}`,
      label: r.quoteNo,
      sub: r.companyName,
      date: r.date,
    });
  for (const r of neg)
    out.push({
      kind: "negotiation",
      id: r.id,
      href: `/negotiations/${r.id}`,
      label: r.negotiationNo,
      sub: r.companyName,
      date: r.date,
    });
  for (const r of so)
    out.push({
      kind: "sales_order",
      id: r.id,
      href: `/sales-orders/${r.id}`,
      label: r.soNo,
      sub: r.companyName,
      date: r.date,
    });
  for (const r of jc)
    out.push({
      kind: "job_card",
      id: r.id,
      // Job-card detail route arrives later in Phase 9 — keep non-clickable for now.
      href: null,
      label: r.jobCardNo,
      sub: r.customerName,
      date: r.date,
    });
  for (const r of inv)
    out.push({
      kind: "invoice",
      id: r.id,
      // No invoice detail route yet (Phase 7 is data-only) — non-clickable.
      href: null,
      label: r.invoiceNo ?? "(draft invoice)",
      sub: null,
      date: r.date,
    });

  // Merge + newest-first; undated rows sink to the bottom.
  out.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  return out;
}

/** Live cost history — all costings linked to this item, chosen-first/newest. */
async function fetchCostHistory(itemId: string): Promise<CostHistoryRow[]> {
  const rows = await db
    .select({
      id: costings.id,
      inquiryId: costings.inquiryId,
      smNumber: inquiries.smNumber,
      costingType: costings.costingType,
      isChosen: costings.isChosen,
      finalCostPerPiece: costings.finalCostPerPiece,
      quoteValue: costings.quoteValue,
      createdAt: costings.createdAt,
    })
    .from(costings)
    .leftJoin(inquiries, eq(inquiries.id, costings.inquiryId))
    .where(eq(costings.itemId, itemId))
    .orderBy(desc(costings.isChosen), desc(costings.createdAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    inquiryId: r.inquiryId,
    smNumber: r.smNumber,
    costingType: r.costingType,
    isChosen: r.isChosen,
    finalCostPerPiece: r.finalCostPerPiece,
    quoteValue: r.quoteValue,
    createdAt: r.createdAt,
  }));
}

/**
 * Quotation price points — prefer the frozen `unit_price` snapshot (the number
 * the customer actually saw), fall back to the live `quotePrice` for drafts.
 */
async function fetchQuotePrices(itemId: string): Promise<QuotePriceRow[]> {
  const rows = await db
    .select({
      quotationItemId: quotationItems.id,
      quotationId: quotationItems.quotationId,
      quoteNo: quotations.quoteNo,
      smNumber: inquiries.smNumber,
      companyName: quotations.companyName,
      qty: quotationItems.qty,
      unitPrice: sql<
        string | null
      >`coalesce(${quotationItems.unitPrice}, ${quotationItems.quotePrice})`,
      quoteSent: quotations.quoteSent,
      createdAt: quotations.createdAt,
    })
    .from(quotationItems)
    .innerJoin(quotations, eq(quotations.id, quotationItems.quotationId))
    .leftJoin(inquiries, eq(inquiries.id, quotations.inquiryId))
    .where(eq(quotationItems.itemId, itemId))
    .orderBy(desc(quotations.createdAt))
    .limit(50);

  return rows.map((r) => ({
    quotationItemId: r.quotationItemId,
    quotationId: r.quotationId,
    quoteNo: r.quoteNo,
    smNumber: r.smNumber,
    companyName: r.companyName,
    qty: r.qty,
    unitPrice: r.unitPrice,
    quoteSent: r.quoteSent,
    createdAt: r.createdAt,
  }));
}

/** Latest active production order referencing this item. */
async function fetchLatestProduction(
  itemId: string,
): Promise<LatestProduction | null> {
  const [row] = await db
    .select({
      id: productionOrders.id,
      poNo: productionOrders.poNo,
      status: productionOrders.status,
      qtyPlanned: productionOrders.qtyPlanned,
      qtyProduced: productionOrders.qtyProduced,
      updatedAt: productionOrders.updatedAt,
    })
    .from(productionOrders)
    .where(and(eq(productionOrders.itemId, itemId), eq(productionOrders.isActive, true)))
    .orderBy(desc(productionOrders.updatedAt))
    .limit(1);
  return row ?? null;
}

/**
 * The full where-used aggregate for the Item Workspace. Runs the UNION-ALL reach
 * count and every focused detail query concurrently — all indexed, no N+1.
 */
export async function getItemWhereUsed(itemId: string): Promise<ItemWhereUsed> {
  const [reach, customers, related, costHistory, quotePrices, latestProduction] =
    await Promise.all([
      fetchReach(itemId),
      fetchCustomers(itemId),
      fetchRelated(itemId),
      fetchCostHistory(itemId),
      fetchQuotePrices(itemId),
      fetchLatestProduction(itemId),
    ]);

  return { reach, customers, related, costHistory, quotePrices, latestProduction };
}
