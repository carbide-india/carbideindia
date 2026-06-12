"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
} from "@/db/enums";
import { CreateQuotationSchema } from "@/lib/validators/quotation";
import { createQuotation } from "@/app/(app)/quotations/actions";
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
} from "@/components/inquiries/form-field";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands the
 *  parsed *output* (defaults applied, `""` folded to `undefined`) to the submit
 *  handler — which is exactly what createQuotation takes. */
export type QuotationFormValues = z.input<typeof CreateQuotationSchema>;
type QuotationFormOutput = z.output<typeof CreateQuotationSchema>;

interface Props {
  inquiries: InquiryOption[];
  /** Unused for now (the SM owns the sales person) — kept for parity with the
   *  house-style page wiring; reserved for a future "Created by" override. */
  employees: EmployeeOption[];
}

const COSTING_DONE_OPTIONS = COSTING_DONE_STATUSES.map((s) => ({
  value: s,
  label: COSTING_DONE_STATUS_LABELS[s],
}));

const QUOTE_SENT_OPTIONS = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

/** Money / number <input> → number | undefined (no NaN); 0 is a valid amount. */
const moneyRegister = { setValueAs: (v: unknown) => moneyValue(v) };
const qtyRegister = moneyRegister;
function moneyValue(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * New Quotation form — Linked Enquiry (autofetch snapshot) / Product / Pricing
 * / Timeline & Validity / Status. The SM picker fetches getQuoteAutofill on
 * select and prefills the editable snapshot fields; Quote No auto-numbers
 * `<SM>-Q01` when left blank.
 */
export function QuotationForm({ inquiries }: Props) {
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
    formState: { errors },
  } = useForm<QuotationFormValues, unknown, QuotationFormOutput>({
    resolver: zodResolver(CreateQuotationSchema),
    defaultValues: {
      inquiryId: "",
      quoteNo: "",
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
    },
  });

  /** On SM select: fetch the autofill snapshot and prefill the editable
   *  product/grade fields (company + enquiry date are shown as captions). */
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
      if (data.productDescription)
        setValue("custProductName", data.productDescription);
      setValue(
        "qty",
        data.quantityNos != null ? Number(data.quantityNos) : undefined,
      );
      // company/enquiry date stay read-only captions.
      if (data.gradeName) setValue("gradeCustomer", data.gradeName);
      if (data.toleranceName) setValue("tolerance", data.toleranceName);
      if (data.conditionName) setValue("condition", data.conditionName);
    } catch {
      fireToast({
        message: "Could not auto-fetch the enquiry — fill the fields manually.",
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
      {/* ── 1 · Linked Enquiry ───────────────────────────────────────── */}
      <SectionCard
        title="Linked Enquiry"
        hint="Pick the SM this quote belongs to — its company, product and grade are auto-fetched and editable below."
      >
        <Field label="Enquiry (SM)" labelOnly required>
          <Controller
            control={control}
            name="inquiryId"
            render={({ field }) => (
              <Select
                value={field.value ?? ""}
                onValueChange={(v) => void onPickInquiry(v || undefined)}
                placeholder="Select an enquiry…"
                searchPlaceholder="Search SM number or company…"
                searchable
                ariaLabel="Linked enquiry"
                options={inquiries.map((o) => ({
                  value: o.id,
                  label: `${o.smNumber} — ${o.companyName}`,
                }))}
              />
            )}
          />
        </Field>

        {(snapshot || autofetching) && (
          <div className="flex flex-wrap items-start gap-x-8 gap-y-2 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
            <Caption label="Company">
              {autofetching ? "…" : snapshot?.companyName ?? "—"}
            </Caption>
            <Caption label="Enquiry Date">
              {autofetching
                ? "…"
                : snapshot?.enquiryDate
                  ? formatDate(new Date(snapshot.enquiryDate))
                  : "—"}
            </Caption>
            {snapshot?.salesPersonName && (
              <Caption label="Sales Person">{snapshot.salesPersonName}</Caption>
            )}
          </div>
        )}

        <Field id="qt-no" label="Quote No">
          <input
            id="qt-no"
            type="text"
            className="nt-input"
            placeholder="Leave blank to auto-number"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13.5 }}
            {...register("quoteNo")}
          />
          <p className="text-[12.5px] text-ink-subtle">
            Quote No auto-numbers as{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>&lt;SM&gt;-Q01</span>{" "}
            — leave blank.
          </p>
        </Field>
      </SectionCard>

      {/* ── 2 · Product ──────────────────────────────────────────────── */}
      <SectionCard
        title="Product"
        hint="Customer-facing product, drawing and grade — prefilled from the SM, edit as needed."
      >
        <div className="grid grid-cols-[1fr_auto] gap-4 max-md:grid-cols-1">
          <Field id="qt-product" label="Customer Product Name">
            <input
              id="qt-product"
              type="text"
              className="nt-input"
              placeholder="e.g. Tungsten carbide insert, CNMG…"
              {...register("custProductName")}
            />
          </Field>
          <Field id="qt-qty" label="Qty" className="md:w-[180px]">
            <input
              id="qt-qty"
              type="number"
              inputMode="numeric"
              min={0}
              step="any"
              className="nt-input tabular-nums"
              placeholder="0"
              {...register("qty", qtyRegister)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="qt-drw" label="Customer Drawing No">
            <input id="qt-drw" type="text" className="nt-input" {...register("custDrawingNo")} />
          </Field>
          <Field id="qt-rev" label="Drawing Revision No">
            <input id="qt-rev" type="text" className="nt-input" {...register("drawingRevisionNo")} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="qt-part" label="Part No">
            <input id="qt-part" type="text" className="nt-input" {...register("partNo")} />
          </Field>
          <Field id="qt-gradecust" label="Grade Name for Customer">
            <input id="qt-gradecust" type="text" className="nt-input" {...register("gradeNameForCust")} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="qt-grade" label="Grade (Customer)">
            <input id="qt-grade" type="text" className="nt-input" {...register("gradeCustomer")} />
          </Field>
          <Field id="qt-tol" label="Tolerance">
            <input id="qt-tol" type="text" className="nt-input" {...register("tolerance")} />
          </Field>
          <Field id="qt-cond" label="Condition">
            <input id="qt-cond" type="text" className="nt-input" {...register("condition")} />
          </Field>
        </div>
      </SectionCard>

      {/* ── 3 · Pricing ──────────────────────────────────────────────── */}
      <SectionCard
        title="Pricing"
        hint="All amounts in ₹. Negotiation is the give, Quote Price is what the customer sees."
      >
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3.5">
          <MiniField label="Final Cost">
            <MoneyInput aria-label="Final cost" {...register("finalCost", moneyRegister)} />
          </MiniField>
          <MiniField label="Negotiation">
            <MoneyInput aria-label="Negotiation" {...register("negotiation", moneyRegister)} />
          </MiniField>
          <MiniField label="Quote Price">
            <MoneyInput aria-label="Quote price" {...register("quotePrice", moneyRegister)} />
          </MiniField>
        </div>
      </SectionCard>

      {/* ── 4 · Timeline & Validity ──────────────────────────────────── */}
      <SectionCard
        title="Timeline & Validity"
        hint="Free-text per Manan's sheet — e.g. “6–8 weeks”, “30 days from PO”."
      >
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="qt-dev" label="Development Time">
            <input id="qt-dev" type="text" className="nt-input" {...register("developmentTime")} />
          </Field>
          <Field id="qt-del" label="Delivery Time">
            <input id="qt-del" type="text" className="nt-input" {...register("deliveryTime")} />
          </Field>
          <Field id="qt-val" label="Validity">
            <input id="qt-val" type="text" className="nt-input" {...register("validity")} />
          </Field>
        </div>
      </SectionCard>

      {/* ── 5 · Status ───────────────────────────────────────────────── */}
      <SectionCard title="Status">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 items-start">
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
        </div>
        <Field id="qt-link" label="Quotation Link">
          <input
            id="qt-link"
            type="url"
            className="nt-input"
            placeholder="https://…"
            {...register("quotationLink")}
          />
        </Field>
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
          {pending ? "Creating…" : "Create Quotation"}
        </button>
      </div>
    </form>
  );
}

/** ₹-prefixed number input — the rupee sign sits inside the field so the
 *  amount always reads as money. */
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
