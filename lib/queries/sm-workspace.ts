import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients,
  employees,
  inquiries,
  inquiryItems,
  items,
  negotiationItems,
  negotiations,
  quotationItems,
  quotations,
  salesOrderItems,
  salesOrders,
  type Negotiation,
  type Quotation,
  type SalesOrder,
} from "@/db/schema";
import type { CostingDoneStatus, EnquiryStatus, InquiryPriority } from "@/db/enums";
import {
  itemFurthestStage,
  smRollupStage,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/flow/derive-stage";
import {
  specMasterAliases,
  resolveSpecsByItemId,
  resolveCustomerAskByInquiryItemId,
  EMPTY_SPEC,
  EMPTY_CUSTOMER_ASK,
  type ResolvedSpec,
  type ResolvedCustomerAsk,
} from "@/lib/flow/spec-resolve";
import { getChosenCostingsForInquiry } from "@/lib/queries/costings";
import { getItemWhereUsed, type ItemWhereUsed } from "@/lib/queries/item-where-used";
import { getItemDocuments, type ItemDocument } from "@/lib/queries/item-documents";
import { getAuditLog, type AuditEntry } from "@/lib/queries/audit";

/**
 * SM Workspace queries (ERP redesign — Phase 9d, §9 "Enquiry SM Workspace").
 *
 * The read layer behind the pipeline cockpit. Every field resolves THROUGH FKs
 * (client via `inquiries.clientId → clients.name`, sales via
 * `assignedSalesPersonId`, product spec via `inquiry_items.item_id → items.*`);
 * the pipeline stage is DERIVED server-side by `derive-stage.ts` alone — the SM
 * stepper is `smRollupStage({ lineStages })` (the MINIMUM per-line furthest
 * stage: a multi-product SM is only as far as its laggard line). No stored
 * counter, snapshot mirror, or free-set status column is read for stage.
 */

/* ── Per-line stage roll-up ────────────────────────────────────────────────── */

interface LineStage {
  lineId: string;
  itemId: string | null;
  stageIndex: number;
}

/**
 * Each inquiry line's FURTHEST pipeline stage, from cheap per-line COUNTs of the
 * referencing costing / quotation / negotiation / SO / job-card rows fed to
 * `itemFurthestStage`. A draft (incomplete-spec) item clamps its line to Enquiry
 * — so an unfinished product legitimately holds the SM roll-up back. ONE indexed
 * pass (correlated sub-counts on the per-line FK columns), ordered by sort.
 */
async function perLineStages(inquiryId: string): Promise<LineStage[]> {
  const rows = (await db.execute(sql`
    SELECT ii.id AS line_id,
           ii.item_id AS item_id,
           i.status  AS item_status,
           (SELECT count(*) FROM costings         c   WHERE c.inquiry_item_id  = ii.id)::int AS costing,
           (SELECT count(*) FROM quotation_items  qi  WHERE qi.inquiry_item_id = ii.id)::int AS quotation,
           (SELECT count(*) FROM negotiation_items ni WHERE ni.inquiry_item_id = ii.id)::int AS negotiation,
           (SELECT count(*) FROM sales_order_items soi WHERE soi.inquiry_item_id = ii.id)::int AS sales_order,
           (SELECT count(*) FROM job_cards        jc  WHERE jc.inquiry_item_id  = ii.id)::int AS job_card
      FROM inquiry_items ii
      LEFT JOIN items i ON i.id = ii.item_id
     WHERE ii.inquiry_id = ${inquiryId}
     ORDER BY ii.sort_order ASC
  `)) as unknown as Array<{
    line_id: string;
    item_id: string | null;
    item_status: string | null;
    costing: number;
    quotation: number;
    negotiation: number;
    sales_order: number;
    job_card: number;
  }>;

  return rows.map((r) => {
    const resolved = itemFurthestStage({
      status: (r.item_status as LineStageSignalStatus) ?? undefined,
      inquiryCount: 1,
      costingCount: Number(r.costing) || 0,
      quotationCount: Number(r.quotation) || 0,
      negotiationCount: Number(r.negotiation) || 0,
      salesOrderCount: Number(r.sales_order) || 0,
      jobCardCount: Number(r.job_card) || 0,
    });
    return { lineId: r.line_id, itemId: r.item_id, stageIndex: resolved.index };
  });
}

type LineStageSignalStatus = "draft" | "active" | "archived" | "superseded";

/* ── Header ────────────────────────────────────────────────────────────────── */

/** The next canonical action derived from the current stage (§9.5). */
export interface NextAction {
  /** The stage the SM is trying to reach next. */
  stage: PipelineStage;
  /** Imperative label for the header pill (e.g. "Cost the products"). */
  label: string;
  /** A one-line hint of what/why, or null. */
  hint: string | null;
  /** The workspace tab this action lives on (drives the header pill click). */
  tab: string | null;
}

/** Sticky-shell fields + derived stepper position for the SM header. */
export interface InquiryWorkspaceHeader {
  id: string;
  smNumber: string;
  /** Derived title: primary product name (+ line count shown separately). */
  title: string;
  productCount: number;
  priority: InquiryPriority;
  enquiryStatus: EnquiryStatus;
  clientId: string | null;
  /** Resolved live via clientId → clients.name (falls back to the snapshot). */
  clientName: string;
  salesPersonId: string | null;
  salesPersonName: string | null;
  enquiryDate: Date;
  createdAt: Date;
  updatedAt: Date;
  smFolderLink: string | null;
  isArchived: boolean;
  /** Server-derived pipeline position (smRollupStage). */
  stage: PipelineStage;
  stageIndex: number;
  stageLabel: string;
  nextAction: NextAction | null;
}

function truncate(v: string, max: number): string {
  const s = v.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function nextActionFor(stage: PipelineStage): NextAction | null {
  switch (stage) {
    case "enquiry":
      return { stage: "feasibility", label: "Run primary feasibility", hint: "Verify shape, grade, tolerance & condition before costing.", tab: "feasibility" };
    case "feasibility":
      return { stage: "costing", label: "Cost the products", hint: "Build BU/BO + in-house costing per product line.", tab: "costing" };
    case "costing":
      return { stage: "quotation", label: "Generate quotation", hint: "Chosen costings are ready to quote to the customer.", tab: "quotation" };
    case "quotation":
      return { stage: "negotiation", label: "Send & negotiate", hint: "Send the quotation, then track the negotiation.", tab: "negotiation" };
    case "negotiation":
      return { stage: "sales_order", label: "Convert to Sales Order", hint: "Mark the order won and raise the sales order.", tab: "sales-order" };
    case "sales_order":
      return { stage: "job_card", label: "Release to production", hint: "Confirm the order and create a job card.", tab: "sales-order" };
    default:
      return null;
  }
}

export async function getInquiryWorkspaceHeader(
  id: string,
): Promise<InquiryWorkspaceHeader | null> {
  const [row] = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      productDescription: inquiries.productDescription,
      priority: inquiries.priority,
      enquiryStatus: inquiries.enquiryStatus,
      clientId: inquiries.clientId,
      clientName: clients.name,
      salesPersonId: inquiries.assignedSalesPersonId,
      salesPersonName: employees.name,
      enquiryDate: inquiries.enquiryDate,
      createdAt: inquiries.createdAt,
      updatedAt: inquiries.updatedAt,
      smFolderLink: inquiries.smFolderLink,
      isArchived: inquiries.isArchived,
    })
    .from(inquiries)
    .leftJoin(clients, eq(clients.id, inquiries.clientId))
    .leftJoin(employees, eq(employees.id, inquiries.assignedSalesPersonId))
    .where(eq(inquiries.id, id))
    .limit(1);
  if (!row) return null;

  // Primary product name (first line by sort order) drives the title.
  const [firstLine] = await db
    .select({ name: inquiryItems.custProductName })
    .from(inquiryItems)
    .where(eq(inquiryItems.inquiryId, id))
    .orderBy(asc(inquiryItems.sortOrder))
    .limit(1);

  const lineStages = await perLineStages(id);
  const resolved = smRollupStage({
    enquiryStatus: row.enquiryStatus,
    lineStages: lineStages.map((l) => l.stageIndex),
  });

  const title = truncate(firstLine?.name ?? row.productDescription ?? row.smNumber, 64);

  return {
    id: row.id,
    smNumber: row.smNumber,
    title,
    productCount: lineStages.length,
    priority: row.priority,
    enquiryStatus: row.enquiryStatus,
    clientId: row.clientId,
    clientName: row.clientName ?? row.companyName,
    salesPersonId: row.salesPersonId,
    salesPersonName: row.salesPersonName ?? null,
    enquiryDate: row.enquiryDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    smFolderLink: row.smFolderLink,
    isArchived: row.isArchived,
    stage: resolved.stage,
    stageIndex: resolved.index,
    stageLabel: PIPELINE_STAGE_LABELS[resolved.stage],
    nextAction: nextActionFor(resolved.stage),
  };
}

/* ── Products (the card grid) ──────────────────────────────────────────────── */

/** One product card over inquiry_items with spec resolved through the Item. */
export interface InquiryProductCard {
  id: string;
  sortOrder: number;
  itemId: string;
  itemCode: string | null;
  itemStatus: string | null;
  /** Item spec is incomplete (draft) — a soft "not fully linked" state. */
  isDraft: boolean;
  /** No usable item code yet — the loud amber ⚠ "no-item" badge fires on this. */
  noItem: boolean;
  // Customer-scoped ask (single-sourced on the line).
  custProductName: string | null;
  custDrawingNo: string | null;
  drawingRevisionNo: string | null;
  gradeCustomer: string | null;
  quantityNos: string | null;
  quantityUom: string;
  // Spec resolved read-through from the linked Item.
  shapeName: string | null;
  gradeName: string | null;
  toleranceName: string | null;
  conditionName: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionNotes: string | null;
  /** A drawing/document is filed against the linked Item. */
  hasDrawing: boolean;
  // Chosen-costing overlay.
  costingFinalCost: string | null;
  costingDoneStatus: CostingDoneStatus | null;
  // Per-line furthest pipeline stage (for a mini status).
  lineStageIndex: number;
  lineStage: PipelineStage;
}

export async function getInquiryProducts(
  inquiryId: string,
): Promise<InquiryProductCard[]> {
  const m = specMasterAliases();
  const [rows, chosen, lineStages] = await Promise.all([
    db
      .select({
        id: inquiryItems.id,
        sortOrder: inquiryItems.sortOrder,
        itemId: inquiryItems.itemId,
        custProductName: inquiryItems.custProductName,
        custDrawingNo: inquiryItems.custDrawingNo,
        drawingRevisionNo: inquiryItems.drawingRevisionNo,
        gradeCustomer: inquiryItems.gradeCustomer,
        quantityNos: inquiryItems.quantityNos,
        quantityUom: inquiryItems.quantityUom,
        itemCode: items.itemCode,
        itemStatus: items.status,
        shapeName: m.shape.name,
        gradeName: m.grade.name,
        toleranceName: m.tolerance.name,
        conditionName: m.condition.name,
        outerDia: items.outerDia,
        innerDia: items.innerDia,
        length: items.length,
        width: items.width,
        thickness: items.thickness,
        dimensionNotes: items.dimensionNotes,
        hasDrawing: sql<boolean>`exists(select 1 from documents d where d.item_id = ${inquiryItems.itemId})`,
      })
      .from(inquiryItems)
      .leftJoin(items, eq(items.id, inquiryItems.itemId))
      .leftJoin(m.shape, eq(items.shapeId, m.shape.id))
      .leftJoin(m.grade, eq(items.internalGradeId, m.grade.id))
      .leftJoin(m.tolerance, eq(items.toleranceId, m.tolerance.id))
      .leftJoin(m.condition, eq(items.conditionId, m.condition.id))
      .where(eq(inquiryItems.inquiryId, inquiryId))
      .orderBy(asc(inquiryItems.sortOrder)),
    getChosenCostingsForInquiry(inquiryId),
    perLineStages(inquiryId),
  ]);

  const costByLine = new Map(chosen.map((c) => [c.inquiryItemId, c]));
  const stageByLine = new Map(lineStages.map((l) => [l.lineId, l.stageIndex]));

  return rows.map((r) => {
    const cost = costByLine.get(r.id);
    const stageIdx = stageByLine.get(r.id) ?? 0;
    const isDraft = r.itemStatus === "draft";
    return {
      id: r.id,
      sortOrder: r.sortOrder,
      itemId: r.itemId,
      itemCode: r.itemCode,
      itemStatus: r.itemStatus,
      isDraft,
      noItem: r.itemCode == null || isDraft,
      custProductName: r.custProductName,
      custDrawingNo: r.custDrawingNo,
      drawingRevisionNo: r.drawingRevisionNo,
      gradeCustomer: r.gradeCustomer,
      quantityNos: r.quantityNos,
      quantityUom: r.quantityUom,
      shapeName: r.shapeName,
      gradeName: r.gradeName,
      toleranceName: r.toleranceName,
      conditionName: r.conditionName,
      outerDia: r.outerDia,
      innerDia: r.innerDia,
      length: r.length,
      width: r.width,
      thickness: r.thickness,
      dimensionNotes: r.dimensionNotes,
      hasDrawing: Boolean(r.hasDrawing),
      costingFinalCost: cost?.finalCostPerPiece ?? null,
      costingDoneStatus: cost?.costingDoneStatus ?? null,
      lineStageIndex: stageIdx,
      lineStage: stageKeyFromIndex(stageIdx),
    };
  });
}

// Small local helper to map an index → its stage key (never throws).
function stageKeyFromIndex(index: number): PipelineStage {
  const clamped = Math.min(Math.max(index, 0), 9);
  const key = (
    [
      "enquiry",
      "feasibility",
      "costing",
      "quotation",
      "negotiation",
      "sales_order",
      "job_card",
      "production",
      "dispatch",
      "invoice",
    ] as const
  )[clamped];
  return key ?? "enquiry";
}

/* ── Product drawer bundles (Open Item ⧉ / History) ────────────────────────── */

/** Everything the right-side product drawer needs, per linked Item. */
export interface ProductDrawerData {
  whereUsed: ItemWhereUsed;
  documents: ItemDocument[];
  audit: AuditEntry[];
}

/**
 * Pre-resolve the drawer bundle for every product of the SM, keyed by
 * inquiry_item id (an SM has a handful of lines). Reuses the Item where-used
 * graph, item documents and item audit — no new joins. Distinct itemIds are
 * fetched once and mapped back to each referencing line.
 */
export async function getInquiryProductDrawers(
  inquiryId: string,
): Promise<Record<string, ProductDrawerData>> {
  const lines = await db
    .select({ id: inquiryItems.id, itemId: inquiryItems.itemId })
    .from(inquiryItems)
    .where(eq(inquiryItems.inquiryId, inquiryId))
    .orderBy(asc(inquiryItems.sortOrder));

  const itemIds = Array.from(new Set(lines.map((l) => l.itemId)));
  const bundles = await Promise.all(
    itemIds.map(async (itemId) => {
      const [whereUsed, documents, audit] = await Promise.all([
        getItemWhereUsed(itemId),
        getItemDocuments(itemId),
        getAuditLog("item", itemId),
      ]);
      return [itemId, { whereUsed, documents, audit }] as const;
    }),
  );
  const byItem = new Map(bundles);

  const out: Record<string, ProductDrawerData> = {};
  for (const l of lines) {
    const bundle = byItem.get(l.itemId);
    if (bundle) out[l.id] = bundle;
  }
  return out;
}

/* ── Stage tabs (Quotation / Negotiation / Sales Order) ────────────────────── */

/** A stage line resolved through its Item (spec) + provenance line (ask). */
export interface StageLine {
  id: string;
  sortOrder: number;
  spec: ResolvedSpec;
  ask: ResolvedCustomerAsk;
  qty: string | null;
  /** Display price: the frozen unit_price if sent/confirmed, else the live draft. */
  unitPrice: string | null;
  /** True once the line's commercial snapshot is frozen (sent/confirmed). */
  frozen: boolean;
}

export interface StageTab<TRecord> {
  /** The most-recent record at this stage for the SM (or null). */
  record: TRecord | null;
  /** How many records exist at this stage for the SM. */
  recordCount: number;
  lines: StageLine[];
}

async function resolveLines(
  raw: Array<{
    id: string;
    sortOrder: number;
    itemId: string | null;
    inquiryItemId: string | null;
    qty: string | null;
    unitPrice: string | null;
    frozenAt: Date | null;
  }>,
): Promise<StageLine[]> {
  const [specs, asks] = await Promise.all([
    resolveSpecsByItemId(raw.map((r) => r.itemId)),
    resolveCustomerAskByInquiryItemId(raw.map((r) => r.inquiryItemId)),
  ]);
  return raw.map((r) => ({
    id: r.id,
    sortOrder: r.sortOrder,
    spec: (r.itemId && specs.get(r.itemId)) || EMPTY_SPEC,
    ask: (r.inquiryItemId && asks.get(r.inquiryItemId)) || EMPTY_CUSTOMER_ASK,
    qty: r.qty,
    unitPrice: r.unitPrice,
    frozen: r.frozenAt != null,
  }));
}

export async function getInquiryQuotationTab(
  inquiryId: string,
): Promise<StageTab<Quotation>> {
  const records = await db
    .select()
    .from(quotations)
    .where(eq(quotations.inquiryId, inquiryId))
    .orderBy(desc(quotations.createdAt));
  const record = records[0] ?? null;
  if (!record) return { record: null, recordCount: 0, lines: [] };

  const raw = await db
    .select({
      id: quotationItems.id,
      sortOrder: quotationItems.sortOrder,
      itemId: quotationItems.itemId,
      inquiryItemId: quotationItems.inquiryItemId,
      qty: quotationItems.qty,
      unitPrice: sql<string | null>`coalesce(${quotationItems.unitPrice}, ${quotationItems.quotePrice})`,
      frozenAt: quotationItems.frozenAt,
    })
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, record.id))
    .orderBy(asc(quotationItems.sortOrder));

  return { record, recordCount: records.length, lines: await resolveLines(raw) };
}

export async function getInquiryNegotiationTab(
  inquiryId: string,
): Promise<StageTab<Negotiation>> {
  const records = await db
    .select()
    .from(negotiations)
    .where(eq(negotiations.inquiryId, inquiryId))
    .orderBy(desc(negotiations.createdAt));
  const record = records[0] ?? null;
  if (!record) return { record: null, recordCount: 0, lines: [] };

  const raw = await db
    .select({
      id: negotiationItems.id,
      sortOrder: negotiationItems.sortOrder,
      itemId: negotiationItems.itemId,
      inquiryItemId: negotiationItems.inquiryItemId,
      qty: negotiationItems.qty,
      unitPrice: sql<string | null>`coalesce(${negotiationItems.unitPrice}, ${negotiationItems.negotiation}, ${negotiationItems.quotePrice})`,
      frozenAt: negotiationItems.frozenAt,
    })
    .from(negotiationItems)
    .where(eq(negotiationItems.negotiationId, record.id))
    .orderBy(asc(negotiationItems.sortOrder));

  return { record, recordCount: records.length, lines: await resolveLines(raw) };
}

export async function getInquirySalesOrderTab(
  inquiryId: string,
): Promise<StageTab<SalesOrder>> {
  const records = await db
    .select()
    .from(salesOrders)
    .where(eq(salesOrders.inquiryId, inquiryId))
    .orderBy(desc(salesOrders.createdAt));
  const record = records[0] ?? null;
  if (!record) return { record: null, recordCount: 0, lines: [] };

  const raw = await db
    .select({
      id: salesOrderItems.id,
      sortOrder: salesOrderItems.sortOrder,
      itemId: salesOrderItems.itemId,
      inquiryItemId: salesOrderItems.inquiryItemId,
      qty: salesOrderItems.qty,
      unitPrice: sql<string | null>`coalesce(${salesOrderItems.unitPrice}, ${salesOrderItems.quotePrice})`,
      frozenAt: salesOrderItems.frozenAt,
    })
    .from(salesOrderItems)
    .where(eq(salesOrderItems.salesOrderId, record.id))
    .orderBy(asc(salesOrderItems.sortOrder));

  return { record, recordCount: records.length, lines: await resolveLines(raw) };
}

/** The three commercial stage tabs in one round of concurrent loads. */
export interface InquiryStageTabs {
  quotation: StageTab<Quotation>;
  negotiation: StageTab<Negotiation>;
  salesOrder: StageTab<SalesOrder>;
}

export async function getInquiryStageTabs(
  inquiryId: string,
): Promise<InquiryStageTabs> {
  const [quotation, negotiation, salesOrder] = await Promise.all([
    getInquiryQuotationTab(inquiryId),
    getInquiryNegotiationTab(inquiryId),
    getInquirySalesOrderTab(inquiryId),
  ]);
  return { quotation, negotiation, salesOrder };
}
