"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Trash2 } from "lucide-react";
import { CreateSalesOrderSchema } from "@/lib/validators/sales-order";
import {
  createSalesOrder,
  getInquiryItemsForSalesOrder,
} from "@/app/(app)/sales-orders/actions";
import type {
  QuoteAutofill,
  QuotationAutofill,
  QuotationOption,
} from "@/lib/queries/quotes";
import type { InquiryOption } from "@/lib/queries/inquiries";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Field,
  SectionCard,
  Segmented,
} from "@/components/inquiries/form-field";
import { useFormDraft } from "@/components/drafts/use-form-draft";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands the
 *  parsed *output* (defaults applied, `""` folded to `undefined`) to the submit
 *  handler -- which is exactly what createSalesOrder takes. */
export type SoFormValues = z.input<typeof CreateSalesOrderSchema>;
type SoFormOutput = z.output<typeof CreateSalesOrderSchema>;

interface Props {
  inquiries: InquiryOption[];
  quotations: QuotationOption[];
  /** Unused for now (the SM owns the sales person) -- kept for parity with the
   *  house-style page wiring; reserved for a future "Created by" override. */
  employees: EmployeeOption[];
  /** Prefill values (e.g. a resumed draft) spread over the base defaults. */
  initialValues?: Partial<SoFormValues>;
  /** Enable auto-saving this form as a draft. */
  enableDrafts?: boolean;
  /** When resuming a draft, its id (auto-save continues into the same draft). */
  resumeDraftId?: string;
}

const SO_SENT_OPTIONS = [
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

/** Shape of one fresh, empty sales-order line. */
const EMPTY_LINE = {
  custProductName: "",
  qty: undefined,
  partNo: "",
  quotePrice: undefined,
  developmentTime: "",
  deliveryTime: "",
  validity: "",
  inquiryItemId: undefined,
  quotationItemId: undefined,
  itemId: undefined,
} as const;

/**
 * New Sales Order form -- Linked Enquiry (SM autofetch snapshot + Linked
 * Quotation prefill) / Products & Pricing (per-line editor seeded from SM
 * products) / Customer PO / Sales Order Docs. The SM picker seeds the
 * per-line editor from the SM's inquiry_items; the Quotation picker fetches
 * getQuotationAutofill to prefill price/timeline/validity/link on line 1.
 * SO No auto-numbers `<SM>-SO01` server-side.
 */
export function SoForm({
  inquiries,
  quotations,
  initialValues,
  enableDrafts,
  resumeDraftId,
}: Props) {
  const draftsOn = Boolean(enableDrafts);
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState<QuoteAutofill | null>(null);
  const [autofetching, setAutofetching] = React.useState(false);
  const [quoteId, setQuoteId] = React.useState("");

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<SoFormValues, unknown, SoFormOutput>({
    resolver: zodResolver(CreateSalesOrderSchema),
    defaultValues: {
      inquiryId: "",
      quotationId: undefined,
      soNo: "",
      quotationLink: "",
      customerPoNo: "",
      customerPoDate: "",
      customerPoLink: "",
      customerSoLink: "",
      customerSoSent: false,
      productionSoLink: "",
      lines: [{ ...EMPTY_LINE }],
      // A resumed draft prefills over the base defaults above.
      ...initialValues,
    },
  });

  const { discard } = useFormDraft({
    kind: "sales-order",
    enabled: draftsOn,
    resumeDraftId,
    watch,
    getValues,
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "lines",
  });

  /** On SM select: fetch the autofill snapshot (company/date/sales person captions)
   *  then seed the per-line editor from the SM's inquiry_items -- one line per
   *  product, prefilling product name + qty; pricing + timeline stay blank. */
  async function onPickInquiry(id: string | undefined) {
    setValue("inquiryId", id ?? "", { shouldValidate: true });
    setSnapshot(null);
    if (!id) {
      replace([{ ...EMPTY_LINE }]);
      return;
    }
    setAutofetching(true);
    try {
      const res = await fetch(`/api/quotes/autofill?inquiryId=${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as QuoteAutofill;
      setSnapshot(data);
      // Seed one line per inquiry_items row; fall back to single empty line.
      const seeds = await getInquiryItemsForSalesOrder(id);
      if (seeds.length >= 1) {
        replace(
          seeds.map((s) => ({
            ...EMPTY_LINE,
            inquiryItemId: s.inquiryItemId ?? undefined,
            itemId: s.itemId ?? undefined,
            custProductName: s.custProductName ?? "",
            qty: s.qty != null ? Number(s.qty) : undefined,
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

  /** On Quotation select: fetch the quote's price/timeline/validity/link and
   *  prefill the editable inputs on line 1 (kept editable). */
  async function onPickQuotation(id: string | undefined) {
    setQuoteId(id ?? "");
    setValue("quotationId", id ?? undefined, { shouldValidate: true });
    if (!id) return;
    try {
      const res = await fetch(`/api/quotes/quotation-autofill?quotationId=${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as QuotationAutofill;
      if (data.quotePrice != null) setValue("lines.0.quotePrice", Number(data.quotePrice));
      if (data.developmentTime) setValue("lines.0.developmentTime", data.developmentTime);
      if (data.deliveryTime) setValue("lines.0.deliveryTime", data.deliveryTime);
      if (data.validity) setValue("lines.0.validity", data.validity);
      if (data.quotationLink) setValue("quotationLink", data.quotationLink);
      if (data.partNo) setValue("lines.0.partNo", data.partNo);
    } catch {
      fireToast({
        message: "Could not auto-fetch the quotation -- fill the fields manually.",
        type: "error",
      });
    }
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createSalesOrder(values);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // Sales order saved -- retire the draft so it leaves the Drafts inbox.
      await discard();
      fireToast({
        message: `Sales Order ${res.soNo ?? ""} created`.trim(),
        type: "success",
      });
      if (res.id) router.push(`/sales-orders/${res.id}`);
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as
    | string
    | undefined;

  const { formProps } = useKeyboardForm();

  return (
    <form
      onSubmit={submit}
      onKeyDown={formProps.onKeyDown}
      className="flex flex-col gap-6"
      noValidate
    >
      {/* -- 1 . Linked Enquiry ------------------------------------------- */}
      <SectionCard
        title="Linked Enquiry"
        inlineHint
        hint="Pick the SM -- company, sales person and products auto-fetch. Link the quotation to pull its pricing."
      >
        {/* Enquiry · Linked Quotation · SO No · Quotation Link - one line. */}
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
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
          <Field label="Linked Quotation" labelOnly>
            <Select
              value={quoteId}
              onValueChange={(v) => void onPickQuotation(v || undefined)}
              placeholder="Optional -- link a quotation to pull its pricing..."
              searchPlaceholder="Search quote number or company..."
              searchable
              ariaLabel="Linked quotation"
              options={quotations.map((o) => ({
                value: o.id,
                label: `${o.quoteNo} - ${o.companyName ?? "-"}`,
              }))}
            />
          </Field>
          <Field id="so-no" label="SO No">
            <input
              id="so-no"
              type="text"
              className="nt-input"
              placeholder="Blank auto-numbers <SM>-SO01"
              style={{ fontFamily: "var(--font-mono)", fontSize: 13.5 }}
              {...register("soNo")}
            />
          </Field>
          <Field id="so-link" label="Quotation Link">
            <input
              id="so-link"
              type="url"
              className="nt-input"
              placeholder="https://"
              {...register("quotationLink")}
            />
          </Field>
        </div>

        {(snapshot || autofetching) && (
          <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
              <Caption label="Company">
                {autofetching ? "..." : snapshot?.companyName ?? "-"}
              </Caption>
              <Caption label="Enquiry Date">
                {autofetching
                  ? "..."
                  : snapshot?.enquiryDate
                    ? formatDate(new Date(snapshot.enquiryDate))
                    : "-"}
              </Caption>
              <Caption label="Sales Person">
                {autofetching ? "..." : snapshot?.salesPersonName ?? "-"}
              </Caption>
            </div>
            {!autofetching && snapshot && <SmDetailsRow snapshot={snapshot} />}
          </div>
        )}
      </SectionCard>

      {/* -- 2 . Products & Pricing (per-line editor) --------------------- */}
      <SectionCard
        title="Products &amp; Pricing"
        inlineHint
        hint="One line per product -- prefilled from the enquiry. Add quote price and timeline per line."
      >
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="flex flex-col gap-4 rounded-xl border border-hairline bg-surface-soft px-4 py-4"
          >
            {/* Line header */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
                Line {index + 1}
              </p>
              <button
                type="button"
                aria-label={`Remove line ${index + 1}`}
                disabled={fields.length === 1}
                onClick={() => remove(index)}
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Product -- name (wide) + qty + part no on one row */}
            <div className="grid grid-cols-4 gap-4 max-md:grid-cols-1">
              <Field
                id={`lines.${index}.custProductName`}
                label="Cust Product Name"
                className="col-span-2 max-md:col-span-1"
              >
                <input
                  id={`lines.${index}.custProductName`}
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Tungsten carbide insert, CNMG"
                  {...register(`lines.${index}.custProductName`)}
                />
              </Field>
              <Field id={`lines.${index}.qty`} label="Qty">
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
              <Field id={`lines.${index}.partNo`} label="Part No">
                <input
                  id={`lines.${index}.partNo`}
                  type="text"
                  className="nt-input"
                  {...register(`lines.${index}.partNo`)}
                />
              </Field>
            </div>

            {/* Pricing, timeline & validity -- one row */}
            <div
              className="grid grid-cols-4 gap-4 pt-4 max-md:grid-cols-1"
              style={{ borderTop: "1px solid var(--color-hairline)" }}
            >
              <Field label="Quote Price" labelOnly>
                <MoneyInput
                  aria-label={`Quote price line ${index + 1}`}
                  {...register(`lines.${index}.quotePrice`, moneyRegister)}
                />
              </Field>
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

      {/* -- 3 . Customer PO -------------------------------------------- */}
      <SectionCard
        title="Customer PO"
        inlineHint
        hint="The purchase order the customer raised against the quote."
      >
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="so-pono" label="Customer PO No">
            <input id="so-pono" type="text" className="nt-input" {...register("customerPoNo")} />
          </Field>
          <Field id="so-podate" label="Customer PO Date">
            <input id="so-podate" type="date" className="nt-input" {...register("customerPoDate")} />
          </Field>
          <Field id="so-polink" label="Customer PO Link">
            <input
              id="so-polink"
              type="url"
              className="nt-input"
              placeholder="https://..."
              {...register("customerPoLink")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* -- 4 . Sales Order Docs --------------------------------------- */}
      <SectionCard
        title="Sales Order Docs"
        inlineHint
        hint="The customer-facing SO sent back and the internal production SO."
      >
        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-3 max-md:grid-cols-1">
          <Field id="so-custlink" label="Customer SO Link">
            <input
              id="so-custlink"
              type="url"
              className="nt-input"
              placeholder="https://..."
              {...register("customerSoLink")}
            />
          </Field>
          <Field id="so-prodlink" label="Production SO Link">
            <input
              id="so-prodlink"
              type="url"
              className="nt-input"
              placeholder="https://..."
              {...register("productionSoLink")}
            />
          </Field>
          <Field label="Customer SO Sent" labelOnly>
            <Controller
              control={control}
              name="customerSoSent"
              render={({ field }) => (
                <Segmented
                  options={SO_SENT_OPTIONS}
                  value={field.value ? "yes" : "no"}
                  onChange={(v) => field.onChange(v === "yes")}
                  allowClear={false}
                  activeTone="brand"
                  ariaLabel="Customer SO sent"
                />
              )}
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
        <span className="text-[11px] text-ink-subtle">
          Ctrl / &#8984; + Enter to save
        </span>
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
          {pending ? "Creating..." : "Create Sales Order"}
        </button>
      </div>
    </form>
  );
}

function Caption({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong">{children}</span>
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

/** Read-only "SM Details" row -- shape, dimensions, contact.
 *  Renders nothing when all three sections are empty. */
function SmDetailsRow({ snapshot: s }: { snapshot: QuoteAutofill }) {
  const dimStr = buildDimString(s);
  const contactName = [s.contactFirstName, s.contactLastName]
    .filter(Boolean)
    .join(" ") || null;
  const hasShape = s.shape != null;
  const hasDims = dimStr != null || s.dimensionNotes != null;
  const hasContact = contactName != null || s.contactNo != null || s.contactEmail != null;

  if (!hasShape && !hasDims && !hasContact) return null;

  return (
    <div
      className="flex flex-wrap items-start gap-x-8 gap-y-2 pt-2"
      style={{ borderTop: "1px solid var(--color-hairline)" }}
    >
      {hasShape && <Caption label="Shape">{s.shape}</Caption>}
      {hasDims && (
        <Caption label="Dimensions">
          {[dimStr, s.dimensionNotes].filter(Boolean).join(" - ") || "-"}
        </Caption>
      )}
      {hasContact && (
        <Caption label="Contact">
          {[contactName, s.contactNo, s.contactEmail].filter(Boolean).join(" · ") || "-"}
        </Caption>
      )}
    </div>
  );
}
