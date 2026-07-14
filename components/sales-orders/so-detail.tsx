"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ArrowLeft, ArrowUpRight, Loader2, Plus } from "lucide-react";
import type { SalesOrder } from "@/db/schema";
import type { SalesOrderLineWithSpec } from "@/lib/queries/sales-orders";
import {
  setSalesOrderSent,
  updateSalesOrder,
} from "@/app/(app)/sales-orders/actions";
import type { UpdateSalesOrderInput } from "@/lib/validators/sales-order";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate, formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Field, MiniField, SectionCard, Segmented } from "@/components/inquiries/form-field";

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
  lines: SalesOrderLineWithSpec[];
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

/** Date → yyyy-mm-dd for the `<input type=date>` default. */
function dateInputDefault(value: Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** The editable slice of the sales order - RHF holds these <input>-shaped
 *  values; the dirty-only patch ships only changed keys. */
interface SoEditValues {
  custProductName: string;
  qty: number | undefined;
  quotePrice: number | undefined;
  developmentTime: string;
  deliveryTime: string;
  validity: string;
  quotationLink: string;
  partNo: string;
  customerPoNo: string;
  customerPoDate: string;
  customerPoLink: string;
  customerSoLink: string;
  productionSoLink: string;
}

/** Keys whose <input> value must be coerced number→string-numeric on save. */
const NUMERIC_KEYS = new Set<keyof SoEditValues>(["quotePrice", "qty"]);

/**
 * Sales Order detail - breadcrumb + header (soNo, company · enquiry date ·
 * linked SM chip · SO-sent chip · New Sales Order), sticky sidebar (SO Sent
 * toggle - the SO's only state mutator, sales person, quote price, Created/by,
 * Open Register), read cards for Quote Summary + Customer PO + SO Docs plus ONE
 * dirty-only edit form (mirrors the quotation/negotiation detail).
 */
export function SoDetail({ salesOrder, employees, inquiryLink, lines }: Props) {
  const router = useRouter();
  const [sentPending, startSentTransition] = React.useTransition();

  const salesPerson =
    employees.find((e) => e.id === salesOrder.salesPersonId)?.name ?? null;
  const createdBy =
    employees.find((e) => e.id === salesOrder.createdById)?.name ?? null;

  const defaults: SoEditValues = {
    custProductName: salesOrder.custProductName ?? "",
    qty: numDefault(salesOrder.qty),
    quotePrice: numDefault(salesOrder.quotePrice),
    developmentTime: salesOrder.developmentTime ?? "",
    deliveryTime: salesOrder.deliveryTime ?? "",
    validity: salesOrder.validity ?? "",
    quotationLink: salesOrder.quotationLink ?? "",
    partNo: salesOrder.partNo ?? "",
    customerPoNo: salesOrder.customerPoNo ?? "",
    customerPoDate: dateInputDefault(salesOrder.customerPoDate),
    customerPoLink: salesOrder.customerPoLink ?? "",
    customerSoLink: salesOrder.customerSoLink ?? "",
    productionSoLink: salesOrder.productionSoLink ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, dirtyFields, isSubmitting },
  } = useForm<SoEditValues>({ defaultValues: defaults });

  const onSubmit = handleSubmit(async (values) => {
    // Dirty-only patch - the action's strip-undefined + no-op short-circuit
    // handles the rest. Empty text inputs fold to undefined (UpdateSalesOrder's
    // OptionalText keeps them out of the patch).
    const patch = Object.fromEntries(
      Object.keys(dirtyFields).map((key) => {
        const k = key as keyof SoEditValues;
        const raw = values[k];
        const value = NUMERIC_KEYS.has(k) ? moneyValue(raw) : raw;
        return [k, value];
      }),
    ) as UpdateSalesOrderInput;
    if (Object.keys(patch).length === 0) return;
    const res = await updateSalesOrder(salesOrder.id, patch);
    if (res.ok) {
      fireToast({ message: "Sales order saved." });
      reset(values);
      router.refresh();
    } else {
      fireToast({ message: res.error, type: "error" });
    }
  });

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

  const sentTone = salesOrder.customerSoSent ? "green" : "slate";

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
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-pill text-[12px] font-bold"
              style={{
                background: `color-mix(in srgb, var(--color-${sentTone}) 12%, transparent)`,
                color: `var(--color-${sentTone}-deep)`,
                border: `1px solid color-mix(in srgb, var(--color-${sentTone}) 30%, transparent)`,
              }}
            >
              {salesOrder.customerSoSent ? "SO Sent" : "SO Not Sent"}
            </span>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] items-start">
        {/* ── Main column ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Quote Summary (read) */}
          <SectionCard title="Quote Summary">
            <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
              <ReadStat label="Quote Price" value={money(salesOrder.quotePrice)} emphasis />
              <ReadStat label="Development Time" value={salesOrder.developmentTime ?? "-"} />
              <ReadStat label="Delivery Time" value={salesOrder.deliveryTime ?? "-"} />
              <ReadStat label="Validity" value={salesOrder.validity ?? "-"} />
            </div>
          </SectionCard>

          {/* Customer PO (read) */}
          <SectionCard title="Customer PO">
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <ReadStat label="Customer PO No" value={salesOrder.customerPoNo ?? "-"} />
              <ReadStat
                label="Customer PO Date"
                value={salesOrder.customerPoDate ? formatDate(salesOrder.customerPoDate) : "-"}
              />
              <ReadLink label="Customer PO Link" href={salesOrder.customerPoLink} />
            </div>
          </SectionCard>

          {/* SO Docs (read) */}
          <SectionCard title="Sales Order Docs">
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <ReadLink label="Customer SO Link" href={salesOrder.customerSoLink} />
              <ReadLink label="Production SO Link" href={salesOrder.productionSoLink} />
              <ReadLink label="Quotation Link" href={salesOrder.quotationLink} />
            </div>
          </SectionCard>

          {/* Sales Order Lines (read-only) */}
          {lines.length > 0 && (
            <SectionCard
              title="Sales Order Lines"
              hint="Editing here updates Line 1 - additional lines are read-only."
            >
              <div className="flex flex-col gap-4">
                {lines.map((line, idx) => (
                  <SoLineCard key={line.id} line={line} lineNo={idx + 1} />
                ))}
              </div>
            </SectionCard>
          )}

          {/* One form for the editable area: Product + Quote Summary + Customer PO + SO Docs. */}
          <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
            <SectionCard
              title="Product"
              hint="Customer product, quantity and part - only changed fields are saved."
            >
              <Field id="sod-product" label="Cust Product Name">
                <input id="sod-product" type="text" className="nt-input" {...register("custProductName")} />
              </Field>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="sod-qty" label="Qty">
                  <input
                    id="sod-qty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="any"
                    className="nt-input tabular-nums"
                    placeholder="0"
                    {...register("qty", { setValueAs: moneyValue })}
                  />
                </Field>
                <Field id="sod-part" label="Part No">
                  <input id="sod-part" type="text" className="nt-input" {...register("partNo")} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              title="Quote Summary"
              hint="Pulled from the linked quotation - only changed fields are saved."
            >
              <div className="flex flex-wrap items-start gap-x-5 gap-y-3.5">
                <MiniField label="Quote Price">
                  <MoneyInput
                    aria-label="Quote price"
                    {...register("quotePrice", { setValueAs: moneyValue })}
                  />
                </MiniField>
              </div>
              <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
                <Field id="sod-dev" label="Development Time">
                  <input id="sod-dev" type="text" className="nt-input" {...register("developmentTime")} />
                </Field>
                <Field id="sod-del" label="Delivery Time">
                  <input id="sod-del" type="text" className="nt-input" {...register("deliveryTime")} />
                </Field>
                <Field id="sod-val" label="Validity">
                  <input id="sod-val" type="text" className="nt-input" {...register("validity")} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="sod-link" label="Quotation Link">
                  <input
                    id="sod-link"
                    type="url"
                    className="nt-input"
                    placeholder="https://"
                    {...register("quotationLink")}
                  />
                </Field>
                <Field id="sod-part" label="Part No">
                  <input id="sod-part" type="text" className="nt-input" {...register("partNo")} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Customer PO">
              <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
                <Field id="sod-pono" label="Customer PO No">
                  <input id="sod-pono" type="text" className="nt-input" {...register("customerPoNo")} />
                </Field>
                <Field id="sod-podate" label="Customer PO Date">
                  <input id="sod-podate" type="date" className="nt-input" {...register("customerPoDate")} />
                </Field>
                <Field id="sod-polink" label="Customer PO Link">
                  <input
                    id="sod-polink"
                    type="url"
                    className="nt-input"
                    placeholder="https://"
                    {...register("customerPoLink")}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Sales Order Docs">
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="sod-custlink" label="Customer SO Link">
                  <input
                    id="sod-custlink"
                    type="url"
                    className="nt-input"
                    placeholder="https://"
                    {...register("customerSoLink")}
                  />
                </Field>
                <Field id="sod-prodlink" label="Production SO Link">
                  <input
                    id="sod-prodlink"
                    type="url"
                    className="nt-input"
                    placeholder="https://"
                    {...register("productionSoLink")}
                  />
                </Field>
              </div>

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
          <SidebarRow label="Sales Person" value={salesPerson ?? "-"} />
          <SidebarRow label="Quote Price" value={money(salesOrder.quotePrice)} />
          {salesOrder.quotationLink && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
                Quotation Link
              </span>
              <a
                href={salesOrder.quotationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand hover:underline break-all"
              >
                Open document
                <ArrowUpRight size={13} strokeWidth={2.4} />
              </a>
            </div>
          )}
          <SidebarRow label="Created" value={formatDate(salesOrder.createdAt)} />
          {createdBy && <SidebarRow label="Created By" value={createdBy} />}
          <SidebarRow label="Last Updated" value={formatDate(salesOrder.updatedAt)} />
          <Link
            href={"/sales-orders" as Route}
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

function ReadLink({ label, href }: { label: string; href: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[14px] font-semibold text-brand hover:underline break-all"
        >
          Open
          <ArrowUpRight size={13} strokeWidth={2.4} />
        </a>
      ) : (
        <span className="text-[16px] font-semibold text-ink-strong">-</span>
      )}
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

function SoLineCard({ line, lineNo }: { line: SalesOrderLineWithSpec; lineNo: number }) {
  // Product name read-through from the provenance inquiry line; part no from the
  // linked Item spec (§2.4). Price / qty / timeline stay the line's own facts.
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
      <div className="grid grid-cols-1 gap-4 border-t border-hairline pt-3 max-md:grid-cols-1">
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
