"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { ArrowLeft, ArrowUpRight, Loader2, Plus } from "lucide-react";
import {
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
} from "@/db/enums";
import type { Quotation, QuotationItem } from "@/db/schema";
import {
  setQuotationStatus,
  updateQuotation,
} from "@/app/(app)/quotations/actions";
import type { UpdateQuotationInput } from "@/lib/validators/quotation";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate, formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Field, MiniField, SectionCard, Segmented } from "@/components/inquiries/form-field";
import { StatusPicker } from "@/components/inquiries/status-picker";

/** Slim link block for the header — resolved server-side from inquiryId. */
export interface QuotationInquiryLink {
  id: string;
  smNumber: string;
  companyName: string;
}

interface Props {
  quotation: Quotation;
  employees: EmployeeOption[];
  inquiryLink: QuotationInquiryLink | null;
  lines: QuotationItem[];
}

const QUOTE_SENT_OPTIONS = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

/** numeric-string → ₹, em-dash when unset/unparseable. */
function money(value: string | null): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "—";
}

/** Money <input> → number | undefined (no NaN); 0 is a valid amount. */
function moneyValue(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** The editable slice of the quotation — RHF holds these <input>-shaped
 *  values; the dirty-only patch ships only changed keys. */
interface QuotationEditValues {
  custProductName: string;
  custDrawingNo: string;
  drawingRevisionNo: string;
  partNo: string;
  gradeCustomer: string;
  gradeNameForCust: string;
  tolerance: string;
  condition: string;
  finalCost: number | undefined;
  negotiation: number | undefined;
  quotePrice: number | undefined;
  developmentTime: string;
  deliveryTime: string;
  validity: string;
  quotationLink: string;
  quoteSent: boolean;
}

/** numeric-string from the DB → number | undefined for the form default. */
function numDefault(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const MONEY_KEYS = new Set<keyof QuotationEditValues>([
  "finalCost",
  "negotiation",
  "quotePrice",
]);

/**
 * Quotation detail — breadcrumb + header (quoteNo, company · enquiry date ·
 * linked SM chip · costing-done chip · New Quotation), sticky sidebar (Costing
 * Done StatusPicker, Quote Sent, Created/by, Open Register), and read cards for
 * Pricing + Timeline plus ONE dirty-only edit form (mirrors the sample detail).
 */
export function QuotationDetail({ quotation, employees, inquiryLink, lines }: Props) {
  const router = useRouter();

  const createdBy =
    employees.find((e) => e.id === quotation.createdById)?.name ?? null;

  const defaults: QuotationEditValues = {
    custProductName: quotation.custProductName ?? "",
    custDrawingNo: quotation.custDrawingNo ?? "",
    drawingRevisionNo: quotation.drawingRevisionNo ?? "",
    partNo: quotation.partNo ?? "",
    gradeCustomer: quotation.gradeCustomer ?? "",
    gradeNameForCust: quotation.gradeNameForCust ?? "",
    tolerance: quotation.tolerance ?? "",
    condition: quotation.condition ?? "",
    finalCost: numDefault(quotation.finalCost),
    negotiation: numDefault(quotation.negotiation),
    quotePrice: numDefault(quotation.quotePrice),
    developmentTime: quotation.developmentTime ?? "",
    deliveryTime: quotation.deliveryTime ?? "",
    validity: quotation.validity ?? "",
    quotationLink: quotation.quotationLink ?? "",
    quoteSent: quotation.quoteSent,
  };

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { isDirty, dirtyFields, isSubmitting },
  } = useForm<QuotationEditValues>({ defaultValues: defaults });

  const onSubmit = handleSubmit(async (values) => {
    // Dirty-only patch — the action's strip-undefined + no-op short-circuit
    // handles the rest. Empty text inputs fold to undefined (UpdateQuotation's
    // OptionalText keeps them out of the patch).
    const patch = Object.fromEntries(
      Object.keys(dirtyFields).map((key) => {
        const k = key as keyof QuotationEditValues;
        const raw = values[k];
        const value = MONEY_KEYS.has(k) ? moneyValue(raw) : raw;
        return [k, value];
      }),
    ) as UpdateQuotationInput;
    if (Object.keys(patch).length === 0) return;
    const res = await updateQuotation(quotation.id, patch);
    if (res.ok) {
      fireToast({ message: "Quotation saved." });
      reset(values);
      router.refresh();
    } else {
      fireToast({ message: res.error, type: "error" });
    }
  });

  const statusTone =
    COSTING_DONE_STATUS_COLORS[quotation.costingDoneStatus] ?? "slate";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        <Link
          href={"/quotations" as Route}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Quotations
        </Link>
        <span aria-hidden className="text-ink-subtle">
          ·
        </span>
        <span
          aria-current="page"
          className="text-ink-subtle"
          style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
        >
          {quotation.quoteNo}
        </span>
      </nav>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 -mt-2">
        <div className="min-w-0">
          <h1 className="font-mono text-[40px] leading-tight tracking-tight text-ink-strong">
            {quotation.quoteNo}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14.5px] text-ink-muted">
            {quotation.companyName ?? "—"}
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
            {quotation.enquiryDate ? formatDate(quotation.enquiryDate) : "No enquiry date"}
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
              {COSTING_DONE_STATUS_LABELS[quotation.costingDoneStatus]}
            </span>
          </p>
        </div>
        <Link
          href={"/quotations/new" as Route}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-strong hover:border-hairline-strong hover:bg-surface-soft transition-colors"
        >
          <Plus size={14} strokeWidth={2.6} />
          New Quotation
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] items-start">
        {/* ── Main column ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Quoted Lines (read-only) */}
          {lines.length > 0 && (
            <SectionCard title="Quoted Lines">
              <div className="flex flex-col gap-4">
                {lines.map((line, idx) => (
                  <QuotedLineCard key={line.id} line={line} lineNo={idx + 1} />
                ))}
              </div>
            </SectionCard>
          )}

          {/* Pricing (read) */}
          <SectionCard title="Pricing">
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <ReadStat label="Final Cost" value={money(quotation.finalCost)} />
              <ReadStat label="Negotiation" value={money(quotation.negotiation)} />
              <ReadStat label="Quote Price" value={money(quotation.quotePrice)} emphasis />
            </div>
          </SectionCard>

          {/* Timeline (read) */}
          <SectionCard title="Timeline & Validity">
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <ReadStat label="Development Time" value={quotation.developmentTime ?? "—"} />
              <ReadStat label="Delivery Time" value={quotation.deliveryTime ?? "—"} />
              <ReadStat label="Validity" value={quotation.validity ?? "—"} />
            </div>
          </SectionCard>

          {/* Editable form note */}
          {lines.length > 0 && (
            <p className="text-[13px] text-ink-muted -mt-2">
              Editing here updates Line 1. Additional lines are shown read-only — full per-line editing is coming soon.
            </p>
          )}

          {/* One form for the editable area: Product + Pricing + Timeline + Link/Sent. */}
          <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
            <SectionCard
              title="Product"
              hint="Customer-facing product, drawing and grade — only changed fields are saved."
            >
              <Field id="qd-product" label="Customer Product Name">
                <input id="qd-product" type="text" className="nt-input" {...register("custProductName")} />
              </Field>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="qd-drw" label="Customer Drawing No">
                  <input id="qd-drw" type="text" className="nt-input" {...register("custDrawingNo")} />
                </Field>
                <Field id="qd-rev" label="Drawing Revision No">
                  <input id="qd-rev" type="text" className="nt-input" {...register("drawingRevisionNo")} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="qd-part" label="Part No">
                  <input id="qd-part" type="text" className="nt-input" {...register("partNo")} />
                </Field>
                <Field id="qd-gradecust" label="Grade Name for Customer">
                  <input id="qd-gradecust" type="text" className="nt-input" {...register("gradeNameForCust")} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
                <Field id="qd-grade" label="Grade (Customer)">
                  <input id="qd-grade" type="text" className="nt-input" {...register("gradeCustomer")} />
                </Field>
                <Field id="qd-tol" label="Tolerance">
                  <input id="qd-tol" type="text" className="nt-input" {...register("tolerance")} />
                </Field>
                <Field id="qd-cond" label="Condition">
                  <input id="qd-cond" type="text" className="nt-input" {...register("condition")} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Pricing" hint="All amounts in ₹.">
              <div className="flex flex-wrap items-start gap-x-5 gap-y-3.5">
                <MiniField label="Final Cost">
                  <MoneyInput
                    aria-label="Final cost"
                    {...register("finalCost", { setValueAs: moneyValue })}
                  />
                </MiniField>
                <MiniField label="Negotiation">
                  <MoneyInput
                    aria-label="Negotiation"
                    {...register("negotiation", { setValueAs: moneyValue })}
                  />
                </MiniField>
                <MiniField label="Quote Price">
                  <MoneyInput
                    aria-label="Quote price"
                    {...register("quotePrice", { setValueAs: moneyValue })}
                  />
                </MiniField>
              </div>
            </SectionCard>

            <SectionCard title="Timeline & Validity">
              <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
                <Field id="qd-dev" label="Development Time">
                  <input id="qd-dev" type="text" className="nt-input" {...register("developmentTime")} />
                </Field>
                <Field id="qd-del" label="Delivery Time">
                  <input id="qd-del" type="text" className="nt-input" {...register("deliveryTime")} />
                </Field>
                <Field id="qd-val" label="Validity">
                  <input id="qd-val" type="text" className="nt-input" {...register("validity")} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Quote Document">
              <Field id="qd-link" label="Quotation Link">
                <input
                  id="qd-link"
                  type="url"
                  className="nt-input"
                  placeholder="https://…"
                  {...register("quotationLink")}
                />
              </Field>
              <Field label="Quote Sent" labelOnly>
                <Controller
                  control={control}
                  name="quoteSent"
                  render={({ field }) => (
                    <Segmented
                      options={QUOTE_SENT_OPTIONS}
                      value={field.value ? "yes" : "no"}
                      onChange={(v) => field.onChange(v === "yes")}
                      allowClear={false}
                      ariaLabel="Quote sent"
                    />
                  )}
                />
              </Field>

              <div className="flex items-center justify-end border-t border-hairline pt-4">
                <button
                  type="submit"
                  disabled={!isDirty || isSubmitting}
                  className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
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
              Costing Done
            </span>
            <StatusPicker
              value={quotation.costingDoneStatus}
              options={COSTING_DONE_STATUSES}
              labels={COSTING_DONE_STATUS_LABELS}
              tones={COSTING_DONE_STATUS_COLORS}
              onPick={(next) => setQuotationStatus(quotation.id, next)}
              ariaLabel="Costing done status"
            />
          </div>
          <SidebarRow label="Quote Sent" value={quotation.quoteSent ? "Yes" : "No"} />
          {quotation.quotationLink && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
                Quotation Link
              </span>
              <a
                href={quotation.quotationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand hover:underline break-all"
              >
                Open document
                <ArrowUpRight size={13} strokeWidth={2.4} />
              </a>
            </div>
          )}
          <SidebarRow label="Created" value={formatDate(quotation.createdAt)} />
          {createdBy && <SidebarRow label="Created By" value={createdBy} />}
          <SidebarRow label="Last Updated" value={formatDate(quotation.updatedAt)} />
          <Link
            href={"/quotations" as Route}
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

function QuotedLineCard({ line, lineNo }: { line: QuotationItem; lineNo: number }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
          Line {lineNo}
        </span>
        {line.custProductName && (
          <span className="text-[13.5px] font-semibold text-ink-strong">
            {line.custProductName}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <LineStat label="Qty" value={line.qty ?? "—"} />
        <LineStat label="Part No" value={line.partNo ?? "—"} />
        <LineStat label="Grade (Cust)" value={line.gradeCustomer ?? "—"} />
        <LineStat label="Grade Name" value={line.gradeNameForCust ?? "—"} />
        <LineStat label="Tolerance" value={line.tolerance ?? "—"} />
        <LineStat label="Condition" value={line.condition ?? "—"} />
        {line.custDrawingNo && (
          <LineStat label="Drawing No" value={line.custDrawingNo} />
        )}
        {line.drawingRevisionNo && (
          <LineStat label="Rev" value={line.drawingRevisionNo} />
        )}
      </div>
      <div className="grid grid-cols-3 gap-4 border-t border-hairline pt-3 max-md:grid-cols-1">
        <ReadStat label="Final Cost" value={money(line.finalCost)} />
        <ReadStat label="Negotiation" value={money(line.negotiation)} />
        <ReadStat label="Quote Price" value={money(line.quotePrice)} emphasis />
      </div>
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <LineStat label="Development Time" value={line.developmentTime ?? "—"} />
        <LineStat label="Delivery Time" value={line.deliveryTime ?? "—"} />
        <LineStat label="Validity" value={line.validity ?? "—"} />
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

/** ₹-prefixed number input. */
const MoneyInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function MoneyInput(props, ref) {
  return (
    <div className="relative w-[180px]">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-subtle">
        ₹
      </span>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        className="nt-input w-full pl-7 tabular-nums"
        placeholder="0"
        {...props}
      />
    </div>
  );
});
