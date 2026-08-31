"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import { Trash2 } from "lucide-react";
import {
  COSTING_ROUTES,
  COSTING_ROUTE_LABELS,
  COSTING_LOGICS,
  COSTING_LOGIC_LABELS,
} from "@/db/enums";
import {
  CreateCostingSchema,
  type CreateCostingInput,
  type VendorQuoteInput,
} from "@/lib/validators/costing";
import { saveCosting } from "@/app/(app)/costings/actions";
import {
  computeInhouseCosting,
  vendorLandedCost,
  compareVendors,
  type InhouseInput,
  type VendorQuoteLike,
  type VendorComparison,
} from "@/lib/costing/compute";
import type { VendorOption } from "@/lib/queries/vendors";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { useFormDraft } from "@/components/drafts/use-form-draft";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import {
  Field,
  MiniField,
  SectionCard,
  Segmented,
  GroupHeader,
} from "@/components/inquiries/form-field";
import { ViewPdfButton } from "@/components/forms/view-pdf-button";

interface Props {
  inquiryItemId: string;
  inquiryId: string;
  productCaption: string;
  /** Active vendors for the Bought-Out matrix picker (auto-fills credit / terms). */
  vendorOptions?: VendorOption[];
  /** Create-mode only: enable auto-saving this form as a draft. */
  enableDrafts?: boolean;
  /** When resuming a draft, its id (auto-save continues into the same draft). */
  resumeDraftId?: string;
  /** Prefill values (used when resuming a saved draft). */
  initialValues?: Partial<CreateCostingInput>;
}

/** Hard cap on competing vendor quotes in the BO matrix (schema-enforced too). */
const MAX_VENDOR_QUOTES = 5;

/**
 * One fresh, empty vendor-quote row. unitPrice defaults to "" (not undefined) so
 * an untouched row coerces to 0 and passes the zod resolver — truly-empty rows
 * are stripped on submit. Everything else is optional / blank.
 */
const EMPTY_QUOTE = {
  vendorId: undefined,
  vendorNameSnapshot: "",
  unitPrice: "",
  leadTimeDays: undefined,
  creditPeriodDays: undefined,
  freightCost: undefined,
  vendorOhPct: undefined,
  developmentCost: undefined,
  notes: "",
} as const;

const ROUTE_OPTIONS = COSTING_ROUTES.map((r) => ({
  value: r,
  label: COSTING_ROUTE_LABELS[r],
}));

const LOGIC_OPTIONS = COSTING_LOGICS.map((l) => ({
  value: l,
  label: COSTING_LOGIC_LABELS[l],
}));

const WEIGHT_USED_OPTIONS = [
  { value: "pressing" as const, label: "Pressing" },
  { value: "theoretical" as const, label: "Theoretical" },
  { value: "block" as const, label: "Block" },
];

/** Coerce a raw form value to number | undefined, treating "" as undefined. */
function toNum(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Number register that discards empty/NaN inputs instead of leaving "" in state. */
const numRegister = { setValueAs: (v: unknown) => toNum(v) };

/** Read-only output chip - label + formatted value. */
function OutputRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="tabular-nums text-[14px] font-semibold text-ink-strong">
        {value}
      </span>
    </div>
  );
}

/** Format a decimal number as ₹ using the shared INR formatter. */
function inr(n: number): string {
  return formatInr(n);
}

/** Format a per-gram value: 4 decimal places (rupees per gram are small). */
function perGm(n: number): string {
  return "Rs " + n.toFixed(4);
}

/**
 * Live-recomputing Costing form.
 *
 * Route toggle switches between In-house and Bought-Out input sections.
 * useMemo recomputes outputs from the engine on every form-value change.
 * Results panel always visible (sticky in feel via mt-auto placement on mobile).
 * On submit: saveCosting server action, fireToast, redirect to SM detail.
 */
export function CostingForm({
  inquiryItemId,
  inquiryId,
  productCaption,
  vendorOptions = [],
  enableDrafts,
  resumeDraftId,
  initialValues,
}: Props) {
  const router = useRouter();
  const draftsOn = Boolean(enableDrafts);
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CreateCostingInput>({
    resolver: zodResolver(CreateCostingSchema),
    defaultValues: {
      costingType: "inhouse",
      costingLogic: undefined,
      qty: undefined,
      weightUsed: "pressing",
      lossPct: 0.15,
      vaPct: 0.3,
      vaFloorPerKg: 2000,
      shapingRatePerMin: 7,
      shapingMins: 2,
      overheadPct: 0.25,
      negotiationPct: 0.03,
      // BO defaults
      vendorOhPct: undefined,
      outsourcedVendorCost: undefined,
      developmentCost: undefined,
      vendorQuotes: [],
      // A resumed draft prefills over the base defaults.
      ...initialValues,
      // Route identity stays authoritative even when resuming a draft.
      inquiryItemId,
      inquiryId,
    },
  });

  const { formProps } = useKeyboardForm();

  const { discard } = useFormDraft<CreateCostingInput>({
    kind: "costing",
    enabled: draftsOn,
    resumeDraftId,
    watch,
    getValues,
  });

  // BO multi-vendor matrix (up to 5 competing quotes).
  const {
    fields: quoteFields,
    append: appendQuote,
    remove: removeQuote,
  } = useFieldArray({ control, name: "vendorQuotes" });

  // Keyboard-first: when a vendor row is added, move focus into its first data
  // field (the vendor picker, or the ad-hoc name when no vendors exist) so the
  // user never has to reach for the mouse after "+ Add vendor".
  const quotesRef = React.useRef<HTMLDivElement | null>(null);
  const focusNewRow = React.useRef(false);

  React.useEffect(() => {
    if (!focusNewRow.current) return;
    focusNewRow.current = false;
    const container = quotesRef.current;
    if (!container) return;
    const rows = container.querySelectorAll<HTMLElement>("[data-quote-row]");
    const last = rows[rows.length - 1];
    if (!last) return;
    // First real field in DOM order: the vendor Select trigger
    // (aria-haspopup="listbox"), or the ad-hoc name input when it is disabled.
    // The Remove button (a plain <button>) is deliberately skipped.
    const first = last.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), [aria-haspopup="listbox"]:not([disabled]), textarea:not([disabled])',
    );
    first?.focus();
  }, [quoteFields.length]);

  const addQuote = React.useCallback(() => {
    focusNewRow.current = true;
    appendQuote({ ...EMPTY_QUOTE });
  }, [appendQuote]);

  const vendorSelectOptions = React.useMemo(
    () =>
      vendorOptions.map((o) => ({
        value: o.id,
        label: o.vendorCode ? `${o.name} · ${o.vendorCode}` : o.name,
      })),
    [vendorOptions],
  );

  /** On vendor pick: snapshot the name + auto-fill default credit days / terms.
   *  (vendorId itself is owned by the row's Controller.) */
  const onPickVendor = React.useCallback(
    (index: number, vendorId: string) => {
      const vend = vendorOptions.find((o) => o.id === vendorId);
      if (!vend) return;
      setValue(`vendorQuotes.${index}.vendorNameSnapshot`, vend.name, {
        shouldDirty: true,
      });
      if (vend.defaultCreditDays != null) {
        setValue(`vendorQuotes.${index}.creditPeriodDays`, vend.defaultCreditDays, {
          shouldDirty: true,
        });
      }
      const curNotes = getValues(`vendorQuotes.${index}.notes`);
      if (!curNotes && vend.paymentTerms) {
        setValue(`vendorQuotes.${index}.notes`, vend.paymentTerms, {
          shouldDirty: true,
        });
      }
    },
    [vendorOptions, setValue, getValues],
  );

  // Watch all values for live recompute
  const v = watch();

  // ── Live recompute ──────────────────────────────────────────────────────────
  // In-house always computes (even in BO mode) so the make-vs-buy dual view has
  // both sides to compare. The full in-house breakdown is only *shown* in-house.
  const inhouseOut = React.useMemo(() => {
    const qty = toNum(v.qty) ?? 0;
    const weightUsed: InhouseInput["weightUsed"] =
      v.weightUsed === "pressing" ||
      v.weightUsed === "theoretical" ||
      v.weightUsed === "block"
        ? v.weightUsed
        : "pressing";
    return computeInhouseCosting({
      qty,
      toolFlatCost: toNum(v.toolFlatCost),
      weightUsed,
      blockWt: toNum(v.blockWt),
      theoreticalWt: toNum(v.theoreticalWt),
      pressingWt: toNum(v.pressingWt),
      lossPct: toNum(v.lossPct) ?? 0.15,
      rmPricePerKg: toNum(v.rmPricePerKg) ?? 0,
      vaPct: toNum(v.vaPct) ?? 0.3,
      vaFloorPerKg: toNum(v.vaFloorPerKg) ?? 2000,
      shapingMins: toNum(v.shapingMins) ?? 2,
      shapingRatePerMin: toNum(v.shapingRatePerMin) ?? 7,
      machiningRate: toNum(v.machiningRate) ?? 0,
      overheadPct: toNum(v.overheadPct) ?? 0.25,
      negotiationPct: toNum(v.negotiationPct) ?? 0.03,
    });
  }, [
    v.qty,
    v.weightUsed,
    v.toolFlatCost,
    v.blockWt,
    v.theoreticalWt,
    v.pressingWt,
    v.lossPct,
    v.rmPricePerKg,
    v.vaPct,
    v.vaFloorPerKg,
    v.shapingMins,
    v.shapingRatePerMin,
    v.machiningRate,
    v.overheadPct,
    v.negotiationPct,
  ]);

  const isInhouse = v.costingType === "inhouse";
  const boQty = toNum(v.qty) ?? 0;

  // ── BO vendor comparison (client-side, SAME engine as the server) ──
  // Pair each field-array row (stable id) with its watched values; only rows
  // with a real unitPrice > 0 rank (empty starter rows are ignored).
  const rankableQuotes = React.useMemo(() => {
    const rows = v.vendorQuotes ?? [];
    return quoteFields
      .map((f, i): VendorQuoteLike => {
        const r: Partial<VendorQuoteInput> = rows[i] ?? {};
        return {
          id: f.id,
          unitPrice: r.unitPrice as VendorQuoteLike["unitPrice"],
          vendorOhPct: r.vendorOhPct as VendorQuoteLike["vendorOhPct"],
          developmentCost: r.developmentCost as VendorQuoteLike["developmentCost"],
          freightCost: r.freightCost as VendorQuoteLike["freightCost"],
          leadTimeDays: (r.leadTimeDays as number | null | undefined) ?? null,
          creditPeriodDays: (r.creditPeriodDays as number | null | undefined) ?? null,
        };
      })
      .filter((q) => Number(q.unitPrice) > 0);
  }, [quoteFields, v.vendorQuotes]);

  const comparison = React.useMemo(
    () => compareVendors(rankableQuotes, boQty),
    [rankableQuotes, boQty],
  );

  const boCheapestLanded =
    comparison.cheapestId != null ? comparison.byId[comparison.cheapestId] ?? 0 : 0;

  const inhouseFinal = inhouseOut?.finalCostPerPiece ?? 0;

  const finalCost = isInhouse ? inhouseFinal : boCheapestLanded;
  const quoteVal = isInhouse
    ? inhouseOut?.quoteValue ?? 0
    : boCheapestLanded * boQty;

  const submit = handleSubmit((values) => {
    setServerError(null);
    // Strip truly-empty vendor rows: keep a row only when it carries a vendor
    // (picked or ad-hoc name) OR a real unit price. Server re-ranks regardless.
    const cleanedQuotes = (values.vendorQuotes ?? []).filter(
      (q) =>
        Boolean(q.vendorId) ||
        Boolean(q.vendorNameSnapshot && String(q.vendorNameSnapshot).trim()) ||
        Number(q.unitPrice) > 0,
    );
    const payload: CreateCostingInput = {
      ...values,
      vendorQuotes:
        values.costingType === "bought_out" && cleanedQuotes.length > 0
          ? cleanedQuotes
          : undefined,
    };
    startTransition(async () => {
      const res = await saveCosting(payload);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // Costing saved - retire the draft so it leaves the Drafts inbox.
      await discard();
      fireToast({ message: "Costing saved successfully.", type: "success" });
      router.push(("/inquiries/" + inquiryId) as Route);
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as string | undefined;

  return (
    <form onSubmit={submit} onKeyDown={formProps.onKeyDown} className="flex flex-col gap-6" noValidate>
      {/* Hidden identity fields */}
      <input type="hidden" {...register("inquiryItemId")} />
      <input type="hidden" {...register("inquiryId")} />

      {/* 1. Route toggle */}
      <SectionCard
        title="Costing Route"
        inlineHint
        hint={`Product: ${productCaption}. In-house (we manufacture) or Bought-Out (vendor).`}
      >
        <Field label="Route" labelOnly float>
          <Controller
            control={control}
            name="costingType"
            render={({ field }) => (
              <Segmented
                options={ROUTE_OPTIONS}
                value={field.value as "inhouse" | "bought_out"}
                onChange={(v) => { if (v) field.onChange(v); }}
                allowClear={false}
                ariaLabel="Costing route"
              />
            )}
          />
        </Field>
      </SectionCard>

      {/* 2. Live Results Panel */}
      <section
        className="rounded-section border-2 p-6"
        style={{
          background: "#FFFFFF",
          borderColor: "var(--color-brand)",
          boxShadow: "0 4px 24px -8px rgba(63,63,148,0.18)",
        }}
      >
        <p className="mb-4 text-[11px] uppercase tracking-[0.16em] font-bold" style={{ color: "var(--color-brand)" }}>
          Live Estimate
        </p>

        {isInhouse && inhouseOut && (
          <div className="flex flex-wrap gap-x-8 gap-y-4 mb-5">
            <OutputRow label="Loss Wt (kg)" value={inhouseOut.lossWtKg.toFixed(6)} />
            <OutputRow label="RM / gm" value={perGm(inhouseOut.rmPerGm)} />
            <OutputRow label="VA / gm" value={perGm(inhouseOut.vaPerGm)} />
            <OutputRow label="Sintered / gm" value={perGm(inhouseOut.sinteredCostPerGm)} />
            <OutputRow label="Sintered / pc" value={inr(inhouseOut.sinteredPricePerPiece)} />
            <OutputRow label="Cost after machining" value={inr(inhouseOut.costAfterMachining)} />
          </div>
        )}

        <div
          className="flex flex-wrap items-end gap-x-10 gap-y-3 pt-4"
          style={{ borderTop: "1px solid rgba(63,63,148,0.18)" }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: "var(--color-brand)" }}>
              Final Cost / Piece
            </span>
            <span
              className="tabular-nums font-black"
              style={{ fontSize: 32, lineHeight: 1, color: "var(--color-brand)" }}
            >
              {inr(finalCost)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
              Quote Value (x{toNum(v.qty) ?? 0} pcs)
            </span>
            <span className="tabular-nums text-[22px] font-bold text-ink-strong">
              {inr(quoteVal)}
            </span>
          </div>
        </div>
      </section>

      {/* 3a. In-house input sections */}
      {isInhouse && (
        <>
          {/* Identity */}
          <SectionCard title="Identity" inlineHint hint="Costing logic + quantity for this run.">
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <Field id="c-qty" label="Quantity" float>
                <input
                  id="c-qty"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  className="nt-input tabular-nums"
                  placeholder="0"
                  {...register("qty", numRegister)}
                />
              </Field>
              <Field label="Costing Logic" labelOnly float>
                <Controller
                  control={control}
                  name="costingLogic"
                  render={({ field }) => (
                    <Segmented
                      options={LOGIC_OPTIONS}
                      value={field.value}
                      onChange={field.onChange}
                      allowClear
                      ariaLabel="Costing logic"
                    />
                  )}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Weights */}
          <SectionCard
            title="Weights"
            inlineHint
            hint="Block, theoretical and pressing weights in grams. Choose which the sintered cost is based on."
          >
            <Field label="Weight Used For Costing" labelOnly float>
              <Controller
                control={control}
                name="weightUsed"
                render={({ field }) => (
                  <Segmented
                    options={WEIGHT_USED_OPTIONS}
                    value={(field.value as "pressing" | "theoretical" | "block") ?? "pressing"}
                    onChange={(v) => { if (v) field.onChange(v); }}
                    allowClear={false}
                    ariaLabel="Weight used"
                  />
                )}
              />
            </Field>
            <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
              <MiniField label="Block Wt (gms)" float>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  className="nt-input tabular-nums"
                  placeholder="0"
                  aria-label="Block weight in grams"
                  {...register("blockWt", numRegister)}
                />
              </MiniField>
              <MiniField label="Theoretical Wt (gms)" float>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  className="nt-input tabular-nums"
                  placeholder="0"
                  aria-label="Theoretical weight in grams"
                  {...register("theoreticalWt", numRegister)}
                />
              </MiniField>
              <MiniField label="Pressing Wt (gms)" float>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  className="nt-input tabular-nums"
                  placeholder="0"
                  aria-label="Pressing weight in grams"
                  {...register("pressingWt", numRegister)}
                />
              </MiniField>
              <MiniField label="Loss % (0.15 = 15%)" float>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  max={1}
                  className="nt-input tabular-nums"
                  placeholder="0.15"
                  aria-label="Loss percentage"
                  {...register("lossPct", numRegister)}
                />
              </MiniField>
            </div>
          </SectionCard>

          {/* RM + VA */}
          <SectionCard
            title="Raw Material + Value Addition"
            inlineHint
            hint="RM price per kg and VA percentage (VA/kg = max(RM x VA%, VA floor))."
          >
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <MiniField label="RM Price / kg" float>
                <MoneyInput
                  aria-label="RM price per kg"
                  {...register("rmPricePerKg", numRegister)}
                />
              </MiniField>
              <MiniField label="VA % (e.g. 0.3 = 30%)" float>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  max={2}
                  className="nt-input tabular-nums"
                  placeholder="0.3"
                  aria-label="VA percentage"
                  {...register("vaPct", numRegister)}
                />
              </MiniField>
              <MiniField label="VA Floor / kg" float>
                <MoneyInput
                  aria-label="VA floor per kg"
                  {...register("vaFloorPerKg", numRegister)}
                />
              </MiniField>
            </div>
          </SectionCard>

          {/* Tooling */}
          <SectionCard
            title="Tooling"
            inlineHint
            hint="Flat tool cost folded per piece (tool cost / qty). Leave blank if none."
          >
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <Field id="c-tooltype" label="Tool Type" float>
                <input
                  id="c-tooltype"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Pressing die, Special punch"
                  {...register("toolType")}
                />
              </Field>
              <Field id="c-toolmethod" label="Cost Method" float>
                <input
                  id="c-toolmethod"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Flat, Amortised"
                  {...register("toolCostMethod")}
                />
              </Field>
              <Field id="c-toolcost" label="Flat Tool Cost" float>
                <MoneyInput
                  id="c-toolcost"
                  aria-label="Flat tool cost"
                  {...register("toolFlatCost", numRegister)}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Shaping */}
          <SectionCard title="Shaping" inlineHint hint="Shaping time and rate per minute.">
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <MiniField label="Shaping (mins)" float>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  className="nt-input tabular-nums"
                  placeholder="2"
                  aria-label="Shaping minutes"
                  {...register("shapingMins", numRegister)}
                />
              </MiniField>
              <MiniField label="Rate / min" float>
                <MoneyInput
                  aria-label="Shaping rate per minute"
                  {...register("shapingRatePerMin", numRegister)}
                />
              </MiniField>
            </div>
          </SectionCard>

          {/* Machining */}
          <SectionCard title="Machining" inlineHint hint="Machining rate and overhead percentage.">
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <Field id="c-machtype" label="Machining Type" float>
                <input
                  id="c-machtype"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Grinding, EDM"
                  {...register("machiningType")}
                />
              </Field>
              <Field id="c-machrate" label="Machining Rate" float>
                <MoneyInput
                  id="c-machrate"
                  aria-label="Machining rate"
                  {...register("machiningRate", numRegister)}
                />
              </Field>
              <Field id="c-ovhpct" label="Overhead % (0.25 = 25%)" float>
                <input
                  id="c-ovhpct"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  max={2}
                  className="nt-input tabular-nums"
                  placeholder="0.25"
                  {...register("overheadPct", numRegister)}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Negotiation */}
          <SectionCard
            title="Negotiation"
            inlineHint
            hint="Negotiation buffer as a fraction (0.03 = 3%)."
          >
            <div className="flex flex-wrap items-start gap-x-5 gap-y-3.5">
              <MiniField label="Negotiation % (e.g. 0.03)" float>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  max={1}
                  className="nt-input tabular-nums w-[160px]"
                  placeholder="0.03"
                  aria-label="Negotiation percentage"
                  {...register("negotiationPct", numRegister)}
                />
              </MiniField>
            </div>
          </SectionCard>
        </>
      )}

      {/* 3b. Bought-Out input sections */}
      {!isInhouse && (
        <>
          {/* Identity */}
          <SectionCard title="Identity" inlineHint hint="Quantity for this bought-out run.">
            <Field id="bo-qty" label="Quantity" float>
              <input
                id="bo-qty"
                type="number"
                inputMode="numeric"
                min={0}
                step="any"
                className="nt-input tabular-nums"
                placeholder="0"
                {...register("qty", numRegister)}
              />
            </Field>
          </SectionCard>

          {/* Vendor matrix - up to 5 competing quotes, ranked live. */}
          <SectionCard
            title="Vendor Quotes"
            inlineHint
            hint={`Add up to ${MAX_VENDOR_QUOTES} competing vendors. Landed cost / pc = unit price + OH + development + freight ÷ qty. Freight is per order.`}
          >
            {quoteFields.length === 0 && (
              <p className="text-[13px] text-ink-subtle">
                No vendor quotes yet. Add a vendor to start comparing.
              </p>
            )}

            <div ref={quotesRef} className="contents">
            {quoteFields.map((qf, index) => {
              const row: Partial<VendorQuoteInput> =
                (v.vendorQuotes ?? [])[index] ?? {};
              const priced = Number(row.unitPrice) > 0;
              const landed = priced
                ? vendorLandedCost(
                    {
                      unitPrice: row.unitPrice as VendorQuoteLike["unitPrice"],
                      vendorOhPct: row.vendorOhPct as VendorQuoteLike["vendorOhPct"],
                      developmentCost:
                        row.developmentCost as VendorQuoteLike["developmentCost"],
                      freightCost: row.freightCost as VendorQuoteLike["freightCost"],
                    },
                    boQty,
                  )
                : null;
              const isCheapest = comparison.cheapestId === qf.id;
              const isFastest = comparison.fastestId === qf.id;
              const isBestCredit = comparison.bestCreditId === qf.id;

              return (
                <div
                  key={qf.id}
                  data-quote-row
                  className="flex flex-col gap-4 rounded-section border p-5"
                  style={{
                    background: isCheapest
                      ? "#ECF7EF"
                      : "var(--color-surface-soft)",
                    borderColor: isCheapest ? "#16a34a" : "var(--color-hairline)",
                    boxShadow: isCheapest
                      ? "0 2px 14px -6px rgba(22,163,74,0.35)"
                      : undefined,
                  }}
                >
                  <GroupHeader
                    n={index + 1}
                    label="Vendor"
                    leftAction={
                      <span className="flex flex-wrap items-center gap-1.5">
                        {isCheapest && <RankChip tone="green" label="Cheapest" />}
                        {isFastest && <RankChip tone="indigo" label="Fastest" />}
                        {isBestCredit && <RankChip tone="amber" label="Best Credit" />}
                        {landed != null && (
                          <span className="ml-1 text-[12.5px] font-bold tabular-nums text-ink-strong">
                            {inr(landed)}
                            <span className="ml-1 text-[11px] font-semibold text-ink-subtle">
                              / pc landed
                            </span>
                          </span>
                        )}
                      </span>
                    }
                    action={
                      <button
                        type="button"
                        onClick={() => removeQuote(index)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong"
                      >
                        <Trash2 size={13} strokeWidth={2.4} />
                        Remove
                      </button>
                    }
                  />

                  {/* Vendor identity - picker + ad-hoc name */}
                  <div className="grid grid-cols-[2fr_1fr] gap-3 max-md:grid-cols-1">
                    <Field
                      id={`vq-${index}-vendor`}
                      label="Vendor"
                      labelOnly float
                    >
                      <Controller
                        control={control}
                        name={`vendorQuotes.${index}.vendorId`}
                        render={({ field }) => (
                          <Select
                            id={`vq-${index}-vendor`}
                            ariaLabel="Vendor"
                            value={field.value ?? ""}
                            onValueChange={(val) => {
                              field.onChange(val || undefined);
                              if (val) onPickVendor(index, val);
                            }}
                            placeholder={
                              vendorSelectOptions.length === 0
                                ? "No vendors - type a name"
                                : "Select a vendor"
                            }
                            disabled={vendorSelectOptions.length === 0}
                            searchable
                            searchPlaceholder="Search vendor / code"
                            options={vendorSelectOptions}
                          />
                        )}
                      />
                    </Field>
                    <Field id={`vq-${index}-name`} label="Vendor Name (ad-hoc)" float>
                      <input
                        id={`vq-${index}-name`}
                        type="text"
                        className="nt-input"
                        placeholder="Or type a vendor name"
                        {...register(`vendorQuotes.${index}.vendorNameSnapshot`)}
                      />
                    </Field>
                  </div>

                  {/* Price + timing + terms */}
                  <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                    <MiniField label="Unit Price / pc" float>
                      <MoneyInput
                        aria-label="Unit price per piece"
                        {...register(`vendorQuotes.${index}.unitPrice`)}
                      />
                    </MiniField>
                    <MiniField label="Lead Time (days)" float>
                      <input
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={0}
                        className="nt-input tabular-nums"
                        placeholder="e.g. 30"
                        aria-label="Lead time in days"
                        {...register(`vendorQuotes.${index}.leadTimeDays`, numRegister)}
                      />
                    </MiniField>
                    <MiniField label="Credit Period (days)" float>
                      <input
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={0}
                        className="nt-input tabular-nums"
                        placeholder="e.g. 45"
                        aria-label="Credit period in days"
                        {...register(`vendorQuotes.${index}.creditPeriodDays`, numRegister)}
                      />
                    </MiniField>
                  </div>

                  {/* Freight + OH + development */}
                  <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                    <MiniField label="Freight (per order)" float>
                      <MoneyInput
                        aria-label="Freight cost per order"
                        {...register(`vendorQuotes.${index}.freightCost`, numRegister)}
                      />
                    </MiniField>
                    <MiniField label="OH % (0.1 = 10%)" float>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        max={2}
                        className="nt-input tabular-nums"
                        placeholder="0.1"
                        aria-label="Vendor overhead percentage"
                        {...register(`vendorQuotes.${index}.vendorOhPct`, numRegister)}
                      />
                    </MiniField>
                    <MiniField label="Development Cost / pc" float>
                      <MoneyInput
                        aria-label="Development cost per piece"
                        {...register(`vendorQuotes.${index}.developmentCost`, numRegister)}
                      />
                    </MiniField>
                  </div>

                  <Field id={`vq-${index}-notes`} label="Notes" float>
                    <input
                      id={`vq-${index}-notes`}
                      type="text"
                      className="nt-input"
                      placeholder="e.g. payment terms, sourcing note"
                      {...register(`vendorQuotes.${index}.notes`)}
                    />
                  </Field>
                </div>
              );
            })}
            </div>

            {quoteFields.length < MAX_VENDOR_QUOTES && (
              <div>
                <button
                  type="button"
                  onClick={addQuote}
                  className="inline-flex items-center gap-2 rounded-chip border border-brand bg-brand/8 px-4 py-2.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/12"
                >
                  + Add vendor
                </button>
              </div>
            )}
          </SectionCard>

          {/* Comparison dashboard - live rankings across the entered quotes. */}
          <ComparisonDashboard
            quoteFields={quoteFields.map((f, i) => ({
              id: f.id,
              name: nameForQuote((v.vendorQuotes ?? [])[i], vendorOptions, i),
            }))}
            comparison={comparison}
            watchRows={v.vendorQuotes ?? []}
            qty={boQty}
          />

          {/* Dual view - make (in-house) vs buy (BO cheapest). */}
          <DualView
            inhouseFinal={inhouseFinal}
            boCheapest={boCheapestLanded}
            hasBoQuote={comparison.cheapestId != null}
          />
        </>
      )}

      {/* 4. Meta - timeline + validity (shared) */}
      <SectionCard title="Timeline and Validity">
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="c-devtime" label="Development Time" float>
            <input
              id="c-devtime"
              type="text"
              className="nt-input"
              placeholder="e.g. 6-8 weeks"
              {...register("developmentTime")}
            />
          </Field>
          <Field id="c-deltime" label="Delivery Time" float>
            <input
              id="c-deltime"
              type="text"
              className="nt-input"
              placeholder="e.g. 30 days from PO"
              {...register("deliveryTime")}
            />
          </Field>
          <Field id="c-validity" label="Validity" float>
            <input
              id="c-validity"
              type="text"
              className="nt-input"
              placeholder="e.g. 30 days"
              {...register("validity")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* Errors */}
      {(serverError ?? firstFieldError) && (
        <p
          className="font-semibold"
          style={{ fontSize: 14, color: "var(--color-red-deep)" }}
        >
          {serverError ?? firstFieldError}
        </p>
      )}

      {/* Submit */}
      <div
        className="flex items-center justify-end gap-3 pt-2"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <span className="text-[11px] text-ink-subtle">
          Ctrl / &#8984; + Enter to save
        </span>
        <ViewPdfButton title="Costing Sheet" />
        <button
          type="submit"
          disabled={pending}
          className="text-cta text-white px-8 py-4 rounded-chip transition-transform disabled:opacity-50"
          style={{
            background:
              "#454595",
            boxShadow: "0 6px 16px rgba(63, 63, 148, 0.34)",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.005em",
          }}
        >
          {pending ? "Saving..." : "Save Costing"}
        </button>
      </div>
    </form>
  );
}

// ── BO comparison helpers ─────────────────────────────────────────────────────

/** Coerce a possibly-unknown numeric form value to a finite number, else null. */
function coerceNum(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Display name for a vendor quote row: ad-hoc name → master name → "Vendor N". */
function nameForQuote(
  row: VendorQuoteInput | undefined,
  vendorOptions: VendorOption[],
  index: number,
): string {
  const snap = row?.vendorNameSnapshot;
  if (typeof snap === "string" && snap.trim()) return snap.trim();
  if (row?.vendorId) {
    const vend = vendorOptions.find((o) => o.id === row.vendorId);
    if (vend) return vend.name;
  }
  return `Vendor ${index + 1}`;
}

const RANK_TONES = {
  green: { bg: "#ECF7EF", border: "#16a34a", text: "#15803d" },
  indigo: { bg: "#EEEEFF", border: "#3F3F94", text: "#3F3F94" },
  amber: { bg: "#FEF6E7", border: "#d97706", text: "#b45309" },
} as const;

/** Small ranked tag chip (Cheapest / Fastest / Best Credit). */
function RankChip({
  tone,
  label,
}: {
  tone: keyof typeof RANK_TONES;
  label: string;
}) {
  const t = RANK_TONES[tone];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]"
      style={{ background: t.bg, borderColor: t.border, color: t.text }}
    >
      {label}
    </span>
  );
}

/** One headline "winner" card inside the comparison dashboard. */
function WinnerCard({
  tone,
  label,
  vendor,
  value,
}: {
  tone: keyof typeof RANK_TONES;
  label: string;
  vendor: string | null;
  value: string;
}) {
  const t = RANK_TONES[tone];
  return (
    <div
      className="flex flex-col gap-1 rounded-section border p-4"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <span
        className="text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{ color: t.text }}
      >
        {label}
      </span>
      {vendor ? (
        <>
          <span className="truncate text-[15px] font-extrabold text-ink-strong">
            {vendor}
          </span>
          <span className="tabular-nums text-[13px] font-semibold text-ink-muted">
            {value}
          </span>
        </>
      ) : (
        <span className="text-[13px] font-semibold text-ink-subtle">—</span>
      )}
    </div>
  );
}

/**
 * Live comparison dashboard for the BO matrix — recomputes client-side via the
 * SAME `compareVendors` engine the server ranks with. Shows the Cheapest /
 * Fastest / Best-Credit winners plus every vendor's landed cost, cheapest first.
 */
function ComparisonDashboard({
  quoteFields,
  comparison,
  watchRows,
  qty,
}: {
  quoteFields: { id: string; name: string }[];
  comparison: VendorComparison;
  watchRows: readonly VendorQuoteInput[];
  qty: number;
}) {
  const rows = quoteFields.map((qf, i) => {
    const r = watchRows[i];
    return {
      id: qf.id,
      name: qf.name,
      landed: comparison.byId[qf.id],
      lead: coerceNum(r?.leadTimeDays),
      credit: coerceNum(r?.creditPeriodDays),
      priced: coerceNum(r?.unitPrice) != null && (coerceNum(r?.unitPrice) ?? 0) > 0,
    };
  });
  const ranked = rows
    .filter((r) => r.priced && r.landed != null)
    .sort((a, b) => (a.landed ?? 0) - (b.landed ?? 0));

  const byId = (id: string | null) =>
    id != null ? rows.find((r) => r.id === id) ?? null : null;
  const cheapest = byId(comparison.cheapestId);
  const fastest = byId(comparison.fastestId);
  const bestCredit = byId(comparison.bestCreditId);

  return (
    <SectionCard
      title="Vendor Comparison"
      inlineHint
      hint="Recommended = cheapest landed cost. Ranked live as you type."
    >
      {ranked.length === 0 ? (
        <p className="text-[13px] text-ink-subtle">
          Enter at least one vendor unit price to see the comparison.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <WinnerCard
              tone="green"
              label="Cheapest"
              vendor={cheapest?.name ?? null}
              value={cheapest?.landed != null ? `${inr(cheapest.landed)} / pc` : ""}
            />
            <WinnerCard
              tone="indigo"
              label="Fastest"
              vendor={fastest?.name ?? null}
              value={fastest?.lead != null ? `${fastest.lead} days lead` : ""}
            />
            <WinnerCard
              tone="amber"
              label="Best Credit"
              vendor={bestCredit?.name ?? null}
              value={bestCredit?.credit != null ? `${bestCredit.credit} days credit` : ""}
            />
          </div>

          {/* Landed-cost breakdown, cheapest first. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="py-2 pr-3 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                    Vendor
                  </th>
                  <th className="py-2 px-3 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                    Landed / pc
                  </th>
                  <th className="py-2 px-3 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                    Lead
                  </th>
                  <th className="py-2 pl-3 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                    Credit
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => {
                  const isCheapest = r.id === comparison.cheapestId;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-hairline last:border-0"
                      style={isCheapest ? { background: "#F5FBF6" } : undefined}
                    >
                      <td className="py-2.5 pr-3">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-ink-strong">
                            {r.name}
                          </span>
                          {isCheapest && <RankChip tone="green" label="Recommended" />}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-ink-strong">
                        {r.landed != null ? inr(r.landed) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-ink-muted">
                        {r.lead != null ? `${r.lead}d` : "—"}
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums text-ink-muted">
                        {r.credit != null ? `${r.credit}d` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/**
 * Make-vs-Buy dual view: the in-house final cost (from the in-house engine
 * inputs) beside the cheapest bought-out landed cost, with the differential —
 * so management sees the make-or-buy call at a glance. Display only; the
 * approve / override / lock control is Phase 4.
 */
function DualView({
  inhouseFinal,
  boCheapest,
  hasBoQuote,
}: {
  inhouseFinal: number;
  boCheapest: number;
  hasBoQuote: boolean;
}) {
  const diff = inhouseFinal - boCheapest;
  const bothKnown = hasBoQuote;
  const buyCheaper = diff > 0;
  const equal = Math.abs(diff) < 0.005;

  return (
    <SectionCard
      title="Make vs Buy"
      inlineHint
      hint="In-house (make) vs cheapest bought-out (buy), per piece. Recommendation is decided in the approval step."
    >
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-[160px] flex-1 flex-col gap-1 rounded-section border border-hairline bg-surface-soft p-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            In-House (Make)
          </span>
          <span className="tabular-nums text-[24px] font-black text-ink-strong">
            {inr(inhouseFinal)}
          </span>
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1 rounded-section border border-hairline bg-surface-soft p-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            Bought-Out (Buy)
          </span>
          <span className="tabular-nums text-[24px] font-black text-ink-strong">
            {hasBoQuote ? inr(boCheapest) : "—"}
          </span>
        </div>
        <div
          className="flex min-w-[180px] flex-1 flex-col gap-1 rounded-section border p-4"
          style={{
            background: bothKnown
              ? equal
                ? "var(--color-surface-soft)"
                : buyCheaper
                  ? "#ECF7EF"
                  : "#EEEEFF"
              : "var(--color-surface-soft)",
            borderColor: bothKnown
              ? equal
                ? "var(--color-hairline)"
                : buyCheaper
                  ? "#16a34a"
                  : "#3F3F94"
              : "var(--color-hairline)",
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            Differential
          </span>
          {bothKnown ? (
            <>
              <span className="tabular-nums text-[24px] font-black text-ink-strong">
                {inr(Math.abs(diff))}
              </span>
              <span className="text-[12.5px] font-semibold text-ink-muted">
                {equal
                  ? "Make and buy are level"
                  : buyCheaper
                    ? "Buying is cheaper"
                    : "Making is cheaper"}
              </span>
            </>
          ) : (
            <span className="text-[13px] font-semibold text-ink-subtle">
              Add a vendor quote to compare
            </span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
