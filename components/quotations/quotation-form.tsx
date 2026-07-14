"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Trash2 } from "lucide-react";
import {
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
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
import {
  Field,
  MiniField,
  SectionCard,
  Segmented,
  GroupHeader,
} from "@/components/inquiries/form-field";
import { useFormDraft } from "@/components/drafts/use-form-draft";

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

const COSTING_DONE_OPTIONS = COSTING_DONE_STATUSES.map((s) => ({
  value: s,
  label: COSTING_DONE_STATUS_LABELS[s],
}));

const QUOTE_SENT_OPTIONS = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

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
  const [snapshot, setSnapshot] = React.useState<QuoteAutofill | null>(null);
  const [autofetching, setAutofetching] = React.useState(false);

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

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "lines",
  });

  /** On SM select: fetch the autofill snapshot (company/date captions) then
   *  seed the per-line editor from the SM's inquiry_items -- one line per
   *  product, prefilling product/drawing/qty/grade/tolerance/condition.
   *  Pricing + timeline stay blank for the user to fill. */
  async function onPickInquiry(id: string | undefined) {
    setValue("inquiryId", id ?? "", { shouldValidate: true });
    setSnapshot(null);
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
            finalCost: s.finalCost != null ? Number(s.finalCost) : undefined,
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

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* 1. Linked Enquiry */}
      <SectionCard
        title="Linked Enquiry"
        hint="Pick the SM this quote belongs to -- its company, product and grade are auto-fetched and editable below."
        inlineHint
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 items-start">
          <Field label="Enquiry (SM)" labelOnly required>
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

          <Field id="qt-no" label="Quote No">
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
        {fields.map((field, index) => (
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
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={13} strokeWidth={2.4} />
                  Remove
                </button>
              }
            />

            {/* Product identity - one dense line; bottom-align so the input
                boxes line up even when some labels wrap to two lines. */}
            <div className="grid grid-cols-10 items-end gap-2.5 max-xl:grid-cols-5 max-md:grid-cols-2">
              <Field
                id={`lines.${index}.custProductName`}
                label="Customer Product Name"
                className="col-span-2"
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
                label="Qty"
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
                label="Customer Drawing No"
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
                label="Drawing Revision No"
              >
                <input
                  id={`lines.${index}.drawingRevisionNo`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.drawingRevisionNo`)}
                />
              </Field>
              <Field id={`lines.${index}.partNo`} label="Part No">
                <input
                  id={`lines.${index}.partNo`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.partNo`)}
                />
              </Field>
              <Field
                id={`lines.${index}.gradeNameForCust`}
                label="Grade Name for Customer"
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
                label="Grade (Customer)"
              >
                <input
                  id={`lines.${index}.gradeCustomer`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.gradeCustomer`)}
                />
              </Field>
              <Field id={`lines.${index}.tolerance`} label="Tolerance">
                <input
                  id={`lines.${index}.tolerance`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.tolerance`)}
                />
              </Field>
              <Field id={`lines.${index}.condition`} label="Condition">
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
                <MiniField label="Final Cost">
                  <MoneyInput
                    aria-label={`Final cost line ${index + 1}`}
                    {...register(`lines.${index}.finalCost`, moneyRegister)}
                  />
                </MiniField>
                <MiniField label="Negotiation">
                  <MoneyInput
                    aria-label={`Negotiation line ${index + 1}`}
                    {...register(`lines.${index}.negotiation`, moneyRegister)}
                  />
                </MiniField>
                <MiniField label="Quote Price">
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
                  label="Development Time"
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
                  label="Delivery Time"
                >
                  <input
                    id={`lines.${index}.deliveryTime`}
                    type="text"
                    className="nt-input"
                    placeholder="e.g. 30 days from PO"
                    {...register(`lines.${index}.deliveryTime`)}
                  />
                </Field>
                <Field id={`lines.${index}.validity`} label="Validity">
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
        ))}

        {/* Add line button */}
        <div>
          <button
            type="button"
            onClick={() => append({ ...EMPTY_LINE })}
            className="inline-flex items-center gap-2 rounded-chip border border-brand bg-brand/8 px-4 py-2.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/12"
          >
            + Add Product
          </button>
        </div>
      </SectionCard>

      {/* 3. Status */}
      <SectionCard title="Status">
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1 items-start">
          <Field label="Costing Done Status" labelOnly>
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
          <Field id="qt-link" label="Quotation Link">
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
        <button
          type="submit"
          disabled={pending}
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
    </form>
  );
}

/** Rs-prefixed number input -- the rupee sign sits inside the field so the
 *  amount always reads as money. */
const MoneyInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function MoneyInput(props, ref) {
  return (
    <div className="relative w-[180px]">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-subtle">
        &#8377;
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

function Caption({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong">
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
