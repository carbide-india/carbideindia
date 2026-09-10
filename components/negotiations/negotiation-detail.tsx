"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowUpRight, ChevronDown, Plus, Settings2 } from "lucide-react";
import {
  NEGOTIATION_STAGE_BUCKETS,
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUS_COLORS,
  type NegotiationStatus,
} from "@/db/enums";
import type { Negotiation } from "@/db/schema";
import type {
  NegotiationLineWithSpec,
  RevisableCosting,
} from "@/lib/queries/negotiations";
import type { QuotationFullDetail } from "@/lib/queries/quotations";
import { setNegotiationStatus } from "@/app/(app)/negotiations/actions";
import {
  isNegotiationApprovedForSo,
  NEGOTIATION_OFF_BOARD_STATUSES,
} from "@/lib/negotiations/buckets";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate } from "@/lib/format";
import { StatusPicker } from "@/components/inquiries/status-picker";
import { CustomerPoCard } from "@/components/negotiations/customer-po-card";
import { NegotiationApprovalCard } from "@/components/negotiations/negotiation-approval-card";
import {
  ReviseCostingCard,
  type RevisableProductLabels,
} from "@/components/negotiations/revise-costing-card";
import { NegotiationLog } from "@/components/negotiations/negotiation-log";
import { QuotationDetailReadonly } from "@/components/negotiations/quotation-detail-readonly";

/** Slim link block for the header - resolved server-side from inquiryId. */
export interface NegotiationInquiryLink {
  id: string;
  smNumber: string;
  companyName: string;
}

interface Props {
  negotiation: Negotiation;
  employees: EmployeeOption[];
  inquiryLink: NegotiationInquiryLink | null;
  /** Negotiation product lines — drives the revise-costing picker labels. */
  lines: NegotiationLineWithSpec[];
  /** Revised total of the latest PI (for the customer-PO reconciliation). */
  latestPiTotal: string | null;
  /** Presigned download URL for an already-uploaded customer-PO document. */
  poDownloadUrl: string | null;
  /** Current-revision cost sheets behind this negotiation's product lines —
   *  the pick list for the "not approved → new costing" loop. */
  revisableCostings: RevisableCosting[];
  /** The COMPLETE quotation behind this negotiation, resolved read-only; null
   *  when the negotiation has no linked quotation. */
  quotationDetail: QuotationFullDetail | null;
}

/**
 * Sidebar picker order: the five HOUSE buckets first (Not Started → Draft →
 * Need Info → Pending Approval → Negotiation Approved), then the commercial
 * outcomes. Both axes share one status column, so both must stay pickable —
 * `order_won` in particular is load-bearing for SO provisioning.
 */
const STATUS_PICKER_ORDER: readonly NegotiationStatus[] = [
  ...NEGOTIATION_STAGE_BUCKETS,
  ...NEGOTIATION_OFF_BOARD_STATUSES,
];

/**
 * Negotiation detail (v2, 2026-09). Breadcrumb + header (negotiationNo,
 * company · enquiry date · linked SM chip · status chip), the workflow action
 * cards that actually drive the pipeline (Approve gate, Customer PO → Sales
 * Order, Revise Costing), a timestamped chat-style Negotiation Log, and the
 * complete read-only Quotation Details this negotiation rests on. The old
 * read-only Pricing / Timeline / Lines cards, the single Notes box, the separate
 * remarks panel, the Quote Send strip and the edit form are all gone — folded
 * into the log + the quotation block.
 */
export function NegotiationDetail({
  negotiation,
  employees,
  inquiryLink,
  lines,
  latestPiTotal,
  poDownloadUrl,
  revisableCostings,
  quotationDetail,
}: Props) {
  // Product name per enquiry line, for the revise-costing picker. Read-through
  // from the provenance inquiry line, falling back to the Item spec (§2.4).
  const productLabels = React.useMemo<RevisableProductLabels>(() => {
    const map: RevisableProductLabels = {};
    for (const l of lines) {
      if (!l.inquiryItemId) continue;
      map[l.inquiryItemId] =
        l.ask.custProductName ?? l.spec.gradeNameForCust ?? l.spec.itemCode ?? undefined;
    }
    return map;
  }, [lines]);
  const hasEnquiryLines = lines.some((l) => l.inquiryItemId !== null);

  // Workflow actions (Approve / Customer PO / Revise Costing) are HIDDEN by
  // default — the page is the Log + Quotation Details — and revealed on demand
  // from this toggle when someone actually needs to act on the deal.
  const [actionsOpen, setActionsOpen] = React.useState(false);

  const salesPerson =
    employees.find((e) => e.id === negotiation.salesPersonId)?.name ?? null;
  const createdBy =
    employees.find((e) => e.id === negotiation.createdById)?.name ?? null;

  const statusTone =
    NEGOTIATION_STATUS_COLORS[negotiation.negotiationStatus] ?? "slate";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        <Link
          href={"/negotiations" as Route}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Negotiations
        </Link>
        <span aria-hidden className="text-ink-subtle">
          ·
        </span>
        <span
          aria-current="page"
          className="text-ink-subtle"
          style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
        >
          {negotiation.negotiationNo}
        </span>
      </nav>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 -mt-2">
        <div className="min-w-0">
          <h1 className="font-mono text-[40px] leading-tight tracking-tight text-ink-strong">
            {negotiation.negotiationNo}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14.5px] text-ink-muted">
            {negotiation.companyName ?? "-"}
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
            {negotiation.enquiryDate ? formatDate(negotiation.enquiryDate) : "No enquiry date"}
            {inquiryLink && (
              <>
                <span aria-hidden className="text-ink-subtle">
                  ·
                </span>
                <Link
                  href={`/inquiries/${inquiryLink.id}` as Route}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-soft px-2.5 py-1 text-[13px] font-semibold text-ink-strong hover:border-hairline-strong transition-colors"
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                    {inquiryLink.smNumber}
                  </span>
                  <ArrowUpRight size={13} strokeWidth={2.4} className="text-ink-subtle" />
                </Link>
              </>
            )}
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-pill text-[12px] font-bold"
              style={{
                background: `color-mix(in srgb, var(--color-${statusTone}) 12%, transparent)`,
                color: `var(--color-${statusTone}-deep)`,
                border: `1px solid color-mix(in srgb, var(--color-${statusTone}) 30%, transparent)`,
              }}
            >
              {NEGOTIATION_STATUS_LABELS[negotiation.negotiationStatus]}
            </span>
          </p>
        </div>
        <Link
          href={"/negotiations/new" as Route}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-strong hover:border-hairline-strong hover:bg-surface-soft transition-colors"
        >
          <Plus size={14} strokeWidth={2.6} />
          New Negotiation
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] items-start">
        {/* ── Main column ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Workflow actions — HIDDEN by default, revealed only when asked for.
              They drive the pipeline (approve gate → Issue Sales Order, Customer
              PO → Sales Order, not-approved → revise costing), so they stay
              available, but they no longer clutter the page until needed. */}
          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={() => setActionsOpen((o) => !o)}
              aria-expanded={actionsOpen}
              aria-controls="negotiation-workflow-actions"
              className="flex w-full items-center gap-3 rounded-section border border-hairline bg-surface-card px-5 py-3.5 text-left transition-colors hover:border-hairline-strong hover:bg-surface-soft"
              style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
            >
              <Settings2 size={16} strokeWidth={2.2} className="shrink-0 text-brand" />
              <span className="text-[13.5px] font-extrabold text-ink-strong">
                Workflow Actions
              </span>
              <span className="hidden text-[12px] font-semibold text-ink-subtle sm:inline">
                Approve · Customer PO · Revise Costing
              </span>
              <ChevronDown
                size={17}
                strokeWidth={2.4}
                className="ml-auto shrink-0 text-ink-subtle transition-transform"
                style={{ transform: actionsOpen ? "rotate(180deg)" : "none" }}
              />
            </button>

            {/* Always mounted so aria-controls resolves; visibility toggles via
                the `hidden` class (Tailwind display:none) rather than the HTML
                attribute, which the `flex` class would otherwise override. */}
            <div
              id="negotiation-workflow-actions"
              className={actionsOpen ? "flex flex-col gap-6" : "hidden"}
            >
              <NegotiationApprovalCard
                negotiationId={negotiation.id}
                status={negotiation.negotiationStatus}
              />

              <CustomerPoCard
                negotiationId={negotiation.id}
                stage={negotiation.negotiationStage}
                po={{
                  customerPoNo: negotiation.customerPoNo,
                  customerPoDate: negotiation.customerPoDate,
                  customerPoLink: negotiation.customerPoLink,
                  customerPoRemarks: negotiation.customerPoRemarks,
                  poMatchStatus: negotiation.poMatchStatus,
                }}
                latestPiTotal={latestPiTotal}
                poDownloadUrl={poDownloadUrl}
                approvedForSo={isNegotiationApprovedForSo(negotiation.negotiationStatus)}
              />

              <ReviseCostingCard
                negotiationId={negotiation.id}
                costings={revisableCostings}
                productLabels={productLabels}
                hasLines={hasEnquiryLines}
              />
            </div>
          </div>

          {/* The timestamped chat log — replaces the old Notes box + remarks panel. */}
          <NegotiationLog negotiationId={negotiation.id} />

          {/* Complete read-only quotation this negotiation rests on. */}
          {quotationDetail ? (
            <QuotationDetailReadonly detail={quotationDetail} />
          ) : (
            <section
              className="bg-surface-card rounded-section border border-hairline p-6"
              style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
            >
              <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-brand">
                Quotation Details
              </h2>
              <p className="mt-2 text-[13px] text-ink-soft">
                No quotation is linked to this negotiation yet.
              </p>
            </section>
          )}
        </div>

        {/* ── Sticky sidebar ─────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 flex flex-col gap-4 rounded-section border border-hairline bg-surface-card p-5">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              Negotiation Status
            </span>
            <StatusPicker
              value={negotiation.negotiationStatus}
              options={STATUS_PICKER_ORDER}
              labels={NEGOTIATION_STATUS_LABELS}
              tones={NEGOTIATION_STATUS_COLORS}
              onPick={(next) => setNegotiationStatus(negotiation.id, next)}
              ariaLabel="Negotiation status"
              // Once approved, the status is locked here — nobody can change it
              // from this dropdown.
              disabled={isNegotiationApprovedForSo(negotiation.negotiationStatus)}
            />
          </div>
          <SidebarRow label="Sales Person" value={salesPerson ?? "-"} />
          <SidebarRow label="Created" value={formatDate(negotiation.createdAt)} />
          {createdBy && <SidebarRow label="Created By" value={createdBy} />}
          <SidebarRow label="Last Updated" value={formatDate(negotiation.updatedAt)} />
          <Link
            href={"/negotiations" as Route}
            className="mt-1 inline-flex items-center gap-1.5 border-t border-hairline pt-4 text-[13px] font-semibold text-ink-muted hover:text-ink-strong transition-colors"
          >
            <ArrowLeft size={13} strokeWidth={2.4} />
            Open Register
          </Link>
        </aside>
      </div>
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong">{value}</span>
    </div>
  );
}
