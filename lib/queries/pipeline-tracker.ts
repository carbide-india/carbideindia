import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  costings,
  employees,
  inquiries,
  inquiryItems,
  negotiations,
  quotations,
  salesOrders,
  samples,
} from "@/db/schema";

/**
 * Pipeline tracker — one row per inquiry (SM number), with the completion state
 * of every pipeline stage rolled up from the stage tables. Powers the Forms
 * Admin Panel's process view: see at a glance where every deal sits, what is
 * done, what is pending, and which have completed (reached Sales Order) or died.
 *
 * A stage is DONE at its own "approved/won" status (see the map below). Where a
 * stage runs per line item, the inquiry is only DONE when EVERY line reaches it
 * (the codebase's "an SM is as far as its laggard line" rule); if some lines are
 * there and others aren't, it reads ACTIVE. A stage table with no rows yet is
 * PENDING. A rejecting status (not_feasible / order_lost / order_abandoned) is
 * DEAD.
 */

export type StageState = "done" | "active" | "pending" | "dead";

export interface PipelineStageCell {
  key: string;
  label: string;
  state: StageState;
}

export interface PipelineRow {
  inquiryId: string;
  smNumber: string;
  companyName: string;
  enquiryDate: Date | null;
  salesPerson: string | null;
  stages: PipelineStageCell[];
  overall: "completed" | "in_progress" | "dead";
  /** The stage the inquiry is currently sitting on (first not-done, or the last
   *  stage when everything is done). Drives the "where is it stuck" view. */
  currentStageKey: string;
  currentStageLabel: string;
}

/** The nine pipeline stages, in order, with their display labels. */
const STAGE_LABELS: { key: string; label: string }[] = [
  { key: "kyc", label: "KYC" },
  { key: "sample", label: "Sample" },
  { key: "enquiry", label: "Enquiry" },
  { key: "feasibility", label: "Feasibility" },
  { key: "secondary", label: "Secondary" },
  { key: "costing", label: "Costing" },
  { key: "quotation", label: "Quotation" },
  { key: "negotiation", label: "Negotiation" },
  { key: "sales_order", label: "Sales Order" },
];

function keyMap<T extends { inquiryId: string | null }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) if (r.inquiryId) m.set(r.inquiryId, r);
  return m;
}

export async function listPipelineTracker(opts?: { inquiryId?: string }): Promise<PipelineRow[]> {
  // Base: one inquiry (detail view) or all active inquiries, newest first.
  const base = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      clientId: inquiries.clientId,
      enquiryDate: inquiries.enquiryDate,
      enquiryStatus: inquiries.enquiryStatus,
      feasibilityStatus: inquiries.feasibilityStatus,
      salesPerson: employees.name,
    })
    .from(inquiries)
    .leftJoin(employees, eq(employees.id, inquiries.assignedSalesPersonId))
    .where(opts?.inquiryId ? eq(inquiries.id, opts.inquiryId) : eq(inquiries.isArchived, false))
    .orderBy(desc(inquiries.enquiryDate));

  const ids = base.map((b) => b.id);
  if (ids.length === 0) return [];

  // Per-stage grouped aggregates keyed by inquiryId.
  const [itemAgg, sampleAgg, costAgg, quoteAgg, negAgg, soAgg] = await Promise.all([
    db
      .select({
        inquiryId: inquiryItems.inquiryId,
        total: sql<number>`count(*)::int`,
        secApproved: sql<number>`count(*) filter (where ${inquiryItems.secondaryFeasibilityStatus} = 'secondary_feasibility_approved')::int`,
        secDead: sql<number>`count(*) filter (where ${inquiryItems.secondaryFeasibilityStatus} = 'not_feasible')::int`,
      })
      .from(inquiryItems)
      .where(inArray(inquiryItems.inquiryId, ids))
      .groupBy(inquiryItems.inquiryId),
    db
      .select({
        inquiryId: samples.inquiryId,
        total: sql<number>`count(*)::int`,
        processed: sql<number>`count(*) filter (where ${samples.sampleStatus} = 'processed')::int`,
      })
      .from(samples)
      .where(inArray(samples.inquiryId, ids))
      .groupBy(samples.inquiryId),
    db
      .select({
        inquiryId: costings.inquiryId,
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${costings.costingDoneStatus} = 'costing_approved')::int`,
      })
      .from(costings)
      .where(and(inArray(costings.inquiryId, ids), eq(costings.isLatestRevision, true)))
      .groupBy(costings.inquiryId),
    db
      .select({
        inquiryId: quotations.inquiryId,
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${quotations.quotationStatus} = 'quotation_approved' or ${quotations.quoteSent} = true)::int`,
      })
      .from(quotations)
      .where(inArray(quotations.inquiryId, ids))
      .groupBy(quotations.inquiryId),
    db
      .select({
        inquiryId: negotiations.inquiryId,
        total: sql<number>`count(*)::int`,
        won: sql<number>`count(*) filter (where ${negotiations.negotiationStatus} = 'order_won')::int`,
        dead: sql<number>`count(*) filter (where ${negotiations.negotiationStatus} in ('order_lost','order_abandoned'))::int`,
      })
      .from(negotiations)
      .where(inArray(negotiations.inquiryId, ids))
      .groupBy(negotiations.inquiryId),
    db
      .select({
        inquiryId: salesOrders.inquiryId,
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where ${salesOrders.salesOrderStatus} = 'sales_order_approved')::int`,
      })
      .from(salesOrders)
      .where(inArray(salesOrders.inquiryId, ids))
      .groupBy(salesOrders.inquiryId),
  ]);

  const itemM = keyMap(itemAgg);
  const sampleM = keyMap(sampleAgg);
  const costM = keyMap(costAgg);
  const quoteM = keyMap(quoteAgg);
  const negM = keyMap(negAgg);
  const soM = keyMap(soAgg);

  return base.map((b) => {
    const kyc: StageState = b.clientId ? "done" : "active";

    const s = sampleM.get(b.id);
    const sample: StageState = !s || s.total === 0 ? "pending" : s.processed > 0 ? "done" : "active";

    const enquiry: StageState = b.enquiryStatus === "enquiry_approved" ? "done" : "active";

    const feasibility: StageState =
      b.feasibilityStatus === "proceed_to_costing"
        ? "done"
        : b.feasibilityStatus === "not_feasible"
          ? "dead"
          : b.feasibilityStatus === "not_started"
            ? "pending"
            : "active";

    const it = itemM.get(b.id);
    const secondary: StageState =
      !it || it.total === 0
        ? "pending"
        : it.secDead > 0
          ? "dead"
          : it.secApproved >= it.total
            ? "done"
            : it.secApproved > 0
              ? "active"
              : "pending";

    const c = costM.get(b.id);
    const costing: StageState =
      !c || c.total === 0 ? "pending" : c.approved >= c.total ? "done" : "active";

    const q = quoteM.get(b.id);
    const quotation: StageState = !q || q.total === 0 ? "pending" : q.approved > 0 ? "done" : "active";

    const n = negM.get(b.id);
    const negotiation: StageState =
      !n || n.total === 0 ? "pending" : n.won > 0 ? "done" : n.dead > 0 ? "dead" : "active";

    const so = soM.get(b.id);
    const salesOrder: StageState =
      !so || so.total === 0 ? "pending" : so.approved > 0 ? "done" : "active";

    const byKey: Record<string, StageState> = {
      kyc,
      sample,
      enquiry,
      feasibility,
      secondary,
      costing,
      quotation,
      negotiation,
      sales_order: salesOrder,
    };
    const stages: PipelineStageCell[] = STAGE_LABELS.map((s) => ({
      ...s,
      state: byKey[s.key] ?? "pending",
    }));

    const overall: PipelineRow["overall"] =
      salesOrder === "done"
        ? "completed"
        : stages.some((st) => st.state === "dead")
          ? "dead"
          : "in_progress";

    // Current stage = the first not-done stage (where it's sitting), or the last
    // stage once everything is done.
    const firstOpen = stages.find((st) => st.state !== "done");
    const current = firstOpen ?? stages[stages.length - 1]!;

    return {
      inquiryId: b.id,
      smNumber: b.smNumber,
      companyName: b.companyName,
      enquiryDate: b.enquiryDate,
      salesPerson: b.salesPerson,
      stages,
      overall,
      currentStageKey: current.key,
      currentStageLabel: current.label,
    };
  });
}
