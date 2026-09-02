"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ArrowLeft, ArrowUpRight, Loader2, MessageSquare, Plus } from "lucide-react";
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
import type { ProformaInvoiceWithItems } from "@/lib/queries/proforma-invoices";
import {
  setNegotiationStatus,
  updateNegotiation,
} from "@/app/(app)/negotiations/actions";
import type { UpdateNegotiationInput } from "@/lib/validators/negotiation";
import {
  isNegotiationApprovedForSo,
  NEGOTIATION_OFF_BOARD_STATUSES,
} from "@/lib/negotiations/buckets";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate, formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Field, MiniField, SectionCard } from "@/components/inquiries/form-field";
import { StatusPicker } from "@/components/inquiries/status-picker";
import { MoneyInput } from "@/components/ui/money-input";
import { NegotiationThreadPanel } from "@/components/negotiations/negotiation-thread";
import {
  QuoteSendHeader,
  type QuoteSendSummary,
} from "@/components/negotiations/quote-send-header";
import { CustomerPoCard } from "@/components/negotiations/customer-po-card";
import { NegotiationApprovalCard } from "@/components/negotiations/negotiation-approval-card";
import {
  ReviseCostingCard,
  type RevisableProductLabels,
} from "@/components/negotiations/revise-costing-card";

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
  lines: NegotiationLineWithSpec[];
  /** Source-quote identity for the Quote Send anchor. */
  quoteSend: QuoteSendSummary;
  /** Every PI issued against this negotiation, newest iteration first. */
  proformaInvoices: ProformaInvoiceWithItems[];
  /** Revised total of the latest PI (for the customer-PO reconciliation). */
  latestPiTotal: string | null;
  /** Presigned download URL for an already-uploaded customer-PO document. */
  poDownloadUrl: string | null;
  /** Current-revision cost sheets behind this negotiation's product lines —
   *  the pick list for the "not approved → new costing" loop. */
  revisableCostings: RevisableCosting[];
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

/** numeric-string → ₹, em-dash when unset/unparseable. */
function money(value: string | null): string {
  if (value == null || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "-";
}

/** Money <input> → number | undefined (no NaN); 0 is a valid amount. */
function moneyValue(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** numeric-string from the DB → number | undefined for the form default. */
function numDefault(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** The editable slice of the negotiation - RHF holds these <input>-shaped
 *  values; the dirty-only patch ships only changed keys. */
interface NegotiationEditValues {
  custProductName: string;
  qty: number | undefined;
  finalCost: number | undefined;
  negotiation: number | undefined;
  quotePrice: number | undefined;
  developmentTime: string;
  deliveryTime: string;
  validity: string;
  quotationLink: string;
  negotiationNotes: string;
  partNo: string;
}

/** Keys whose <input> value must be coerced number→string-numeric on save. */
const NUMERIC_KEYS = new Set<keyof NegotiationEditValues>([
  "finalCost",
  "negotiation",
  "quotePrice",
  "qty",
]);

/**
 * Negotiation detail - breadcrumb + header (negotiationNo, company · enquiry
 * date · linked SM chip · negotiation-status chip · New Negotiation), sticky
 * sidebar (Negotiation Status StatusPicker - the live pipeline mutator, sales
 * person, Created/by, Open Register), read cards for Pricing + Timeline + Notes
 * plus ONE dirty-only edit form (mirrors the quotation detail).
 */
export function NegotiationDetail({
  negotiation,
  employees,
  inquiryLink,
  lines,
  quoteSend,
  latestPiTotal,
  poDownloadUrl,
  revisableCostings,
}: Props) {
  const router = useRouter();
  const [threadOpen, setThreadOpen] = React.useState(false);

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

  const salesPerson =
    employees.find((e) => e.id === negotiation.salesPersonId)?.name ?? null;
  const createdBy =
    employees.find((e) => e.id === negotiation.createdById)?.name ?? null;

  const defaults: NegotiationEditValues = {
    custProductName: negotiation.custProductName ?? "",
    qty: numDefault(negotiation.qty),
    finalCost: numDefault(negotiation.finalCost),
    negotiation: numDefault(negotiation.negotiation),
    quotePrice: numDefault(negotiation.quotePrice),
    developmentTime: negotiation.developmentTime ?? "",
    deliveryTime: negotiation.deliveryTime ?? "",
    validity: negotiation.validity ?? "",
    quotationLink: negotiation.quotationLink ?? "",
    negotiationNotes: negotiation.negotiationNotes ?? "",
    partNo: negotiation.partNo ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, dirtyFields, isSubmitting },
  } = useForm<NegotiationEditValues>({ defaultValues: defaults });

  const onSubmit = handleSubmit(async (values) => {
    // Dirty-only patch - the action's strip-undefined + no-op short-circuit
    // handles the rest. Empty text inputs fold to undefined (UpdateNegotiation's
    // OptionalText keeps them out of the patch).
    const patch = Object.fromEntries(
      Object.keys(dirtyFields).map((key) => {
        const k = key as keyof NegotiationEditValues;
        const raw = values[k];
        const value = NUMERIC_KEYS.has(k) ? moneyValue(raw) : raw;
        return [k, value];
      }),
    ) as UpdateNegotiationInput;
    if (Object.keys(patch).length === 0) return;
    const res = await updateNegotiation(negotiation.id, patch);
    if (res.ok) {
      fireToast({ message: "Negotiation saved." });
      reset(values);
      router.refresh();
    } else {
      fireToast({ message: res.error, type: "error" });
    }
  });

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
          {/* House buckets + the approve gate that unlocks Issue Sales Order */}
          <NegotiationApprovalCard
            negotiationId={negotiation.id}
            status={negotiation.negotiationStatus}
          />

          {/* Quote Send anchor + stage progress strip */}
          <QuoteSendHeader
            negotiationId={negotiation.id}
            stage={negotiation.negotiationStage}
            quoteSend={quoteSend}
          />

          {/* Customer PO → Sales Order. Available directly (no proforma invoice
              step): once the negotiation is approved and the customer PO is
              saved, the sales order is provisioned automatically. */}
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

          {/* Not approved → the costing gets revised (new revision per sheet) */}
          <ReviseCostingCard
            negotiationId={negotiation.id}
            costings={revisableCostings}
            productLabels={productLabels}
            hasLines={hasEnquiryLines}
          />

          {/* Pricing (read) */}
          <SectionCard title="Pricing">
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <ReadStat label="Final Cost" value={money(negotiation.finalCost)} />
              <ReadStat label="Negotiation" value={money(negotiation.negotiation)} />
              <ReadStat label="Quote Price" value={money(negotiation.quotePrice)} emphasis />
            </div>
          </SectionCard>

          {/* Timeline (read) */}
          <SectionCard title="Timeline & Validity">
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <ReadStat label="Development Time" value={negotiation.developmentTime ?? "-"} />
              <ReadStat label="Delivery Time" value={negotiation.deliveryTime ?? "-"} />
              <ReadStat label="Validity" value={negotiation.validity ?? "-"} />
            </div>
          </SectionCard>

          {/* Notes (read) */}
          <SectionCard title="Negotiation Notes">
            <p
              className="text-[14px] text-ink-strong whitespace-pre-wrap"
              style={{ lineHeight: 1.55 }}
            >
              {negotiation.negotiationNotes?.trim() || "-"}
            </p>
          </SectionCard>

          {/* The append-only remark thread. Distinct from Negotiation Notes
              above, which is one editable free-text field on the record — this
              is the running history of the conversation, and nothing in it can
              be changed after the fact. */}
          <SectionCard
            title="Negotiation Remarks"
            hint="Every board move adds one, newest first. Nothing here can be edited or removed."
          >
            <button
              type="button"
              onClick={() => setThreadOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-pill border-[1.5px] border-[#c9cbe0] px-4 text-[13px] font-extrabold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#efeffb]"
            >
              <MessageSquare size={14} strokeWidth={2.4} />
              Open remark thread
            </button>
          </SectionCard>

          {/* Negotiation Lines (read-only) */}
          {lines.length > 0 && (
            <SectionCard
              title="Negotiation Lines"
              hint="Editing here updates Line 1 - additional lines are read-only."
            >
              <div className="flex flex-col gap-4">
                {lines.map((line, idx) => (
                  <NegotiationLineCard key={line.id} line={line} lineNo={idx + 1} />
                ))}
              </div>
            </SectionCard>
          )}

          {/* One form for the editable area: Product + Pricing + Timeline + Notes + Link/Part. */}
          <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
            <SectionCard
              title="Product"
              hint="Customer product, quantity and part - only changed fields are saved."
            >
              <Field id="nd-product" label="Cust Product Name">
                <input id="nd-product" type="text" className="nt-input" {...register("custProductName")} />
              </Field>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="nd-qty" label="Qty">
                  <input
                    id="nd-qty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="any"
                    className="nt-input tabular-nums"
                    placeholder="0"
                    {...register("qty", { setValueAs: moneyValue })}
                  />
                </Field>
                <Field id="nd-part" label="Part No">
                  <input id="nd-part" type="text" className="nt-input" {...register("partNo")} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Pricing" hint="All amounts in ₹ - only changed fields are saved.">
              <div className="flex flex-wrap items-start gap-x-5 gap-y-3.5">
                <MiniField label="Final Cost">
                  <span className="block w-[180px]">
                    <MoneyInput
                      aria-label="Final cost"
                      {...register("finalCost", { setValueAs: moneyValue })}
                    />
                  </span>
                </MiniField>
                <MiniField label="Negotiation">
                  <span className="block w-[180px]">
                    <MoneyInput
                      aria-label="Negotiation"
                      {...register("negotiation", { setValueAs: moneyValue })}
                    />
                  </span>
                </MiniField>
                <MiniField label="Quote Price">
                  <span className="block w-[180px]">
                    <MoneyInput
                      aria-label="Quote price"
                      {...register("quotePrice", { setValueAs: moneyValue })}
                    />
                  </span>
                </MiniField>
              </div>
            </SectionCard>

            <SectionCard title="Timeline & Validity">
              <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
                <Field id="nd-dev" label="Development Time">
                  <input id="nd-dev" type="text" className="nt-input" {...register("developmentTime")} />
                </Field>
                <Field id="nd-del" label="Delivery Time">
                  <input id="nd-del" type="text" className="nt-input" {...register("deliveryTime")} />
                </Field>
                <Field id="nd-val" label="Validity">
                  <input id="nd-val" type="text" className="nt-input" {...register("validity")} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Quote Document & Notes">
              <Field id="nd-link" label="Quotation Link">
                <input
                  id="nd-link"
                  type="url"
                  className="nt-input"
                  placeholder="https://"
                  {...register("quotationLink")}
                />
              </Field>
              <Field id="nd-notes" label="Negotiation Notes">
                <textarea
                  id="nd-notes"
                  rows={4}
                  className="nt-input resize-y"
                  placeholder="Counter-offers, customer feedback, next steps"
                  {...register("negotiationNotes")}
                />
              </Field>

              <div className="flex items-center justify-end border-t border-hairline pt-4">
                <button
                  type="submit"
                  disabled={!isDirty || isSubmitting}
                  className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
                  style={{
                    background:
                      "#454595",
                  }}
                >
                  {isSubmitting && (
                    <Loader2
                      size={14}
                      style={{ animation: "spinFast 0.8s linear infinite" }}
                    />
                  )}
                  Save Changes
                </button>
              </div>
            </SectionCard>
          </form>
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
            />
          </div>
          <SidebarRow label="Sales Person" value={salesPerson ?? "-"} />
          {negotiation.quotationLink && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
                Quotation Link
              </span>
              <a
                href={negotiation.quotationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand hover:underline break-all"
              >
                Open document
                <ArrowUpRight size={13} strokeWidth={2.4} />
              </a>
            </div>
          )}
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

      {threadOpen && (
        <NegotiationThreadPanel
          negotiationId={negotiation.id}
          title={inquiryLink?.smNumber ?? negotiation.negotiationNo}
          subtitle={negotiation.companyName}
          onClose={() => setThreadOpen(false)}
        />
      )}
    </div>
  );
}

function ReadStat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
        {label}
      </span>
      <span
        className="tabular-nums text-ink-strong"
        style={{ fontWeight: emphasis ? 800 : 600, fontSize: emphasis ? 20 : 16 }}
      >
        {value}
      </span>
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

function NegotiationLineCard({ line, lineNo }: { line: NegotiationLineWithSpec; lineNo: number }) {
  // Product name read-through from the provenance inquiry line; part no from the
  // linked Item spec (§2.4). Prices / qty / timeline stay the line's own facts.
  const ask = line.ask;
  const spec = line.spec;
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
          Line {lineNo}
        </span>
        {ask.custProductName && (
          <span className="text-[13.5px] font-semibold text-ink-strong">
            {ask.custProductName}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <LineStat label="Qty" value={line.qty ?? "-"} />
        <LineStat label="Part No" value={spec.partNo ?? "-"} />
      </div>
      <div className="grid grid-cols-3 gap-4 border-t border-hairline pt-3 max-md:grid-cols-1">
        <ReadStat label="Final Cost" value={money(line.finalCost)} />
        <ReadStat label="Negotiation" value={money(line.negotiation)} />
        <ReadStat label="Quote Price" value={money(line.quotePrice)} emphasis />
      </div>
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <LineStat label="Development Time" value={line.developmentTime ?? "-"} />
        <LineStat label="Delivery Time" value={line.deliveryTime ?? "-"} />
        <LineStat label="Validity" value={line.validity ?? "-"} />
      </div>
    </div>
  );
}

function LineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.10em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[13.5px] font-semibold text-ink-strong">{value}</span>
    </div>
  );
}
