"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Loader2, Plus } from "lucide-react";
import {
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUS_COLORS,
  type NegotiationStatus,
} from "@/db/enums";
import type { Negotiation } from "@/db/schema";
import type { QuotationPdfModel } from "@/lib/queries/quotations";
import {
  setNegotiationStatus,
  reviseQuoteFromNegotiation,
} from "@/app/(app)/negotiations/actions";
import { isNegotiationApprovedForSo } from "@/lib/negotiations/buckets";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { StatusPicker } from "@/components/inquiries/status-picker";
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
  /** The quotation behind this negotiation (latest revision) as the PDF model,
   *  rendered read-only as an on-screen replica of the official quotation PDF;
   *  null when the negotiation has no linked quotation. */
  quotationPdf: QuotationPdfModel | null;
}

/**
 * The statuses a negotiation can be set to from the dropdown. Working states
 * first, then the three outcomes. Deliberately EXCLUDES the retired approval
 * ladder (Draft / Pending Approval / Negotiation Approved / Not Approved) and
 * Cancelled: a negotiation tracks a conversation and ends Won / Lost /
 * Abandoned, never "approved", and Cancelled was folded into Abandoned.
 */
const STATUS_PICKER_ORDER: readonly NegotiationStatus[] = [
  "to_start",
  "need_info",
  "follow_up_15d",
  "follow_up_1m",
  "follow_up_45d",
  "follow_up_2m",
  "revision",
  "on_hold",
  "verbal_yes",
  "need_help",
  "order_won",
  "order_lost",
  "order_abandoned",
];

/**
 * Negotiation detail (v3, 2026-09). Breadcrumb + header (negotiationNo, company ·
 * enquiry date · linked SM chip), a horizontal META BAR at the top (status
 * picker + sales person / created / by / last updated + Open Register), then the
 * full-width Negotiation Log and the read-only Quotation Details (latest
 * revision). The status now lives only in the bar's picker — no duplicate chip.
 * "Revise Quote" (from the picker) opens a fresh quotation revision; marking a
 * deal Won provisions its Sales Order automatically.
 */
export function NegotiationDetail({
  negotiation,
  employees,
  inquiryLink,
  quotationPdf,
}: Props) {
  const router = useRouter();

  // "Revise Quote" is not a plain status set — it opens a quotation revision, so
  // it asks for a reason first (which lands in the quote's revision history).
  const [reviseOpen, setReviseOpen] = React.useState(false);
  const [reviseReason, setReviseReason] = React.useState("");
  const [revising, setRevising] = React.useState(false);

  const salesPerson =
    employees.find((e) => e.id === negotiation.salesPersonId)?.name ?? null;
  const createdBy =
    employees.find((e) => e.id === negotiation.createdById)?.name ?? null;

  async function submitRevise() {
    const reason = reviseReason.trim();
    if (reason.length < 3) {
      fireToast({ message: "Say why the quote is being revised." });
      return;
    }
    setRevising(true);
    try {
      const res = await reviseQuoteFromNegotiation({
        negotiationId: negotiation.id,
        reason,
      });
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({
        type: "success",
        message: `Quotation revised — R${res.revisionNo - 1} created.`,
      });
      setReviseOpen(false);
      setReviseReason("");
      router.refresh();
    } finally {
      setRevising(false);
    }
  }

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

      {/* ── Meta bar (was the right sidebar) — status + facts, on top ─── */}
      <section
        className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-section border border-hairline bg-surface-card px-5 py-4"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
            Negotiation Status
          </span>
          <StatusPicker
            value={negotiation.negotiationStatus}
            options={STATUS_PICKER_ORDER}
            labels={NEGOTIATION_STATUS_LABELS}
            tones={NEGOTIATION_STATUS_COLORS}
            onPick={(next) => setNegotiationStatus(negotiation.id, next)}
            // "Revise Quote" opens a quotation revision (with a reason) rather
            // than being a plain status flip — claim it and drive the popup.
            interceptPick={(next) => {
              if (next === "revision") {
                setReviseOpen(true);
                return true;
              }
              return false;
            }}
            ariaLabel="Negotiation status"
            // Once Won (the Sales Order is provisioned), the status is locked —
            // nobody can un-win a deal that already made an SO.
            disabled={isNegotiationApprovedForSo(negotiation.negotiationStatus)}
          />
        </div>
        <MetaField label="Sales Person" value={salesPerson ?? "-"} />
        <MetaField label="Created" value={formatDate(negotiation.createdAt)} />
        {createdBy && <MetaField label="Created By" value={createdBy} />}
        <MetaField label="Last Updated" value={formatDate(negotiation.updatedAt)} />
        <Link
          href={"/negotiations" as Route}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={2.4} />
          Open Register
        </Link>
      </section>

      {/* ── Content (full width) ───────────────────────────────────── */}
      <div className="flex flex-col gap-6 min-w-0">
        {/* The timestamped chat log — replaces the old Notes box + remarks panel. */}
        <NegotiationLog negotiationId={negotiation.id} />

        {/* Read-only quotation (latest revision) — an on-screen replica of the PDF. */}
        {quotationPdf ? (
          <QuotationDetailReadonly model={quotationPdf} />
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

      {/* ── Revise Quote reason popup ──────────────────────────────────── */}
      {reviseOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 p-4 sm:p-10"
          onClick={() => !revising && setReviseOpen(false)}
        >
          <div
            className="w-[min(94vw,520px)] overflow-hidden rounded-2xl bg-surface-card shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-hairline px-5 py-4">
              <h2 className="text-[16px] font-black tracking-tight text-ink-strong">
                Revise the quotation
              </h2>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-relaxed text-ink-soft">
                Freezes the current quotation and opens a copy at the next
                revision number, with its lines carried over. The frozen one keeps
                its price and — if it was sent — the record of who received it.
                This negotiation then tracks the new revision.
              </p>
            </div>
            <div className="p-5">
              <label className="mb-1.5 block text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                Reason (required)
              </label>
              <textarea
                autoFocus
                rows={4}
                value={reviseReason}
                onChange={(e) => setReviseReason(e.target.value)}
                placeholder="Why is the quote being revised? e.g. customer negotiated the price down, qty changed…"
                className="nt-input w-full resize-y"
                style={{ fontWeight: 400 }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft px-5 py-3.5">
              <button
                type="button"
                onClick={() => setReviseOpen(false)}
                disabled={revising}
                className="h-9 rounded-pill px-4 text-[13px] font-bold text-ink-soft hover:text-ink-strong disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRevise()}
                disabled={revising || reviseReason.trim().length < 3}
                title={reviseReason.trim().length < 3 ? "Write a reason first" : undefined}
                className="inline-flex h-9 items-center gap-2 rounded-pill px-5 text-[13px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                style={{ background: "#454595" }}
              >
                {revising && (
                  <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
                )}
                {revising ? "Working…" : "Create revision"}
              </button>
            </div>
          </div>
        </div>
      )}
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
