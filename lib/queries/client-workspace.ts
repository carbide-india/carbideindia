import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clientContacts,
  clients,
  inquiries,
  masterOptions,
  negotiations,
  quotations,
  salesOrders,
  type ClientAddress,
  type ClientBankAccount,
  type ClientContact,
} from "@/db/schema";
import {
  getClientAddresses,
  getClientBankAccounts,
} from "@/lib/queries/client-children";
import { getAuditLog } from "@/lib/queries/audit";

/**
 * Client Workspace read layer (ERP redesign — Phase 9c, §8 "Client Workspace").
 *
 * The per-client cockpit's data contract. EVERYTHING is computed LIVE from the
 * single-source-of-truth by reaching the client only through the real FK spine
 * (`inquiries.clientId` → clients.id), NEVER the stale `companyName` snapshot
 * text. There are ZERO stored aggregate counters — a client rename or a new SO
 * reflects instantly because every number is a read-through aggregate.
 *
 * Money resolves through LINE items (sales_order_items qty × price), never a
 * header snapshot price. "Open" is derived (no descendant reached a terminal
 * SO/negotiation state). FY is Indian (Apr–Mar) via `fiscalYearRange()`.
 */

/* ── Indian fiscal year (Apr 1 → Mar 31) ──────────────────────────────────
 * No shared helper exists in the repo (grepped: only lib/series + docs), so a
 * small local one. Returns [start, end) — end is the exclusive next-FY start. */
export function fiscalYearRange(ref: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth(); // 0 = Jan  3 = Apr
  const startYear = m >= 3 ? y : y - 1;
  const start = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(startYear + 1, 3, 1, 0, 0, 0, 0));
  return { start, end };
}

/* ── Header ───────────────────────────────────────────────────────────── */

export interface ClientHeader {
  id: string;
  name: string;
  clientCode: string | null;
  isActive: boolean;
  city: string | null;
  state: string | null;
  customerTypeNames: string[];
  industryTypeNames: string[];
  primaryContactName: string | null;
  primaryContactDesignation: string | null;
  primaryContactEmail: string | null;
  primaryContactNo: string | null;
}

/** Client identity + type/industry (resolved from the id arrays → master names)
 *  + primary contact/city. Everything keyed on the client PK. */
export async function getClientHeader(
  clientId: string,
): Promise<ClientHeader | null> {
  const [row] = await db
    .select({
      id: clients.id,
      name: clients.name,
      clientCode: clients.clientCode,
      isActive: clients.isActive,
      city: clients.city,
      state: clients.state,
      customerTypeIds: clients.customerTypeIds,
      industryTypeIds: clients.industryTypeIds,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!row) return null;

  const customerTypeIds = row.customerTypeIds ?? [];
  const industryTypeIds = row.industryTypeIds ?? [];
  const allIds = [...new Set([...customerTypeIds, ...industryTypeIds])];
  const nameById = new Map<string, string>();
  if (allIds.length > 0) {
    const opts = await db
      .select({ id: masterOptions.id, name: masterOptions.name })
      .from(masterOptions)
      .where(sql`${masterOptions.id} = ANY(${allIds})`);
    for (const o of opts) nameById.set(o.id, o.name);
  }
  const resolve = (ids: string[]): string[] =>
    ids.map((id) => nameById.get(id)).filter((n): n is string => n != null);

  const [primary] = await db
    .select({
      firstName: clientContacts.firstName,
      lastName: clientContacts.lastName,
      designation: clientContacts.designation,
      email: clientContacts.email,
      contactNo: clientContacts.contactNo,
    })
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.isPrimary, true),
      ),
    )
    .limit(1);

  const primaryName = primary
    ? [primary.firstName, primary.lastName].filter(Boolean).join(" ").trim() ||
      null
    : null;

  return {
    id: row.id,
    name: row.name,
    clientCode: row.clientCode,
    isActive: row.isActive,
    city: row.city,
    state: row.state,
    customerTypeNames: resolve(customerTypeIds),
    industryTypeNames: resolve(industryTypeIds),
    primaryContactName: primaryName,
    primaryContactDesignation: primary?.designation ?? null,
    primaryContactEmail: primary?.email ?? null,
    primaryContactNo: primary?.contactNo ?? null,
  };
}

/* ── KPI header ────────────────────────────────────────────────────────── */

export interface ClientKpis {
  openEnquiries: number;
  openQuotations: number;
  wonOrdersFy: number;
  revenueFy: number;
  /** Provisional until the Invoicing module lands (no unpaid-invoice data yet). */
  outstanding: number | null;
  outstandingProvisional: boolean;
  winRate: number | null; // 0..1, null when no won+lost decisions yet
  winRateWon: number;
  winRateLost: number;
  lastActivity: Date | null;
  fyLabel: string;
}

/**
 * ALL numeric KPIs in ONE aggregate query — CTEs over the FK spine, zero stored
 * counters. "Open" = no descendant reached a terminal negotiation/SO state.
 * Revenue sums the SO LINE items (qty_ordered/qty × unit_price/quote_price),
 * never a header price. Win rate is lifetime over negotiations.status.
 */
export async function getClientKpis(clientId: string): Promise<ClientKpis> {
  const { start, end } = fiscalYearRange();
  const fyStartYear = start.getUTCFullYear();
  const fyLabel = `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`;

  const rows = (await db.execute(sql`
    WITH cli_inq AS (
      SELECT id, created_at
      FROM inquiries
      WHERE client_id = ${clientId} AND is_archived = false
    ),
    open_enq AS (
      SELECT count(*)::int AS n
      FROM cli_inq i
      WHERE NOT EXISTS (
              SELECT 1 FROM negotiations n
              WHERE n.inquiry_id = i.id
                AND n.negotiation_status IN ('order_won','order_lost','order_abandoned'))
        AND NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.inquiry_id = i.id)
    ),
    open_quo AS (
      SELECT count(*)::int AS n
      FROM quotations q
      JOIN inquiries i ON i.id = q.inquiry_id AND i.client_id = ${clientId}
      WHERE q.quote_sent = true
        AND NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.quotation_id = q.id)
        AND NOT EXISTS (
              SELECT 1 FROM negotiations n
              WHERE n.quotation_id = q.id
                AND n.negotiation_status IN ('order_won','order_lost','order_abandoned'))
    ),
    won_so AS (
      SELECT so.id
      FROM sales_orders so
      JOIN inquiries i ON i.id = so.inquiry_id AND i.client_id = ${clientId}
      WHERE so.created_at >= ${start.toISOString()}::timestamptz AND so.created_at < ${end.toISOString()}::timestamptz
    ),
    revenue AS (
      SELECT coalesce(sum(
        coalesce(soi.qty_ordered, soi.qty, 0)
        * coalesce(soi.unit_price, soi.quote_price, 0)
      ), 0)::numeric AS total
      FROM sales_order_items soi
      JOIN won_so ws ON ws.id = soi.sales_order_id
    ),
    neg AS (
      SELECT
        count(*) FILTER (WHERE n.negotiation_status = 'order_won')::int AS won,
        count(*) FILTER (WHERE n.negotiation_status IN ('order_lost','order_abandoned'))::int AS lost
      FROM negotiations n
      JOIN inquiries i ON i.id = n.inquiry_id AND i.client_id = ${clientId}
    ),
    last_act AS (
      SELECT max(t) AS ts FROM (
        SELECT max(created_at) AS t FROM cli_inq
        UNION ALL SELECT max(q.created_at) FROM quotations q
          JOIN inquiries i ON i.id = q.inquiry_id AND i.client_id = ${clientId}
        UNION ALL SELECT max(n.created_at) FROM negotiations n
          JOIN inquiries i ON i.id = n.inquiry_id AND i.client_id = ${clientId}
        UNION ALL SELECT max(so.created_at) FROM sales_orders so
          JOIN inquiries i ON i.id = so.inquiry_id AND i.client_id = ${clientId}
        UNION ALL SELECT max(created_at) FROM client_meetings WHERE client_id = ${clientId}
        UNION ALL SELECT max(created_at) FROM audit_log
          WHERE entity_type = 'client' AND entity_id = ${clientId}
      ) s
    )
    SELECT
      (SELECT n     FROM open_enq)  AS open_enquiries,
      (SELECT n     FROM open_quo)  AS open_quotations,
      (SELECT count(*)::int FROM won_so) AS won_orders_fy,
      (SELECT total FROM revenue)   AS revenue_fy,
      (SELECT won   FROM neg)       AS neg_won,
      (SELECT lost  FROM neg)       AS neg_lost,
      (SELECT ts    FROM last_act)  AS last_activity
  `)) as unknown as Array<{
    open_enquiries: number;
    open_quotations: number;
    won_orders_fy: number;
    revenue_fy: string | null;
    neg_won: number;
    neg_lost: number;
    last_activity: string | Date | null;
  }>;

  const r = rows[0];
  const won = Number(r?.neg_won ?? 0);
  const lost = Number(r?.neg_lost ?? 0);
  const decided = won + lost;
  const lastRaw = r?.last_activity ?? null;

  return {
    openEnquiries: Number(r?.open_enquiries ?? 0),
    openQuotations: Number(r?.open_quotations ?? 0),
    wonOrdersFy: Number(r?.won_orders_fy ?? 0),
    revenueFy: Number(r?.revenue_fy ?? 0),
    outstanding: null,
    outstandingProvisional: true,
    winRate: decided > 0 ? won / decided : null,
    winRateWon: won,
    winRateLost: lost,
    lastActivity: lastRaw ? new Date(lastRaw) : null,
    fyLabel,
  };
}

/* ── Enquiries surface ────────────────────────────────────────────────── */

export interface ClientEnquiryRow {
  id: string;
  smNumber: string;
  enquiryDate: Date | null;
  productDescription: string;
  enquiryStatus: string;
  priority: string;
  itemCount: number;
  hasQuote: boolean;
  won: boolean;
  hasSalesOrder: boolean;
}

/** Every SM for the client, newest-first, with lightweight progression flags. */
export async function getClientEnquiries(
  clientId: string,
): Promise<ClientEnquiryRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      i.id,
      i.sm_number,
      i.enquiry_date,
      i.product_description,
      i.enquiry_status,
      i.priority,
      (SELECT count(*) FROM inquiry_items ii WHERE ii.inquiry_id = i.id)::int AS item_count,
      EXISTS(SELECT 1 FROM quotations q WHERE q.inquiry_id = i.id AND q.quote_sent = true) AS has_quote,
      EXISTS(SELECT 1 FROM negotiations n WHERE n.inquiry_id = i.id AND n.negotiation_status = 'order_won') AS won,
      EXISTS(SELECT 1 FROM sales_orders so WHERE so.inquiry_id = i.id) AS has_so
    FROM inquiries i
    WHERE i.client_id = ${clientId} AND i.is_archived = false
    ORDER BY i.enquiry_date DESC NULLS LAST, i.created_at DESC
    LIMIT 200
  `)) as unknown as Array<{
    id: string;
    sm_number: string;
    enquiry_date: string | Date | null;
    product_description: string;
    enquiry_status: string;
    priority: string;
    item_count: number;
    has_quote: boolean;
    won: boolean;
    has_so: boolean;
  }>;

  return rows.map((r) => ({
    id: r.id,
    smNumber: r.sm_number,
    enquiryDate: r.enquiry_date ? new Date(r.enquiry_date) : null,
    productDescription: r.product_description,
    enquiryStatus: r.enquiry_status,
    priority: r.priority,
    itemCount: Number(r.item_count ?? 0),
    hasQuote: Boolean(r.has_quote),
    won: Boolean(r.won),
    hasSalesOrder: Boolean(r.has_so),
  }));
}

/* ── Pipeline surface (quotes / negotiations / sales orders) ───────────── */

export interface PipelineRow {
  id: string;
  no: string;
  smNumber: string;
  status: string | null;
  sent: boolean | null;
  date: Date | null;
}

export interface ClientPipeline {
  quotations: PipelineRow[];
  negotiations: PipelineRow[];
  salesOrders: PipelineRow[];
}

/** The live commercial pipeline for the client, reached via inquiries.clientId. */
export async function getClientPipeline(
  clientId: string,
): Promise<ClientPipeline> {
  const [quos, negs, sos] = await Promise.all([
    db
      .select({
        id: quotations.id,
        no: quotations.quoteNo,
        smNumber: inquiries.smNumber,
        sent: quotations.quoteSent,
        date: quotations.createdAt,
      })
      .from(quotations)
      .innerJoin(inquiries, eq(inquiries.id, quotations.inquiryId))
      .where(eq(inquiries.clientId, clientId))
      .orderBy(desc(quotations.createdAt))
      .limit(100),
    db
      .select({
        id: negotiations.id,
        no: negotiations.negotiationNo,
        smNumber: inquiries.smNumber,
        status: negotiations.negotiationStatus,
        date: negotiations.createdAt,
      })
      .from(negotiations)
      .innerJoin(inquiries, eq(inquiries.id, negotiations.inquiryId))
      .where(eq(inquiries.clientId, clientId))
      .orderBy(desc(negotiations.createdAt))
      .limit(100),
    db
      .select({
        id: salesOrders.id,
        no: salesOrders.soNo,
        smNumber: inquiries.smNumber,
        date: salesOrders.createdAt,
      })
      .from(salesOrders)
      .innerJoin(inquiries, eq(inquiries.id, salesOrders.inquiryId))
      .where(eq(inquiries.clientId, clientId))
      .orderBy(desc(salesOrders.createdAt))
      .limit(100),
  ]);

  return {
    quotations: quos.map((q) => ({
      id: q.id,
      no: q.no,
      smNumber: q.smNumber,
      status: null,
      sent: q.sent,
      date: q.date,
    })),
    negotiations: negs.map((n) => ({
      id: n.id,
      no: n.no,
      smNumber: n.smNumber,
      status: n.status,
      sent: null,
      date: n.date,
    })),
    salesOrders: sos.map((s) => ({
      id: s.id,
      no: s.no,
      smNumber: s.smNumber,
      status: null,
      sent: null,
      date: s.date,
    })),
  };
}

/* ── Products surface (client-scoped where-used slice) ─────────────────── */

export interface ClientProductRow {
  itemId: string;
  itemCode: string;
  shapeName: string | null;
  gradeName: string | null;
  revenue: number;
  orderedQty: number;
  enquiryCount: number;
}

/**
 * The client-scoped slice of the Item where-used graph: every Item this client
 * has enquired on, ranked by Σ sales_order_items line total (qty × price) for
 * this client's orders. Same SSOT as the global where-used, a filtered lens.
 */
export async function getClientProducts(
  clientId: string,
): Promise<ClientProductRow[]> {
  const rows = (await db.execute(sql`
    WITH cli_items AS (
      SELECT DISTINCT ii.item_id
      FROM inquiry_items ii
      JOIN inquiries i ON i.id = ii.inquiry_id
      WHERE i.client_id = ${clientId}
    ),
    rev AS (
      SELECT soi.item_id,
             sum(coalesce(soi.qty_ordered, soi.qty, 0)
                 * coalesce(soi.unit_price, soi.quote_price, 0))::numeric AS revenue,
             sum(coalesce(soi.qty_ordered, soi.qty, 0))::numeric AS qty
      FROM sales_order_items soi
      JOIN sales_orders so ON so.id = soi.sales_order_id
      JOIN inquiries i ON i.id = so.inquiry_id AND i.client_id = ${clientId}
      WHERE soi.item_id IS NOT NULL
      GROUP BY soi.item_id
    ),
    enq AS (
      SELECT ii.item_id, count(DISTINCT ii.inquiry_id)::int AS enquiry_count
      FROM inquiry_items ii
      JOIN inquiries i ON i.id = ii.inquiry_id AND i.client_id = ${clientId}
      GROUP BY ii.item_id
    )
    SELECT
      it.id           AS item_id,
      it.item_code    AS item_code,
      sh.name         AS shape_name,
      gr.name         AS grade_name,
      coalesce(rev.revenue, 0)::numeric AS revenue,
      coalesce(rev.qty, 0)::numeric     AS qty,
      coalesce(enq.enquiry_count, 0)::int AS enquiry_count
    FROM cli_items ci
    JOIN items it ON it.id = ci.item_id
    LEFT JOIN master_options sh ON sh.id = it.shape_id
    LEFT JOIN master_options gr ON gr.id = it.internal_grade_id
    LEFT JOIN rev ON rev.item_id = ci.item_id
    LEFT JOIN enq ON enq.item_id = ci.item_id
    ORDER BY coalesce(rev.revenue, 0) DESC, coalesce(enq.enquiry_count, 0) DESC, it.item_code ASC
    LIMIT 100
  `)) as unknown as Array<{
    item_id: string;
    item_code: string;
    shape_name: string | null;
    grade_name: string | null;
    revenue: string | null;
    qty: string | null;
    enquiry_count: number;
  }>;

  return rows.map((r) => ({
    itemId: r.item_id,
    itemCode: r.item_code,
    shapeName: r.shape_name,
    gradeName: r.grade_name,
    revenue: Number(r.revenue ?? 0),
    orderedQty: Number(r.qty ?? 0),
    enquiryCount: Number(r.enquiry_count ?? 0),
  }));
}

/* ── Financials surface ───────────────────────────────────────────────── */

export interface ClientFinancials {
  customerTypeNames: string[];
  industryTypeNames: string[];
  gstin: string | null;
  panNo: string | null;
  paymentTerms: string | null;
  creditDays: number | null;
  creditLimit: number | null;
  contacts: ClientContact[];
  addresses: ClientAddress[];
  bankAccounts: ClientBankAccount[];
}

/**
 * The authoritative commercial record — contacts/addresses/banks from the
 * NORMALIZED child tables only, type/industry resolved from the id arrays →
 * master names. No legacy flat mirrors are read for the normalized data.
 */
export async function getClientFinancials(
  clientId: string,
): Promise<ClientFinancials | null> {
  const [row] = await db
    .select({
      customerTypeIds: clients.customerTypeIds,
      industryTypeIds: clients.industryTypeIds,
      gstin: clients.gstin,
      panNo: clients.panNo,
      paymentTerms: clients.paymentTerms,
      creditDays: clients.creditDays,
      creditLimit: clients.creditLimit,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!row) return null;

  const customerTypeIds = row.customerTypeIds ?? [];
  const industryTypeIds = row.industryTypeIds ?? [];
  const allIds = [...new Set([...customerTypeIds, ...industryTypeIds])];
  const nameById = new Map<string, string>();
  if (allIds.length > 0) {
    const opts = await db
      .select({ id: masterOptions.id, name: masterOptions.name })
      .from(masterOptions)
      .where(sql`${masterOptions.id} = ANY(${allIds})`);
    for (const o of opts) nameById.set(o.id, o.name);
  }
  const resolve = (ids: string[]): string[] =>
    ids.map((id) => nameById.get(id)).filter((n): n is string => n != null);

  const [contacts, addresses, bankAccounts] = await Promise.all([
    db
      .select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, clientId))
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.createdAt)),
    getClientAddresses(clientId),
    getClientBankAccounts(clientId),
  ]);

  return {
    customerTypeNames: resolve(customerTypeIds),
    industryTypeNames: resolve(industryTypeIds),
    gstin: row.gstin,
    panNo: row.panNo,
    paymentTerms: row.paymentTerms,
    creditDays: row.creditDays,
    creditLimit: row.creditLimit != null ? Number(row.creditLimit) : null,
    contacts,
    addresses,
    bankAccounts,
  };
}

/* ── Timeline surface ─────────────────────────────────────────────────── */

export type TimelineKind =
  | "audit"
  | "meeting"
  | "enquiry"
  | "quotation"
  | "negotiation"
  | "sales_order";

export interface ClientTimelineEntry {
  kind: TimelineKind;
  id: string;
  label: string;
  sub: string | null;
  date: Date;
  href: string | null;
}

/**
 * A merged, most-recent-first activity feed: client audit_log + client_meetings
 * + the pipeline milestone creations (SM / quote / negotiation / SO) reached via
 * the FK spine. Bounded per-source, merged and sorted in memory.
 */
export async function getClientTimeline(
  clientId: string,
): Promise<ClientTimelineEntry[]> {
  const [audit, meetings, enq, quo, neg, so] = await Promise.all([
    getAuditLog("client", clientId),
    db.execute(sql`
      SELECT id, meeting_no, purpose, meeting_date, created_at
      FROM client_meetings
      WHERE client_id = ${clientId}
      ORDER BY meeting_date DESC
      LIMIT 100
    `) as unknown as Promise<
      Array<{
        id: string;
        meeting_no: string;
        purpose: string;
        meeting_date: string | Date;
        created_at: string | Date;
      }>
    >,
    db
      .select({
        id: inquiries.id,
        smNumber: inquiries.smNumber,
        date: inquiries.createdAt,
      })
      .from(inquiries)
      .where(eq(inquiries.clientId, clientId))
      .orderBy(desc(inquiries.createdAt))
      .limit(100),
    db
      .select({
        id: quotations.id,
        no: quotations.quoteNo,
        date: quotations.createdAt,
      })
      .from(quotations)
      .innerJoin(inquiries, eq(inquiries.id, quotations.inquiryId))
      .where(eq(inquiries.clientId, clientId))
      .orderBy(desc(quotations.createdAt))
      .limit(100),
    db
      .select({
        id: negotiations.id,
        no: negotiations.negotiationNo,
        date: negotiations.createdAt,
      })
      .from(negotiations)
      .innerJoin(inquiries, eq(inquiries.id, negotiations.inquiryId))
      .where(eq(inquiries.clientId, clientId))
      .orderBy(desc(negotiations.createdAt))
      .limit(100),
    db
      .select({
        id: salesOrders.id,
        no: salesOrders.soNo,
        date: salesOrders.createdAt,
      })
      .from(salesOrders)
      .innerJoin(inquiries, eq(inquiries.id, salesOrders.inquiryId))
      .where(eq(inquiries.clientId, clientId))
      .orderBy(desc(salesOrders.createdAt))
      .limit(100),
  ]);

  const out: ClientTimelineEntry[] = [];

  for (const a of audit) {
    out.push({
      kind: "audit",
      id: a.id,
      label:
        a.action === "create"
          ? "Client created"
          : a.action === "update"
            ? "Client updated"
            : `Client ${a.action}`,
      sub: a.actorName,
      date: a.createdAt,
      href: null,
    });
  }
  for (const m of meetings) {
    out.push({
      kind: "meeting",
      id: m.id,
      label: `Meeting ${m.meeting_no}`,
      sub: m.purpose ? m.purpose.replace(/_/g, " ") : null,
      date: new Date(m.meeting_date ?? m.created_at),
      href: null,
    });
  }
  for (const e of enq) {
    if (!e.date) continue;
    out.push({
      kind: "enquiry",
      id: e.id,
      label: `Enquiry ${e.smNumber}`,
      sub: "SM created",
      date: e.date,
      href: `/inquiries/${e.id}`,
    });
  }
  for (const q of quo) {
    if (!q.date) continue;
    out.push({
      kind: "quotation",
      id: q.id,
      label: `Quotation ${q.no}`,
      sub: "Quote created",
      date: q.date,
      href: `/quotations/${q.id}`,
    });
  }
  for (const n of neg) {
    if (!n.date) continue;
    out.push({
      kind: "negotiation",
      id: n.id,
      label: `Negotiation ${n.no}`,
      sub: "Negotiation opened",
      date: n.date,
      href: `/negotiations/${n.id}`,
    });
  }
  for (const s of so) {
    if (!s.date) continue;
    out.push({
      kind: "sales_order",
      id: s.id,
      label: `Sales Order ${s.no}`,
      sub: "Order confirmed",
      date: s.date,
      href: `/sales-orders/${s.id}`,
    });
  }

  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out.slice(0, 200);
}
