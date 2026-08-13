"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Trash2, AlertTriangle, ShieldCheck, Lock } from "lucide-react";
import {
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
  DEPRECATED_COSTING_DONE_STATUSES,
  QUOTATION_STATUS_LABELS,
} from "@/db/enums";
import { CreateQuotationSchema } from "@/lib/validators/quotation";
import {
  createQuotation,
  getInquiryItemsForQuote,
} from "@/app/(app)/quotations/actions";
import type { QuoteAutofill } from "@/lib/queries/quotes";
import type { InquiryOption } from "@/lib/queries/inquiries";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Field,
  MiniField,
  SectionCard,
  Segmented,
  GroupHeader,
} from "@/components/inquiries/form-field";
import { useFormDraft } from "@/components/drafts/use-form-draft";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";
import { ViewPdfButton } from "@/components/forms/view-pdf-button";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands the
 *  parsed *output* (defaults applied, `""` folded to `undefined`) to the submit
 *  handler -- which is exactly what createQuotation takes. */
export type QuotationFormValues = z.input<typeof CreateQuotationSchema>;
type QuotationFormOutput = z.output<typeof CreateQuotationSchema>;

interface Props {
  inquiries: InquiryOption[];
  /** Unused for now (the SM owns the sales person) -- kept for parity with the
   *  house-style page wiring; reserved for a future "Created by" override. */
  employees: EmployeeOption[];
  /** Enable auto-saving this form as a draft while the user types. */
  enableDrafts?: boolean;
  /** When resuming a draft, its id (auto-save continues into the same draft). */
  resumeDraftId?: string;
  /** Prefill values (resumed draft payload). Spread over the base defaults. */
  initialValues?: Partial<QuotationFormValues>;
}

/** Deprecated costing values stay in the enum for data-compat only - they are
 *  never offered on a new record. */
const COSTING_DONE_OPTIONS = COSTING_DONE_STATUSES.filter(
  (s) => !(DEPRECATED_COSTING_DONE_STATUSES as readonly string[]).includes(s),
).map((s) => ({
  value: s,
  label: COSTING_DONE_STATUS_LABELS[s],
}));

const QUOTE_SENT_OPTIONS = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

/**
 * Per-line locked-costing handoff, keyed by inquiryItemId. Mirrors the server
 * hard-gate: a line is quotable only when `isLocked` is true AND `finalUnitCost`
 * is present (the approved per-piece cost). Populated from the SM's inquiry-item
 * seeds on SM select.
 */
interface LineLock {
  isLocked: boolean;
  finalUnitCost: string | null;
  approverName: string | null;
  approvedAt: Date | null;
}

/** A line is quote-ready only when its costing is approved & locked. */
function isLineReady(lock: LineLock | undefined): boolean {
  return Boolean(lock && lock.isLocked && lock.finalUnitCost != null);
}

/** Money / number <input> to number | undefined (no NaN); 0 is a valid amount. */
const moneyRegister = { setValueAs: (v: unknown) => moneyValue(v) };
const qtyRegister = moneyRegister;
function moneyValue(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Shape of one fresh, empty quote line. */
const EMPTY_LINE = {
  custProductName: "",
  custDrawingNo: "",
  drawingRevisionNo: "",
  qty: undefined,
  gradeCustomer: "",
  gradeNameForCust: "",
  tolerance: "",
  condition: "",
  partNo: "",
  finalCost: undefined,
  negotiation: undefined,
  quotePrice: undefined,
  developmentTime: "",
  deliveryTime: "",
  validity: "",
  inquiryItemId: undefined,
  itemId: undefined,
};

/**
 * New Quotation form -- Linked Enquiry (autofetch snapshot) / Products &
 * Pricing (per-line editor) / Status. The SM picker fetches getQuoteAutofill
 * on select and pre-seeds the per-line editor from the SM's inquiry_items;
 * Quote No auto-numbers `<SM>-Q01` when left blank.
 */
export function QuotationForm({
  inquiries,
  enableDrafts,
  resumeDraftId,
  initialValues,
}: Props) {
  const draftsOn = Boolean(enableDrafts);
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);
  // Gate: a product can't be added ad-hoc to a quote - it must flow through
  // New Enquiry → Primary Feasibility. Clicking "Add Product" opens this warning.
  const [showAddWarning, setShowAddWarning] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<QuoteAutofill | null>(null);
  const [autofetching, setAutofetching] = React.useState(false);
  // Per-line locked-costing state, keyed by inquiryItemId (Phase 5 handoff).
  const [lineLocks, setLineLocks] = React.useState<Record<string, LineLock>>(
    {},
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<QuotationFormValues, unknown, QuotationFormOutput>({
    resolver: zodResolver(CreateQuotationSchema),
    defaultValues: {
      inquiryId: "",
      quoteNo: "",
      // Legacy flat fields (still in schema, optional -- action mirrors from line #1)
      custProductName: "",
      qty: undefined,
      custDrawingNo: "",
      drawingRevisionNo: "",
      gradeCustomer: "",
      gradeNameForCust: "",
      tolerance: "",
      condition: "",
      partNo: "",
      finalCost: undefined,
      negotiation: undefined,
      quotePrice: undefined,
      developmentTime: "",
      deliveryTime: "",
      validity: "",
      costingDoneStatus: "not_done",
      quotationLink: "",
      quoteSent: false,
      lines: [{ ...EMPTY_LINE }],
      // Resumed-draft prefill overrides the base defaults above.
      ...initialValues,
    },
  });

  const { discard } = useFormDraft({
    kind: "quotation",
    enabled: draftsOn,
    resumeDraftId,
    watch,
    getValues,
  });

  const { fields, remove, replace } = useFieldArray({
    control,
    name: "lines",
  });

  // Stable landing spot for focus after a product row is removed (its Remove
  // button unmounts, so focus would otherwise fall to <body>).
  const addProductRef = React.useRef<HTMLButtonElement>(null);
  function handleRemoveLine(index: number) {
    remove(index);
    // After the row unmounts, park focus on "Add Product" so keyboard flow
    // continues instead of dropping to the top of the page.
    requestAnimationFrame(() => addProductRef.current?.focus());
  }

  const { formProps } = useKeyboardForm();

  /** On SM select: fetch the autofill snapshot (company/date captions) then
   *  seed the per-line editor from the SM's inquiry_items -- one line per
   *  product, prefilling product/drawing/qty/grade/tolerance/condition.
   *  Pricing + timeline stay blank for the user to fill. */
  async function onPickInquiry(id: string | undefined) {
    setValue("inquiryId", id ?? "", { shouldValidate: true });
    setSnapshot(null);
    setLineLocks({});
    if (!id) return;
    setAutofetching(true);
    try {
      const res = await fetch(`/api/quotes/autofill?inquiryId=${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as QuoteAutofill;
      setSnapshot(data);
      // Seed one line per inquiry_items row; fall back to single empty line.
      const seeds = await getInquiryItemsForQuote(id);
      if (seeds.length >= 1) {
        // Capture the locked-costing state per line for the lock UI + gate.
        const locks: Record<string, LineLock> = {};
        for (const s of seeds) {
          if (s.inquiryItemId) {
            locks[s.inquiryItemId] = {
              isLocked: s.isCostingLocked,
              finalUnitCost: s.finalUnitCost,
              approverName: s.approverName,
              approvedAt: s.approvedAt,
            };
          }
        }
        setLineLocks(locks);
        replace(
          seeds.map((s) => ({
            ...EMPTY_LINE,
            inquiryItemId: s.inquiryItemId ?? undefined,
            itemId: s.itemId ?? undefined,
            custProductName: s.custProductName ?? "",
            custDrawingNo: s.custDrawingNo ?? "",
            drawingRevisionNo: s.drawingRevisionNo ?? "",
            qty: s.qty != null ? Number(s.qty) : undefined,
            gradeCustomer: s.gradeCustomer ?? "",
            gradeNameForCust: s.gradeNameForCust ?? "",
            partNo: s.partNo ?? "",
            tolerance: s.tolerance ?? "",
            condition: s.condition ?? "",
            // Prefill the cost basis from the APPROVED locked unit cost - the
            // same authoritative value the server seeds. Fall back to the
            // chosen-costing per-piece figure only when nothing is locked yet.
            finalCost:
              s.finalUnitCost != null
                ? Number(s.finalUnitCost)
                : s.finalCost != null
                  ? Number(s.finalCost)
                  : undefined,
          })),
        );
      } else {
        replace([{ ...EMPTY_LINE }]);
      }
    } catch {
      fireToast({
        message: "Could not auto-fetch the enquiry -- fill the fields manually.",
        type: "error",
      });
    } finally {
      setAutofetching(false);
    }
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    // Client mirror of the server hard-gate: block submit if any enquiry-sourced
    // line lacks an approved & locked costing (also guards the Ctrl+Enter path,
    // which bypasses the disabled button).
    const blocked = (values.lines ?? [])
      .map((l, i) => ({ n: i + 1, iid: l.inquiryItemId }))
      .filter(({ iid }) => iid && !isLineReady(lineLocks[iid]))
      .map(({ n }) => n);
    if (blocked.length > 0) {
      const msg =
        blocked.length === 1
          ? `Product ${blocked[0]} has no approved & locked costing - approve its costing before quoting.`
          : `Products ${blocked.join(", ")} have no approved & locked costing - approve their costing before quoting.`;
      setServerError(msg);
      fireToast({ message: msg, type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await createQuotation(values);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // Quotation saved - retire the draft so it leaves the Drafts inbox.
      await discard();
      fireToast({
        message: `Quotation ${res.quoteNo ?? ""} created`.trim(),
        type: "success",
      });
      if (res.id) router.push(`/quotations/${res.id}`);
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as
    | string
    | undefined;

  // Phase 5 client gate (mirrors the server hard-gate): a line that came from an
  // enquiry can only be quoted once its costing is approved & locked. Collect
  // the 1-based numbers of any blocked lines so we can disable submit and warn.
  const watchedLines = watch("lines") ?? [];
  const blockedLineNumbers = watchedLines
    .map((l, i) => ({
      n: i + 1,
      iid: (l?.inquiryItemId ?? undefined) as string | undefined,
    }))
    .filter(({ iid }) => iid && !isLineReady(lineLocks[iid]))
    .map(({ n }) => n);
  const hasBlockedLine = blockedLineNumbers.length > 0;

  return (
    <form
      onSubmit={submit}
      onKeyDown={formProps.onKeyDown}
      className="flex flex-col gap-6"
      noValidate
    >
      {/* 1. Linked Enquiry */}
      <SectionCard
        title="Linked Enquiry"
        hint="Pick the SM this quote belongs to -- its company, product and grade are auto-fetched and editable below."
        inlineHint
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 items-start">
          <Field label="Enquiry (SM)" labelOnly required float>
            <Controller
              control={control}
              name="inquiryId"
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => void onPickInquiry(v || undefined)}
                  placeholder="Select an enquiry..."
                  searchPlaceholder="Search SM number or company..."
                  searchable
                  ariaLabel="Linked enquiry"
                  options={inquiries.map((o) => ({
                    value: o.id,
                    label: `${o.smNumber} - ${o.companyName}`,
                  }))}
                />
              )}
            />
          </Field>

          <Field id="qt-no" label="Quote No" float>
            <input
              id="qt-no"
              type="text"
              className="nt-input"
              placeholder="Auto-numbers <SM>-Q01 - leave blank"
              style={{ fontFamily: "var(--font-mono)", fontSize: 13.5 }}
              {...register("quoteNo")}
            />
          </Field>
        </div>

        {(snapshot || autofetching) && (
          <div className="rounded-xl border border-hairline bg-surface-soft px-4 py-3">
            <div className="grid grid-cols-6 gap-4 max-lg:grid-cols-3 max-md:grid-cols-2">
              <Caption label="Company">
                {autofetching ? "-" : snapshot?.companyName ?? "-"}
              </Caption>
              <Caption label="Enquiry Date">
                {autofetching
                  ? "-"
                  : snapshot?.enquiryDate
                    ? formatDate(new Date(snapshot.enquiryDate))
                    : "-"}
              </Caption>
              {snapshot?.salesPersonName && (
                <Caption label="Sales Person">{snapshot.salesPersonName}</Caption>
              )}
              {!autofetching && snapshot && (
                <SmDetailFields snapshot={snapshot} />
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* 2. Products & Pricing (per-line repeatable editor) */}
      <SectionCard
        title="Products & Pricing"
        hint="One line per product -- prefilled from the enquiry; add pricing per line."
        inlineHint
      >
        {fields.map((field, index) => {
          const iid = watchedLines[index]?.inquiryItemId as string | undefined;
          const lock = iid ? lineLocks[iid] : undefined;
          const ready = isLineReady(lock);
          return (
          <div
            key={field.id}
            className="flex flex-col gap-4 rounded-section border border-hairline p-5"
            style={{ background: "var(--color-surface-soft)" }}
          >
            {/* Card header */}
            <GroupHeader
              n={index + 1}
              label="Product"
              action={
                <button
                  type="button"
                  onClick={() => handleRemoveLine(index)}
                  disabled={fields.length === 1}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={13} strokeWidth={2.4} />
                  Remove
                </button>
              }
            />

            {/* Locked-costing handoff (Phase 5): a green "approved & locked"
                banner for ready lines, or an amber hard-block mirroring the
                server gate for lines whose costing isn't approved yet. Only
                shown for lines that originated on an enquiry (have an
                inquiry_item to gate against). */}
            {iid &&
              (ready ? (
                <CostingLockedBanner lock={lock as LineLock} />
              ) : (
                <CostingBlockedBanner />
              ))}

            {/* Product identity - one dense line; bottom-align so the input
                boxes line up even when some labels wrap to two lines. */}
            <div className="grid grid-cols-10 items-end gap-2.5 max-xl:grid-cols-5 max-md:grid-cols-2">
              <Field
                id={`lines.${index}.custProductName`}
                label="Customer Product Name"
                className="col-span-2" float
              >
                <input
                  id={`lines.${index}.custProductName`}
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Tungsten carbide insert, CNMG..."
                  {...register(`lines.${index}.custProductName`)}
                />
              </Field>
              <Field
                id={`lines.${index}.qty`}
                label="Qty" float
              >
                <input
                  id={`lines.${index}.qty`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  className="nt-input tabular-nums"
                  placeholder="0"
                  {...register(`lines.${index}.qty`, qtyRegister)}
                />
              </Field>
              <Field
                id={`lines.${index}.custDrawingNo`}
                label="Customer Drawing No" float
              >
                <input
                  id={`lines.${index}.custDrawingNo`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.custDrawingNo`)}
                />
              </Field>
              <Field
                id={`lines.${index}.drawingRevisionNo`}
                label="Drawing Revision No" float
              >
                <input
                  id={`lines.${index}.drawingRevisionNo`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.drawingRevisionNo`)}
                />
              </Field>
              <Field id={`lines.${index}.partNo`} label="Part No" float>
                <input
                  id={`lines.${index}.partNo`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.partNo`)}
                />
              </Field>
              <Field
                id={`lines.${index}.gradeNameForCust`}
                label="Grade Name for Customer" float
              >
                <input
                  id={`lines.${index}.gradeNameForCust`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.gradeNameForCust`)}
                />
              </Field>
              <Field
                id={`lines.${index}.gradeCustomer`}
                label="Grade (Customer)" float
              >
                <input
                  id={`lines.${index}.gradeCustomer`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.gradeCustomer`)}
                />
              </Field>
              <Field id={`lines.${index}.tolerance`} label="Tolerance" float>
                <input
                  id={`lines.${index}.tolerance`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.tolerance`)}
                />
              </Field>
              <Field id={`lines.${index}.condition`} label="Condition" float>
                <input
                  id={`lines.${index}.condition`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.condition`)}
                />
              </Field>
            </div>

            {/* Pricing */}
            <div
              className="pt-4"
              style={{ borderTop: "1px solid var(--color-hairline)" }}
            >
              <p className="mb-3 text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
                Pricing
              </p>
              <div className="flex flex-wrap items-start gap-x-5 gap-y-3.5">
                <MiniField label={ready ? "Final Cost (from approved costing)" : "Final Cost"} float>
                  <MoneyInput
                    aria-label={`Final cost line ${index + 1}`}
                    readOnly={ready}
                    title={
                      ready
                        ? "Sourced from the approved & locked costing - not editable here."
                        : undefined
                    }
                    className={ready ? "bg-surface-soft text-ink-muted" : undefined}
                    {...register(`lines.${index}.finalCost`, moneyRegister)}
                  />
                </MiniField>
                <MiniField label="Negotiation" float>
                  <MoneyInput
                    aria-label={`Negotiation line ${index + 1}`}
                    {...register(`lines.${index}.negotiation`, moneyRegister)}
                  />
                </MiniField>
                <MiniField label="Quote Price" float>
                  <MoneyInput
                    aria-label={`Quote price line ${index + 1}`}
                    {...register(`lines.${index}.quotePrice`, moneyRegister)}
                  />
                </MiniField>
              </div>
            </div>

            {/* Timeline & Validity */}
            <div
              className="pt-4"
              style={{ borderTop: "1px solid var(--color-hairline)" }}
            >
              <p className="mb-3 text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
                Timeline &amp; Validity
              </p>
              <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
                <Field
                  id={`lines.${index}.developmentTime`}
                  label="Development Time" float
                >
                  <input
                    id={`lines.${index}.developmentTime`}
                    type="text"
                    className="nt-input"
                    placeholder="e.g. 6-8 weeks"
                    {...register(`lines.${index}.developmentTime`)}
                  />
                </Field>
                <Field
                  id={`lines.${index}.deliveryTime`}
                  label="Delivery Time" float
                >
                  <input
                    id={`lines.${index}.deliveryTime`}
                    type="text"
                    className="nt-input"
                    placeholder="e.g. 30 days from PO"
                    {...register(`lines.${index}.deliveryTime`)}
                  />
                </Field>
                <Field id={`lines.${index}.validity`} label="Validity" float>
                  <input
                    id={`lines.${index}.validity`}
                    type="text"
                    className="nt-input"
                    placeholder="e.g. 30 days"
                    {...register(`lines.${index}.validity`)}
                  />
                </Field>
              </div>
            </div>
          </div>
          );
        })}

        {/* Add product - gated: opens the Primary-Feasibility warning instead of
            adding a blank line, because products must originate on the New
            Enquiry form and clear Primary Feasibility first. */}
        <div>
          <button
            ref={addProductRef}
            type="button"
            onClick={() => setShowAddWarning(true)}
            className="inline-flex items-center gap-2 rounded-chip border border-brand bg-brand/8 px-4 py-2.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/12"
          >
            + Add Product
          </button>
        </div>
      </SectionCard>

      {/* 3. Status */}
      <SectionCard title="Status">
        {/* The stage bucket is not picked here: a quotation created from an
            approved & locked costing IS a draft, and moves through the house
            buckets from the register / detail page. */}
        <p className="-mt-1 mb-3 text-[12.5px] text-ink-muted">
          This quotation will be created as{" "}
          <span className="font-bold text-ink-strong">
            {QUOTATION_STATUS_LABELS.draft}
          </span>
          . Move it through Need Info / Pending Approval / Quotation Approved
          from the register.
        </p>
        {/* 12-col so the controls get the width they actually need: the costing
            bucket picker is five options wide and takes its own row, then the
            two-option Quote Sent sits beside the link input. Equal thirds made
            the bucket picker overflow into its neighbour. */}
        <div className="grid grid-cols-12 gap-4 max-md:grid-cols-1 items-start">
          <Field className="col-span-12" label="Costing Done Status" labelOnly float>
            <Controller
              control={control}
              name="costingDoneStatus"
              render={({ field }) => (
                <Segmented
                  options={COSTING_DONE_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  allowClear={false}
                  ariaLabel="Costing done status"
                />
              )}
            />
          </Field>
          <Field className="col-span-4 max-lg:col-span-5" label="Quote Sent" labelOnly float>
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
          <Field className="col-span-8 max-lg:col-span-7" id="qt-link" label="Quotation Link" float>
            <input
              id="qt-link"
              type="url"
              className="nt-input"
              placeholder="https://..."
              {...register("quotationLink")}
            />
          </Field>
        </div>
      </SectionCard>

      {hasBlockedLine && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border px-4 py-3"
          style={{ borderColor: "#f0c98a", background: "#fdf6ea" }}
        >
          <AlertTriangle
            size={16}
            strokeWidth={2.4}
            className="mt-0.5 shrink-0"
            style={{ color: "#b45309" }}
          />
          <p className="text-[13px] leading-relaxed" style={{ color: "#8a5a12" }}>
            {blockedLineNumbers.length === 1
              ? `Product ${blockedLineNumbers[0]} has no approved & locked costing - approve its costing before quoting.`
              : `Products ${blockedLineNumbers.join(", ")} have no approved & locked costing - approve their costing before quoting.`}
          </p>
        </div>
      )}

      {(serverError || firstFieldError) && (
        <p
          className="font-semibold"
          style={{ fontSize: 14, color: "var(--color-red-deep)" }}
        >
          {serverError ?? firstFieldError}
        </p>
      )}

      <div
        className="flex items-center justify-end gap-3 pt-2"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <span className="text-[11px] text-ink-subtle">
          Ctrl / &#8984; + Enter to save
        </span>
        <ViewPdfButton title="Quotation" />
        <button
          type="submit"
          disabled={pending || hasBlockedLine}
          className="text-cta text-white px-8 py-4 rounded-chip transition-transform disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
            boxShadow: "0 6px 16px rgba(63, 63, 148, 0.34)",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.005em",
          }}
        >
          {pending ? "Creating..." : "Create Quotation"}
        </button>
      </div>

      {/* Add-product gate: a product must originate on the New Enquiry form and
          clear Primary Feasibility before it can be quoted. "Add Product" opens
          this warning; its own Add Product button routes to the New Enquiry form. */}
      {showAddWarning && (
        <AddProductGate
          onClose={() => setShowAddWarning(false)}
          onGoToEnquiry={() => router.push("/enquiries/new" as Route)}
        />
      )}
    </form>
  );
}

/** Focusable-element selector for the modal focus trap. */
const MODAL_FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Primary-Feasibility gate dialog shown when the user clicks "+ Add Product".
 * Keyboard-first: focus moves into the dialog on open and is restored to the
 * opener on close, Tab/Shift+Tab are trapped inside, Esc (and the backdrop)
 * closes it, and Ctrl/Cmd+Enter is swallowed so it can't submit the form
 * beneath while the gate is open.
 */
function AddProductGate({
  onClose,
  onGoToEnquiry,
}: {
  onClose: () => void;
  onGoToEnquiry: () => void;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    // Remember what to return focus to, then move focus into the dialog.
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(MODAL_FOCUSABLE);
    first?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    // Don't let Ctrl/Cmd+Enter fall through to the form and submit it while the
    // gate is open.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const nodes = Array.from(
      panel.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE),
    ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !panel.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-product-gate-title"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div
        ref={panelRef}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="h-1.5 w-full" style={{ background: "#d97706" }} />
        <div className="flex items-start gap-3 px-5 pt-4">
          <span
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: "#fdf0d9", color: "#b45309" }}
          >
            <AlertTriangle size={18} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2
              id="add-product-gate-title"
              className="text-[16px] font-extrabold leading-tight text-ink-strong"
            >
              Primary Feasibility Required
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
              You can&apos;t add a product to a quotation until its Primary
              Feasibility is done. Products flow through the pipeline: New
              Enquiry → Primary Feasibility → Costing → Quotation. Add the
              product on the New Enquiry form to start it.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-pill border border-[#dcdce8] bg-white px-4 text-[13px] font-bold text-ink-soft transition hover:border-ink-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onGoToEnquiry}
            className="inline-flex h-10 items-center gap-1.5 rounded-pill px-5 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
            style={{
              background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
              boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
            }}
          >
            Add Product
          </button>
        </div>
      </div>
    </div>
  );
}

/** Green "approved & locked" banner shown on a quote-ready product line - the
 *  cost basis is sourced from the approved costing and can't drift here. */
function CostingLockedBanner({ lock }: { lock: LineLock }) {
  const who = lock.approverName?.trim();
  const when = lock.approvedAt ? formatDate(new Date(lock.approvedAt)) : null;
  const meta = [who && `by ${who}`, when].filter(Boolean).join(" · ");
  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5"
      style={{ borderColor: "#bfe6cb", background: "#eef8f1" }}
    >
      <ShieldCheck
        size={15}
        strokeWidth={2.4}
        className="shrink-0"
        style={{ color: "#15803d" }}
      />
      <span className="text-[12.5px] font-semibold" style={{ color: "#15803d" }}>
        Costing approved &amp; locked
      </span>
      {meta && (
        <span className="text-[12px] text-ink-subtle">{meta}</span>
      )}
    </div>
  );
}

/** Amber hard-block for a line whose costing isn't approved yet - mirrors the
 *  server gate wording; submit is disabled while any such line is present. */
function CostingBlockedBanner() {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border px-3.5 py-3"
      style={{ borderColor: "#f0c98a", background: "#fdf6ea" }}
    >
      <Lock
        size={15}
        strokeWidth={2.4}
        className="mt-0.5 shrink-0"
        style={{ color: "#b45309" }}
      />
      <div className="min-w-0">
        <p className="text-[12.5px] font-bold" style={{ color: "#8a5a12" }}>
          Costing not approved - can&apos;t be quoted
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "#8a5a12" }}>
          This product has no approved &amp; locked costing. Approve its costing
          (Costing → Decision) before it can be added to a quotation.
        </p>
      </div>
    </div>
  );
}

function Caption({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // min-w-0 lets the grid cell shrink; break-words wraps long values (e.g. a
    // long contact email) instead of overflowing the layout at larger zoom.
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong break-words">
        {children}
      </span>
    </div>
  );
}

/** Builds a compact dimension string from non-null values.
 *  OD is prefixed with a diameter symbol; parts joined with x. */
function buildDimString(s: QuoteAutofill): string | null {
  const parts: string[] = [];
  if (s.outerDia != null) parts.push(`Ø${s.outerDia}`);
  if (s.innerDia != null) parts.push(s.innerDia);
  if (s.length != null) parts.push(s.length);
  if (s.width != null) parts.push(s.width);
  if (s.thickness != null) parts.push(s.thickness);
  return parts.length > 0 ? parts.join(" × ") : null;
}

/** Read-only SM detail cells -- shape, dimensions, contact. Returned as a
 *  fragment so they sit as siblings of Company / Enquiry Date / Sales Person in
 *  the single snapshot grid. Each present section is one grid cell. */
function SmDetailFields({ snapshot: s }: { snapshot: QuoteAutofill }) {
  const dimStr = buildDimString(s);
  const contactName =
    [s.contactFirstName, s.contactLastName].filter(Boolean).join(" ") || null;
  const hasShape = s.shape != null;
  const hasDims = dimStr != null || s.dimensionNotes != null;
  const hasContact =
    contactName != null || s.contactNo != null || s.contactEmail != null;

  return (
    <>
      {hasShape && <Caption label="Shape">{s.shape}</Caption>}
      {hasDims && (
        <Caption label="Dimensions">
          {[dimStr, s.dimensionNotes].filter(Boolean).join(" - ") || "-"}
        </Caption>
      )}
      {hasContact && (
        <Caption label="Contact">
          {[contactName, s.contactNo, s.contactEmail]
            .filter(Boolean)
            .join(" · ") || "-"}
        </Caption>
      )}
    </>
  );
}
