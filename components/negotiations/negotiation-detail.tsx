"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ArrowLeft, ArrowUpRight, Loader2, Plus } from "lucide-react";
import {
  NEGOTIATION_STATUSES,
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUS_COLORS,
} from "@/db/enums";
import type { Negotiation } from "@/db/schema";
import type { NegotiationLineWithSpec } from "@/lib/queries/negotiations";
import {
  setNegotiationStatus,
  updateNegotiation,
} from "@/app/(app)/negotiations/actions";
import type { UpdateNegotiationInput } from "@/lib/validators/negotiation";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate, formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Field, MiniField, SectionCard } from "@/components/inquiries/form-field";
import { StatusPicker } from "@/components/inquiries/status-picker";
import { MoneyInput } from "@/components/ui/money-input";

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
}

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
export function NegotiationDetail({ negotiation, employees, inquiryLink, lines }: Props) {
  const router = useRouter();

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
              Negotiation Status
            </span>
            <StatusPicker
              value={negotiation.negotiationStatus}
              options={NEGOTIATION_STATUSES}
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
