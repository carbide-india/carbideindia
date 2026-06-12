"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  NEGOTIATION_STATUSES,
  NEGOTIATION_STATUS_LABELS,
} from "@/db/enums";
import { CreateNegotiationSchema } from "@/lib/validators/negotiation";
import { createNegotiation } from "@/app/(app)/negotiations/actions";
import type { QuoteAutofill, QuotationAutofill, QuotationOption } from "@/lib/queries/quotes";
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
 *  handler — which is exactly what createNegotiation takes. */
export type NegotiationFormValues = z.input<typeof CreateNegotiationSchema>;
type NegotiationFormOutput = z.output<typeof CreateNegotiationSchema>;

interface Props {
  inquiries: InquiryOption[];
  quotations: QuotationOption[];
  /** Unused for now (the SM owns the sales person) — kept for parity with the
   *  house-style page wiring; reserved for a future "Created by" override. */
  employees: EmployeeOption[];
}

const NEGOTIATION_STATUS_OPTIONS = NEGOTIATION_STATUSES.map((s) => ({
  value: s,
  label: NEGOTIATION_STATUS_LABELS[s],
}));

/** Money <input> → number | undefined (no NaN); 0 is a valid amount. */
const moneyRegister = { setValueAs: (v: unknown) => moneyValue(v) };
function moneyValue(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * New Negotiation form — Linked Enquiry (SM autofetch snapshot + optional
 * Linked Quotation prefill) / Pricing / Timeline & Validity / Status & Notes.
 * The SM picker fetches getQuoteAutofill on select; the Quotation picker
 * fetches getQuotationAutofill to prefill price/timeline/validity/link.
 * Negotiation No auto-numbers `<SM>-N01` when left blank.
 */
export function NegotiationForm({ inquiries, quotations }: Props) {
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
    formState: { errors },
  } = useForm<NegotiationFormValues, unknown, NegotiationFormOutput>({
    resolver: zodResolver(CreateNegotiationSchema),
    defaultValues: {
      inquiryId: "",
      quotationId: undefined,
      negotiationNo: "",
      partNo: "",
      finalCost: undefined,
      negotiation: undefined,
      quotePrice: undefined,
      developmentTime: "",
      deliveryTime: "",
      validity: "",
      quotationLink: "",
      negotiationStatus: "to_start",
      negotiationNotes: "",
    },
  });

  /** On SM select: fetch the autofill snapshot. Company + enquiry date + sales
   *  person are shown as read-only captions; product/qty are prefilled into
   *  editable inputs. */
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
      // company/enquiry date/sales person/product/qty are snapshotted
      // server-side from the SM — shown as captions, not form fields here.
    } catch {
      fireToast({
        message: "Could not auto-fetch the enquiry — fill the fields manually.",
        type: "error",
      });
    } finally {
      setAutofetching(false);
    }
  }

  /** On Quotation select: fetch the quote's price/timeline/validity/link and
   *  prefill the editable inputs. */
  async function onPickQuotation(id: string | undefined) {
    setQuoteId(id ?? "");
    setValue("quotationId", id ?? undefined, { shouldValidate: true });
    if (!id) return;
    try {
      const res = await fetch(`/api/quotes/quotation-autofill?quotationId=${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as QuotationAutofill;
      if (data.finalCost != null) setValue("finalCost", Number(data.finalCost));
      if (data.quotePrice != null) setValue("quotePrice", Number(data.quotePrice));
      if (data.developmentTime) setValue("developmentTime", data.developmentTime);
      if (data.deliveryTime) setValue("deliveryTime", data.deliveryTime);
      if (data.validity) setValue("validity", data.validity);
      if (data.quotationLink) setValue("quotationLink", data.quotationLink);
      if (data.partNo) setValue("partNo", data.partNo);
    } catch {
      fireToast({
        message: "Could not auto-fetch the quotation — fill the fields manually.",
        type: "error",
      });
    }
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createNegotiation(values);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: `Negotiation ${res.negotiationNo ?? ""} created`.trim(),
        type: "success",
      });
      if (res.id) router.push(`/negotiations/${res.id}`);
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
        hint="Pick the SM this negotiation belongs to — its company, sales person and product are auto-fetched. Optionally link a quotation to pull its pricing."
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
            <Caption label="Sales Person">
              {autofetching ? "…" : snapshot?.salesPersonName ?? "—"}
            </Caption>
            {snapshot?.productDescription && (
              <Caption label="Product">{snapshot.productDescription}</Caption>
            )}
            {snapshot?.quantityNos && (
              <Caption label="Qty">{snapshot.quantityNos}</Caption>
            )}
          </div>
        )}

        <Field label="Linked Quotation" labelOnly>
          <Select
            value={quoteId}
            onValueChange={(v) => void onPickQuotation(v || undefined)}
            placeholder="Optional — link a quotation to pull its pricing…"
            searchPlaceholder="Search quote number or company…"
            searchable
            ariaLabel="Linked quotation"
            options={quotations.map((o) => ({
              value: o.id,
              label: `${o.quoteNo} — ${o.companyName ?? "—"}`,
            }))}
          />
        </Field>

        <Field id="ng-no" label="Negotiation No">
          <input
            id="ng-no"
            type="text"
            className="nt-input"
            placeholder="Leave blank to auto-number"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13.5 }}
            {...register("negotiationNo")}
          />
          <p className="text-[12.5px] text-ink-subtle">
            Negotiation No auto-numbers as{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>&lt;SM&gt;-N01</span>{" "}
            — leave blank.
          </p>
        </Field>
      </SectionCard>

      {/* ── 2 · Pricing ──────────────────────────────────────────────── */}
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

      {/* ── 3 · Timeline & Validity ──────────────────────────────────── */}
      <SectionCard
        title="Timeline & Validity"
        hint="Free-text per Manan's sheet — e.g. “6–8 weeks”, “30 days from PO”."
      >
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="ng-dev" label="Development Time">
            <input id="ng-dev" type="text" className="nt-input" {...register("developmentTime")} />
          </Field>
          <Field id="ng-del" label="Delivery Time">
            <input id="ng-del" type="text" className="nt-input" {...register("deliveryTime")} />
          </Field>
          <Field id="ng-val" label="Validity">
            <input id="ng-val" type="text" className="nt-input" {...register("validity")} />
          </Field>
        </div>
      </SectionCard>

      {/* ── 4 · Status & Notes ───────────────────────────────────────── */}
      <SectionCard
        title="Status & Notes"
        hint="The live pipeline state plus the quote document and any negotiation notes."
      >
        <Field label="Negotiation Status" labelOnly>
          <div className="[&>[role=group]]:flex-wrap [&>[role=group]]:max-w-full">
            <Controller
              control={control}
              name="negotiationStatus"
              render={({ field }) => (
                <Segmented
                  options={NEGOTIATION_STATUS_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  allowClear={false}
                  ariaLabel="Negotiation status"
                />
              )}
            />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="ng-link" label="Quotation Link">
            <input
              id="ng-link"
              type="url"
              className="nt-input"
              placeholder="https://…"
              {...register("quotationLink")}
            />
          </Field>
          <Field id="ng-part" label="Part No">
            <input id="ng-part" type="text" className="nt-input" {...register("partNo")} />
          </Field>
        </div>

        <Field id="ng-notes" label="Negotiation Notes">
          <textarea
            id="ng-notes"
            rows={4}
            className="nt-input resize-y"
            placeholder="Counter-offers, customer feedback, next steps…"
            {...register("negotiationNotes")}
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
          {pending ? "Creating…" : "Create Negotiation"}
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
