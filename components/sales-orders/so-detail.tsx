"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, Loader2, Plus, ShieldCheck } from "lucide-react";
import {
  SALES_ORDER_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
} from "@/db/enums";
import type { SalesOrder } from "@/db/schema";
import type { QuotationPdfModel } from "@/lib/queries/quotations";
import {
  approveSalesOrder,
  setSalesOrderSent,
} from "@/app/(app)/sales-orders/actions";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate, formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Segmented } from "@/components/inquiries/form-field";
import { QuotationDetailReadonly } from "@/components/negotiations/quotation-detail-readonly";

/** Slim link block for the header - resolved server-side from inquiryId. */
export interface SalesOrderInquiryLink {
  id: string;
  smNumber: string;
  companyName: string;
}

interface Props {
  salesOrder: SalesOrder;
  employees: EmployeeOption[];
  inquiryLink: SalesOrderInquiryLink | null;
  /** The quotation this sales order rests on (latest revision) as the PDF model,
   *  rendered read-only as an on-screen replica of the official quotation form;
   *  null when the order has no linked quotation. */
  quotationPdf: QuotationPdfModel | null;
  /** Whether the current viewer may approve — server-resolved via the approval
   *  gate. The Approve control is hidden for everyone else (the server re-checks). */
  canApprove: boolean;
}

const SO_SENT_OPTIONS = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

/** numeric-string → ₹, em-dash when unset/unparseable. */
function money(value: string | null): string {
  if (value == null || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "-";
}

/**
 * Sales Order detail (v2, 2026-09). Mirrors the Negotiation detail: breadcrumb +
 * header, a horizontal META BAR on top (status + Approve + SO Sent + sales
 * person / quote price / created / by / last updated + Open Register), then the
 * full-width read-only Sales Order document — the same bordered form the
 * quotation prints, driven by the linked quotation (latest revision). The Client
 * PO capture and issue-copy actions were removed from this page: the customer PO
 * is now tracked from the register's Customer PO Confirmation column.
 */
export function SoDetail({
  salesOrder,
  employees,
  inquiryLink,
  quotationPdf,
  canApprove,
}: Props) {
  const router = useRouter();
  const [sentPending, startSentTransition] = React.useTransition();
  const [approving, setApproving] = React.useState(false);

  const salesPerson =
    employees.find((e) => e.id === salesOrder.salesPersonId)?.name ?? null;
  const createdBy =
    employees.find((e) => e.id === salesOrder.createdById)?.name ?? null;

  const status = salesOrder.salesOrderStatus;
  const isApproved = status === "sales_order_approved";
  const tone = SALES_ORDER_STATUS_COLORS[status] ?? "slate";

  function onToggleSent(next: boolean) {
    startSentTransition(async () => {
      const res = await setSalesOrderSent(salesOrder.id, next);
      if (res.ok) {
        fireToast({ message: next ? "Marked SO sent." : "Marked SO not sent." });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  async function onApprove() {
    setApproving(true);
    try {
      const res = await approveSalesOrder(salesOrder.id);
      if (res.ok) {
        fireToast({ type: "success", message: "Sales order approved." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        <Link
          href={"/sales-orders" as Route}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Sales Orders
        </Link>
        <span aria-hidden className="text-ink-subtle">
          ·
        </span>
        <span
          aria-current="page"
          className="text-ink-subtle"
          style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
        >
          {salesOrder.soNo}
        </span>
      </nav>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 -mt-2">
        <div className="min-w-0">
          <h1 className="font-mono text-[40px] leading-tight tracking-tight text-ink-strong">
            {salesOrder.soNo}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14.5px] text-ink-muted">
            {salesOrder.companyName ?? "-"}
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
            {salesOrder.enquiryDate ? formatDate(salesOrder.enquiryDate) : "No enquiry date"}
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
          </p>
        </div>
        <Link
          href={"/sales-orders/new" as Route}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-strong hover:border-hairline-strong hover:bg-surface-soft transition-colors"
        >
          <Plus size={14} strokeWidth={2.6} />
          New Sales Order
        </Link>
      </header>

      {/* ── Meta bar (was the right sidebar) — status + Approve + facts, on top ─ */}
      <section
        className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-section border border-hairline bg-surface-card px-5 py-4"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        {/* Status + the Approve action */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
            Sales Order Status
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center px-3 py-1.5 rounded-pill text-[13px] font-bold"
              style={{
                background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
                color: `var(--color-${tone}-deep)`,
                border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
              }}
            >
              {SALES_ORDER_STATUS_LABELS[status]}
            </span>
            {canApprove && !isApproved && (
              <button
                type="button"
                onClick={() => void onApprove()}
                disabled={approving}
                className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-[#16a34a] bg-[#16a34a]/10 px-3 text-[12.5px] font-extrabold text-[#15803d] transition-colors hover:bg-[#16a34a]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approving ? (
                  <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} />
                ) : (
                  <Check size={13} strokeWidth={2.8} />
                )}
                Approve Sales Order
              </button>
            )}
            {isApproved && (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#15803d]">
                <ShieldCheck size={13} strokeWidth={2.6} />
                Approved
              </span>
            )}
          </div>
        </div>

        {/* SO Sent toggle — the SO's send-state flag (moved up from the sidebar). */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
            SO Sent
          </span>
          <div className={sentPending ? "opacity-60 pointer-events-none" : undefined}>
            <Segmented
              options={SO_SENT_OPTIONS}
              value={salesOrder.customerSoSent ? "yes" : "no"}
              onChange={(v) => onToggleSent(v === "yes")}
              allowClear={false}
              ariaLabel="SO sent"
            />
          </div>
        </div>

        <MetaField label="Sales Person" value={salesPerson ?? "-"} />
        <MetaField label="Quote Price" value={money(salesOrder.quotePrice)} />
        <MetaField label="Created" value={formatDate(salesOrder.createdAt)} />
        {createdBy && <MetaField label="Created By" value={createdBy} />}
        <MetaField label="Last Updated" value={formatDate(salesOrder.updatedAt)} />
        <Link
          href={"/sales-orders" as Route}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={2.4} />
          Open Register
        </Link>
      </section>

      {/* ── Content (full width) — the read-only Sales Order document ── */}
      <div className="flex flex-col gap-6 min-w-0">
        {quotationPdf ? (
          <QuotationDetailReadonly
            model={quotationPdf}
            heading="Sales Order Details"
            documentTitle="SALES ORDER"
          />
        ) : (
          <section
            className="bg-surface-card rounded-section border border-hairline p-6"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-brand">
              Sales Order Details
            </h2>
            <p className="mt-2 text-[13px] text-ink-soft">
              No quotation is linked to this sales order yet.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong">{value}</span>
    </div>
  );
}
