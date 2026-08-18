"use client";

import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { AlertTriangle, ArrowLeft, ArrowUpRight, Loader2 } from "lucide-react";
import {
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
  QUOTATION_STAGE_BUCKETS,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_COLORS,
} from "@/db/enums";
import type { Quotation } from "@/db/schema";
import type { QuotationLineWithSpec } from "@/lib/queries/quotes";
import type { LatestCostingRevision } from "@/lib/queries/quotations";
import {
  isCostBasisStale,
  costBasisDelta,
  revisionLabel,
} from "@/components/quotations/costing-basis";
import {
  setQuotationBucket,
  setQuotationStatus,
  updateQuotation,
} from "@/app/(app)/quotations/actions";
import type { UpdateQuotationInput } from "@/lib/validators/quotation";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate, formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Field, MiniField, Segmented } from "@/components/inquiries/form-field";
import { StatusPicker } from "@/components/inquiries/status-picker";
import { MoneyInput } from "@/components/ui/money-input";

/** Slim link block for the header - resolved server-side from inquiryId. */
export interface QuotationInquiryLink {
  id: string;
  smNumber: string;
  companyName: string;
}

interface Props {
  quotation: Quotation;
  employees: EmployeeOption[];
  inquiryLink: QuotationInquiryLink | null;
  lines: QuotationLineWithSpec[];
  /** LATEST costing revision per `inquiry_item_id`, resolved server-side.
   *  Lines with no costing are simply absent. */
  latestCostings: Record<string, LatestCostingRevision>;
  /** Revise / Send buttons, rendered on the title line rather than a row of
   *  their own — see the header note in the component. */
  actions?: ReactNode;
}

const QUOTE_SENT_OPTIONS = [
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

/** The editable slice of the quotation - RHF holds these <input>-shaped
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
 * Quotation detail — a two-line header over ONE full-width column.
 *
 * Line 1 is identity + control: back-link, quote number, the Quotation Status
 * and Costing pickers, and the Revise / Send actions. Line 2 is the facts:
 * company, enquiry date, linked SM, quote-sent, created/by, updated, document.
 *
 * It used to be five stacked rows plus a sticky side card, and the card mostly
 * repeated what the header already said — the status appeared twice (a chip AND
 * a picker), and "Open Register" duplicated the breadcrumb. Everything below is
 * now one column of banded cards, the same shape every other record uses,
 * rather than a main column and a panel that had to be read together.
 */
export function QuotationDetail({
  quotation,
  employees,
  inquiryLink,
  lines,
  latestCostings,
  actions,
}: Props) {
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
    // Dirty-only patch - the action's strip-undefined + no-op short-circuit
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

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ─ exactly two lines ───────────────────────────
          Line 1: where you came from, what this is, its two live statuses, and
          what you can DO to it. Line 2: the facts about it.

          This replaced five stacked rows (an actions strip, a breadcrumb, a
          40px number, a chip line, and a sidebar card repeating the same
          facts). The status PICKERS now sit on line 1, so the read-only chips
          that used to duplicate them are gone — one control per fact, not a
          chip and a picker saying the same thing in two places. */}
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={"/quotations" as Route}
            className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink-strong"
          >
            <ArrowLeft size={14} strokeWidth={2.4} />
            Quotations
          </Link>
          <h1 className="font-mono text-[24px] font-bold leading-none tracking-tight text-ink-strong">
            {quotation.quoteNo}
          </h1>
          <StatusPicker
            value={quotation.quotationStatus}
            options={QUOTATION_STAGE_BUCKETS}
            labels={QUOTATION_STATUS_LABELS}
            tones={QUOTATION_STATUS_COLORS}
            onPick={(next) => setQuotationBucket(quotation.id, next)}
            ariaLabel="Quotation status"
          />
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
              Costing
            </span>
            <StatusPicker
              value={quotation.costingDoneStatus}
              options={COSTING_DONE_STATUSES}
              labels={COSTING_DONE_STATUS_LABELS}
              tones={COSTING_DONE_STATUS_COLORS}
              onPick={(next) => setQuotationStatus(quotation.id, next)}
              ariaLabel="Costing done status"
            />
          </span>
          {actions && (
            <span className="ml-auto flex flex-wrap items-center gap-2">{actions}</span>
          )}
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
          <span className="font-semibold text-ink-soft">{quotation.companyName ?? "-"}</span>
          <Dot />
          {quotation.enquiryDate ? formatDate(quotation.enquiryDate) : "No enquiry date"}
          {inquiryLink && (
            <>
              <Dot />
              <Link
                href={`/inquiries/${inquiryLink.id}` as Route}
                className="inline-flex items-center gap-1 font-semibold text-ink-strong hover:underline"
                style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
              >
                {inquiryLink.smNumber}
                <ArrowUpRight size={12} strokeWidth={2.4} className="text-ink-subtle" />
              </Link>
            </>
          )}
          <Dot />
          Quote sent: <span className="font-semibold text-ink-soft">{quotation.quoteSent ? "Yes" : "No"}</span>
          <Dot />
          Created {formatDate(quotation.createdAt)}
          {createdBy && <> by <span className="font-semibold text-ink-soft">{createdBy}</span></>}
          <Dot />
          Updated {formatDate(quotation.updatedAt)}
          {quotation.quotationLink && (
            <>
              <Dot />
              <a
                href={quotation.quotationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
              >
                Document
                <ArrowUpRight size={12} strokeWidth={2.4} />
              </a>
            </>
          )}
        </p>
      </header>

      {/* One column, full width. The side panel is gone: its two pickers moved
          onto the header's first line and its four facts onto the second. */}
      <div className="flex flex-col gap-6">
        {/* ── Main column ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* ── Quoted Lines - feasibility-style banded cards ─────────── */}
          {lines.length > 0 && (
            /* gap-5, not gap-4: with three products the space BETWEEN cards
               has to read as bigger than the banding inside one. */
            <section className="flex flex-col gap-5">
              <h2 className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
                Products
                <span className="ml-2 font-black tabular-nums text-ink-soft">
                  {lines.length}
                </span>
              </h2>
              {lines.map((line, idx) => (
                <QuotedLineCard
                  key={line.id}
                  line={line}
                  lineNo={idx + 1}
                  latestCosting={
                    (line.inquiryItemId
                      ? latestCostings[line.inquiryItemId]
                      : undefined) ?? null
                  }
                />
              ))}
            </section>
          )}

          {/* Editable form note */}
          {lines.length > 0 && (
            <p className="text-[13px] text-ink-muted -mt-1">
              Editing below updates <strong className="font-bold text-ink-soft">Product 1</strong> only. Products 2 and up are shown read-only - full per-product editing is coming soon.
            </p>
          )}

          {/* One form for the editable area, laid out as a cohesive
              feasibility-style banded card (all fields stay editable). */}
          <form onSubmit={onSubmit} noValidate>
            <div className="overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
              <LineBand title="Product" />
              <div className="flex flex-col gap-4 p-4">
                <p className="-mt-1 text-[12.5px] text-ink-muted">
                  Customer-facing product, drawing and grade - only changed fields are saved.
                </p>
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
              </div>

              <LineBand title="Pricing" />
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                <MiniField label="Final Cost (₹)">
                  <MoneyInput
                    aria-label="Final cost"
                    {...register("finalCost", { setValueAs: moneyValue })}
                  />
                </MiniField>
                <MiniField label="Negotiation (₹)">
                  <MoneyInput
                    aria-label="Negotiation"
                    {...register("negotiation", { setValueAs: moneyValue })}
                  />
                </MiniField>
                <MiniField label="Quote Price (₹)">
                  <MoneyInput
                    aria-label="Quote price"
                    {...register("quotePrice", { setValueAs: moneyValue })}
                  />
                </MiniField>
              </div>

              <LineBand title="Timeline & Validity" />
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
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

              <LineBand title="Quote Document" />
              <div className="flex flex-col gap-4 p-4">
                <Field id="qd-link" label="Quotation Link">
                  <input
                    id="qd-link"
                    type="url"
                    className="nt-input"
                    placeholder="https://"
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
              </div>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}

/**
 * "Costing Used" band - which costing REVISION this line's frozen cost basis
 * came from (Costing 1 / 2 / 3 per product), the latest revision's approved unit
 * cost, and a warning when a NEWER revision has landed since the quote was
 * priced. The revision model itself belongs to the costing workstream; this only
 * displays what the server resolved as `is_latest_revision`.
 *
 * No transition is triggered from here - whether a superseded basis should force
 * the quotation back to Draft / Pending Approval is an open question.
 */
function CostingUsedBand({
  line,
  latestCosting,
}: {
  line: QuotationLineWithSpec;
  latestCosting: LatestCostingRevision | null;
}) {
  const triGrid = "grid grid-cols-1 divide-x divide-y divide-[#c6cbdd] sm:grid-cols-3";

  if (!latestCosting) {
    return (
      <p className="px-4 py-3 text-[13px] text-ink-muted">
        No costing is linked to this line - its price has no cost basis to check
        against.
      </p>
    );
  }

  const stale = isCostBasisStale(line.finalCost, latestCosting.finalUnitCost);
  const delta = costBasisDelta(line.finalCost, latestCosting.finalUnitCost);

  return (
    <>
      <div className={triGrid}>
        <LineCell
          label="Revision"
          value={lineDash(
            revisionLabel(latestCosting.revisionNo, latestCosting.costingTypeLabel),
          )}
        />
        <LineCell
          label="Latest Approved Cost"
          value={money(latestCosting.finalUnitCost)}
        />
        <LineCell
          label="Costing Status"
          value={COSTING_DONE_STATUS_LABELS[latestCosting.costingDoneStatus]}
        />
      </div>
      {stale && (
        <p
          className="flex flex-wrap items-center gap-1.5 px-4 py-3 text-[13px] font-semibold"
          style={{ color: "var(--color-amber-deep)" }}
        >
          <AlertTriangle size={14} strokeWidth={2.4} />
          Quoted on {money(line.finalCost)}; the latest costing revision says{" "}
          {money(latestCosting.finalUnitCost)}
          {delta !== null && (
            <span className="tabular-nums">
              ({delta > 0 ? "+" : ""}
              {formatInr(delta)})
            </span>
          )}
          - re-check this price before sending.
        </p>
      )}
    </>
  );
}

/** Feasibility-style section band: indigo accent bar + black uppercase heading. */
/**
 * The band that OPENS a product — deliberately unlike the bands inside it.
 *
 * Both used to be `LineBand`: the product heading and its own Pricing / Costing
 * Used / Timeline sections were the same indigo strip at the same weight, so a
 * quotation with three products was a stack of near-identical bands with no
 * visible seam between one product and the next. Solid indigo with a numbered
 * badge makes "Product 2 starts here" unmissable while the sections inside it
 * stay quiet.
 */
function ProductBand({ n, title }: { n: number; title: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
      style={{ background: "linear-gradient(135deg, #3f3f94, #2f2f6f)" }}
    >
      <span className="grid h-[26px] min-w-[26px] shrink-0 place-items-center rounded-full bg-white/20 px-2 text-[13px] font-black tabular-nums text-white">
        {n}
      </span>
      <span className="text-[14px] font-black uppercase tracking-[0.12em] text-white">
        Product {n}
      </span>
      {title && (
        <>
          <span aria-hidden className="text-white/40">
            ·
          </span>
          <span className="min-w-0 truncate text-[13px] font-semibold text-white/85">
            {title}
          </span>
        </>
      )}
    </div>
  );
}

/** A section INSIDE a product (Pricing, Costing Used, Timeline). Quieter than
 *  ProductBand on purpose — it must never compete with the product heading. */
function LineBand({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-y border-[#dfe2ee] bg-[#f3f4fa] px-4 py-1.5">
      <span className="h-3 w-1 shrink-0 rounded-full bg-[#8b8fc4]" />
      <span className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-[#5b6076]">
        {title}
      </span>
    </div>
  );
}

/** Feasibility-style label/value cell (prominent label + bold value). */
function LineCell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">
        {label}
      </span>
      <span
        className={
          emphasis
            ? "text-[17px] font-black leading-snug tabular-nums text-[#14151a]"
            : "text-[15.5px] font-bold leading-snug text-[#14151a]"
        }
      >
        {value}
      </span>
    </div>
  );
}

/** em-dash placeholder in the muted feasibility tone. */
const lineDash = (v: React.ReactNode): React.ReactNode =>
  v == null || v === "" ? <span className="text-[#b3b8c2]">-</span> : v;

/** shape + dimensions → "Flat OD40×L105×W36×Thk9" for the line band heading. */
function specSummary(spec: QuotationLineWithSpec["spec"]): string {
  const dims: string[] = [];
  if (spec.outerDia) dims.push(`OD${spec.outerDia}`);
  if (spec.innerDia) dims.push(`ID${spec.innerDia}`);
  if (spec.length) dims.push(`L${spec.length}`);
  if (spec.width) dims.push(`W${spec.width}`);
  if (spec.thickness) dims.push(`Thk${spec.thickness}`);
  return [spec.shapeName ?? "", dims.join("×")].filter(Boolean).join(" ");
}

/**
 * One quoted line as a self-contained feasibility-style card: a banded heading
 * ("Line 1 · <shape+dims>"), a dense divided label/value grid of the read-only
 * spec (4-up on lg), then Pricing and Timeline bands with their own dense grids.
 * All values are read-through from the line/item; editing happens in the form.
 */
function QuotedLineCard({
  line,
  lineNo,
  latestCosting,
}: {
  line: QuotationLineWithSpec;
  lineNo: number;
  latestCosting: LatestCostingRevision | null;
}) {
  // Spec fields resolved read-through from the linked Item (§2.4); prices / qty
  // / timeline remain the line's own transactional facts.
  const spec = line.spec;
  const ask = line.ask;
  const summary = specSummary(spec) || ask.custProductName || "";
  const specGrid =
    "grid grid-cols-2 divide-x divide-y divide-[#c6cbdd] sm:grid-cols-3 lg:grid-cols-4";
  const triGrid = "grid grid-cols-1 divide-x divide-y divide-[#c6cbdd] sm:grid-cols-3";

  return (
    <div className="overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
      <ProductBand n={lineNo} title={summary} />
      <div className={specGrid}>
        <LineCell label="Qty" value={lineDash(line.qty)} />
        <LineCell label="Part No" value={lineDash(spec.partNo)} />
        <LineCell label="Grade (Cust)" value={lineDash(spec.gradeCustomer)} />
        <LineCell label="Grade Name" value={lineDash(spec.gradeNameForCust)} />
        <LineCell label="Tolerance" value={lineDash(spec.toleranceName)} />
        <LineCell label="Condition" value={lineDash(spec.conditionName)} />
        <LineCell label="Drawing No" value={lineDash(ask.custDrawingNo)} />
        <LineCell label="Rev" value={lineDash(ask.drawingRevisionNo)} />
      </div>

      <LineBand title="Pricing" />
      <div className={triGrid}>
        <LineCell label="Final Cost" value={money(line.finalCost)} />
        <LineCell label="Negotiation" value={money(line.negotiation)} />
        <LineCell label="Quote Price" value={money(line.quotePrice)} emphasis />
      </div>

      <LineBand title="Costing Used" />
      <CostingUsedBand line={line} latestCosting={latestCosting} />

      <LineBand title="Timeline & Validity" />
      <div className={triGrid}>
        <LineCell label="Development Time" value={lineDash(line.developmentTime)} />
        <LineCell label="Delivery Time" value={lineDash(line.deliveryTime)} />
        <LineCell label="Validity" value={lineDash(line.validity)} />
      </div>
    </div>
  );
}

/** The interpunct between facts on the header's second line. */
function Dot() {
  return (
    <span aria-hidden className="text-ink-subtle">
      ·
    </span>
  );
}
