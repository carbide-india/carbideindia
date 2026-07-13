"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import {
  COSTING_ROUTES,
  COSTING_ROUTE_LABELS,
  COSTING_LOGICS,
  COSTING_LOGIC_LABELS,
} from "@/db/enums";
import { CreateCostingSchema, type CreateCostingInput } from "@/lib/validators/costing";
import { saveCosting } from "@/app/(app)/costings/actions";
import {
  computeInhouseCosting,
  computeBoCosting,
  type InhouseInput,
} from "@/lib/costing/compute";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { useFormDraft } from "@/components/drafts/use-form-draft";
import {
  Field,
  MiniField,
  SectionCard,
  Segmented,
} from "@/components/inquiries/form-field";

interface Props {
  inquiryItemId: string;
  inquiryId: string;
  productCaption: string;
  /** Create-mode only: enable auto-saving this form as a draft. */
  enableDrafts?: boolean;
  /** When resuming a draft, its id (auto-save continues into the same draft). */
  resumeDraftId?: string;
  /** Prefill values (used when resuming a saved draft). */
  initialValues?: Partial<CreateCostingInput>;
}

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

/** Rs-prefixed money input, same as quotation-form.tsx. */
const MoneyInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function MoneyInput(props, ref) {
  return (
    <div className="relative w-full">
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

/** Read-only output chip — label + formatted value. */
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
      // A resumed draft prefills over the base defaults.
      ...initialValues,
      // Route identity stays authoritative even when resuming a draft.
      inquiryItemId,
      inquiryId,
    },
  });

  const { discard } = useFormDraft<CreateCostingInput>({
    kind: "costing",
    enabled: draftsOn,
    resumeDraftId,
    watch,
    getValues,
  });

  // Watch all values for live recompute
  const v = watch();

  // ── Live recompute ──────────────────────────────────────────────────────────
  const inhouseOut = React.useMemo(() => {
    if (v.costingType !== "inhouse") return null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    v.costingType,
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

  const boOut = React.useMemo(() => {
    if (v.costingType !== "bought_out") return null;
    return computeBoCosting({
      qty: toNum(v.qty) ?? 0,
      outsourcedVendorCost: toNum(v.outsourcedVendorCost) ?? 0,
      vendorOhPct: toNum(v.vendorOhPct) ?? 0,
      developmentCost: toNum(v.developmentCost) ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    v.costingType,
    v.qty,
    v.outsourcedVendorCost,
    v.vendorOhPct,
    v.developmentCost,
  ]);

  const finalCost = inhouseOut?.finalCostPerPiece ?? boOut?.finalCostPerPiece ?? 0;
  const quoteVal = inhouseOut?.quoteValue ?? boOut?.quoteValue ?? 0;

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await saveCosting(values);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // Costing saved — retire the draft so it leaves the Drafts inbox.
      await discard();
      fireToast({ message: "Costing saved successfully.", type: "success" });
      router.push(("/inquiries/" + inquiryId) as Route);
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as string | undefined;
  const isInhouse = v.costingType === "inhouse";

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* Hidden identity fields */}
      <input type="hidden" {...register("inquiryItemId")} />
      <input type="hidden" {...register("inquiryId")} />

      {/* 1. Route toggle */}
      <SectionCard
        title="Costing Route"
        inlineHint
        hint={`Product: ${productCaption}. In-house (we manufacture) or Bought-Out (vendor).`}
      >
        <Field label="Route" labelOnly>
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
          background: "linear-gradient(135deg, #F8F7FF 0%, #EEEEFF 100%)",
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
              <Field id="c-qty" label="Quantity">
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
              <Field label="Costing Logic" labelOnly>
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
            <Field label="Weight Used For Costing" labelOnly>
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
              <MiniField label="Block Wt (gms)">
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
              <MiniField label="Theoretical Wt (gms)">
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
              <MiniField label="Pressing Wt (gms)">
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
              <MiniField label="Loss % (0.15 = 15%)">
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
              <MiniField label="RM Price / kg">
                <MoneyInput
                  aria-label="RM price per kg"
                  {...register("rmPricePerKg", numRegister)}
                />
              </MiniField>
              <MiniField label="VA % (e.g. 0.3 = 30%)">
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
              <MiniField label="VA Floor / kg">
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
              <Field id="c-tooltype" label="Tool Type">
                <input
                  id="c-tooltype"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Pressing die, Special punch"
                  {...register("toolType")}
                />
              </Field>
              <Field id="c-toolmethod" label="Cost Method">
                <input
                  id="c-toolmethod"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Flat, Amortised"
                  {...register("toolCostMethod")}
                />
              </Field>
              <Field id="c-toolcost" label="Flat Tool Cost">
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
              <MiniField label="Shaping (mins)">
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
              <MiniField label="Rate / min">
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
              <Field id="c-machtype" label="Machining Type">
                <input
                  id="c-machtype"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Grinding, EDM"
                  {...register("machiningType")}
                />
              </Field>
              <Field id="c-machrate" label="Machining Rate">
                <MoneyInput
                  id="c-machrate"
                  aria-label="Machining rate"
                  {...register("machiningRate", numRegister)}
                />
              </Field>
              <Field id="c-ovhpct" label="Overhead % (0.25 = 25%)">
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
              <MiniField label="Negotiation % (e.g. 0.03)">
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
            <Field id="bo-qty" label="Quantity">
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

          {/* Vendor */}
          <SectionCard
            title="Vendor"
            inlineHint
            hint="Outsourced vendor cost and overhead percentage."
          >
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <Field id="bo-vcost" label="Vendor Cost / pc">
                <MoneyInput
                  id="bo-vcost"
                  aria-label="Outsourced vendor cost per piece"
                  {...register("outsourcedVendorCost", numRegister)}
                />
              </Field>
              <Field id="bo-voh" label="Vendor OH % (0.1 = 10%)">
                <input
                  id="bo-voh"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  max={2}
                  className="nt-input tabular-nums"
                  placeholder="0.1"
                  {...register("vendorOhPct", numRegister)}
                />
              </Field>
              <Field id="bo-vnotes" label="Vendor Notes">
                <input
                  id="bo-vnotes"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Vendor name, sourcing note"
                  {...register("vendorNotes")}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Development */}
          <SectionCard
            title="Development"
            inlineHint
            hint="Development cost and any technical or sourcing notes."
          >
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <Field id="bo-dcost" label="Development Cost">
                <MoneyInput
                  id="bo-dcost"
                  aria-label="Development cost"
                  {...register("developmentCost", numRegister)}
                />
              </Field>
              <Field id="bo-dnotes" label="Development Notes">
                <input
                  id="bo-dnotes"
                  type="text"
                  className="nt-input"
                  {...register("developmentNotes")}
                />
              </Field>
              <Field id="bo-tnotes" label="Technical Notes">
                <input
                  id="bo-tnotes"
                  type="text"
                  className="nt-input"
                  {...register("technicalNotes")}
                />
              </Field>
            </div>
          </SectionCard>
        </>
      )}

      {/* 4. Meta — timeline + validity (shared) */}
      <SectionCard title="Timeline and Validity">
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="c-devtime" label="Development Time">
            <input
              id="c-devtime"
              type="text"
              className="nt-input"
              placeholder="e.g. 6-8 weeks"
              {...register("developmentTime")}
            />
          </Field>
          <Field id="c-deltime" label="Delivery Time">
            <input
              id="c-deltime"
              type="text"
              className="nt-input"
              placeholder="e.g. 30 days from PO"
              {...register("deliveryTime")}
            />
          </Field>
          <Field id="c-validity" label="Validity">
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
          {pending ? "Saving..." : "Save Costing"}
        </button>
      </div>
    </form>
  );
}
