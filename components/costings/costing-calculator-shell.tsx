"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import type { VendorOption } from "@/lib/queries/vendors";
import type { MasterOptionItem } from "@/lib/queries/masters";
import {
  computeInhouseMaster,
  emptyInhouseCalculatorValue,
  type InhouseCalculatorValue,
} from "@/lib/costing/inhouse-master";
import { compareVendors } from "@/lib/costing/compare";
import { saveCostingMaster } from "@/app/(app)/costings/actions";
import {
  InhouseCalculator,
  type CalcMasterOption,
  type CalcVendorOption,
} from "@/components/costings/inhouse-calculator";
import {
  BuyoutCalculator,
  BuyoutDecisionPanel,
  emptyBuyoutValue,
  type BuyoutValue,
} from "@/components/costings/buyout-calculator";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import {
  Field,
  SectionCard,
  Segmented,
} from "@/components/inquiries/form-field";
import {
  CostingSpecPanel,
  specValueFromSpec,
  type CostingSpecValue,
  type SpecPanelMasters,
} from "@/components/costings/costing-spec-panel";
import type { CostingSpec } from "@/lib/queries/costings";

// ─────────────────────────────────────────────────────────────────────────────
// The full Costing Master flow (spec §10): entry routing → In-House and/or
// Buy-Out panels → terminal (Admin-Master) fields → (for "Both") a side-by-side
// compare view → save. Fully keyboard-first. All compute is delegated to the
// tested pure engines; the server recomputes authoritatively on save.
// ─────────────────────────────────────────────────────────────────────────────

/** Costing-type entry choice. */
type CostingMode = "bought_out" | "inhouse" | "both";

const MODE_OPTIONS: readonly { value: CostingMode; label: string }[] = [
  { value: "bought_out", label: "Bought-Out" },
  { value: "inhouse", label: "Manufactured" },
  { value: "both", label: "Both" },
];

const SOLD_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

const DURATION_UNIT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
];

export interface CostingMasters {
  toolingChart: MasterOptionItem[];
  machiningOp: MasterOptionItem[];
  quantityTolerance: MasterOptionItem[];
  paymentTerm: MasterOptionItem[];
}

interface Props {
  inquiryItemId: string;
  inquiryId: string;
  productCaption: string;
  /** Quantity pulled from the inquiry line (may be null / editable). */
  lineQty: number | null;
  /** Auto/"From Data" header fields (read-only) shown on the spec panel. */
  smNumber?: string | null;
  enquiryDate?: Date | string | null;
  vendorOptions: VendorOption[];
  masters: CostingMasters;
  /** Customer's default payment-terms label (from the Client Master), if any. */
  defaultPaymentTerms?: string | null;
  /** The transferred Product & Specifications ("From Data" 4–21), null if missing. */
  spec: CostingSpec | null;
  /** Master lists backing the spec panel's editable dropdowns. */
  specMasters: SpecPanelMasters;
}

const toCalcOptions = (items: MasterOptionItem[]): CalcMasterOption[] =>
  items.map((o) => ({ id: o.id, label: o.name }));

const toCalcVendors = (items: VendorOption[]): CalcVendorOption[] =>
  items.map((o) => ({ id: o.id, name: o.name, vendorCode: o.vendorCode }));

/** Cheapest landed BO cost / pc across the panel's rows (matches the server rank). */
function buyoutCheapestPerPiece(value: BuyoutValue, qty: number): number {
  const quotes = value.vendors.map((r) => {
    const unit = r.unitPrice.trim() === "" ? null : Number(r.unitPrice);
    return {
      id: r.key,
      unitPrice: Number.isFinite(unit as number) ? unit : null,
      vendorOhPct: (Number(r.vendorOhPct) || 0) / 100,
      developmentCost: Number(r.developmentCost) || 0,
      leadTimeDays: r.leadTimeDays.trim() === "" ? null : Math.trunc(Number(r.leadTimeDays)),
      creditPeriodDays:
        r.creditPeriodDays.trim() === "" ? null : Math.trunc(Number(r.creditPeriodDays)),
    };
  });
  const cmp = compareVendors(quotes, qty > 0 ? qty : 1);
  return cmp.cheapestId != null ? cmp.byId[cmp.cheapestId] ?? 0 : 0;
}

export function CostingCalculatorShell({
  inquiryItemId,
  inquiryId,
  productCaption,
  lineQty,
  smNumber,
  enquiryDate,
  vendorOptions,
  masters,
  defaultPaymentTerms,
  spec,
  specMasters,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // ── Entry routing ──
  const [soldBefore, setSoldBefore] = React.useState<"yes" | "no" | undefined>(undefined);
  const [mode, setMode] = React.useState<CostingMode | undefined>(undefined);

  // ── Quantity (from the inquiry line) ──
  const [qty, setQty] = React.useState<number | "">(
    typeof lineQty === "number" && Number.isFinite(lineQty) ? lineQty : "",
  );
  const qtyNum = typeof qty === "number" && Number.isFinite(qty) ? qty : 0;

  // ── Panel values ──
  const [inhouse, setInhouse] = React.useState<InhouseCalculatorValue>(() =>
    emptyInhouseCalculatorValue({ qty }),
  );
  const [buyout, setBuyout] = React.useState<BuyoutValue>(() => emptyBuyoutValue());

  // ── Product & Specifications transfer panel (editable, variance-tracked) ──
  const [specValue, setSpecValue] = React.useState<CostingSpecValue>(() =>
    specValueFromSpec(spec),
  );

  // Keep the In-House value's qty in lockstep with the shell quantity.
  React.useEffect(() => {
    setInhouse((prev) => (prev.qty === qty ? prev : { ...prev, qty }));
  }, [qty]);

  // ── Terminal fields ──
  const [quantityToleranceId, setQuantityToleranceId] = React.useState("");
  const [deliveryAmt, setDeliveryAmt] = React.useState<number | "">("");
  const [deliveryUnit, setDeliveryUnit] = React.useState("days");
  const [validityAmt, setValidityAmt] = React.useState<number | "">("");
  const [validityUnit, setValidityUnit] = React.useState("days");
  const [technicalNotes, setTechnicalNotes] = React.useState("");
  const [commercialNotes, setCommercialNotes] = React.useState("");

  // Payment terms default from the customer: pre-select the master option whose
  // label matches the client's default (once, on mount).
  const [paymentTermId, setPaymentTermId] = React.useState("");
  React.useEffect(() => {
    if (!defaultPaymentTerms) return;
    const hit = masters.paymentTerm.find(
      (o) => o.name.trim().toLowerCase() === defaultPaymentTerms.trim().toLowerCase(),
    );
    if (hit) setPaymentTermId(hit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showInhouse = mode === "inhouse" || mode === "both";
  const showBuyout = mode === "bought_out" || mode === "both";

  // ── Live cross-path compare (for "Both") ──
  const inhouseTotals = React.useMemo(() => computeInhouseMaster(inhouse), [inhouse]);
  const inhousePerPiece = inhouseTotals.quoteInclPerPiece;
  const buyoutPerPiece = React.useMemo(
    () => buyoutCheapestPerPiece(buyout, qtyNum),
    [buyout, qtyNum],
  );

  const inhouseMasters = React.useMemo(
    () => ({
      toolingChart: toCalcOptions(masters.toolingChart),
      machiningOp: toCalcOptions(masters.machiningOp),
    }),
    [masters.toolingChart, masters.machiningOp],
  );
  const inhouseVendorOptions = React.useMemo(
    () => toCalcVendors(vendorOptions),
    [vendorOptions],
  );

  const machiningLabel = React.useCallback(
    (optionId: string) => masters.machiningOp.find((o) => o.id === optionId)?.name ?? "",
    [masters.machiningOp],
  );
  const vendorLabel = React.useCallback(
    (vendorId: string) => vendorOptions.find((o) => o.id === vendorId)?.name ?? "",
    [vendorOptions],
  );

  const { formProps } = useKeyboardForm();

  const buildDuration = (amt: number | "", unit: string): string | undefined => {
    if (typeof amt !== "number" || !Number.isFinite(amt) || amt <= 0) return undefined;
    return `${amt} ${unit}`;
  };

  const doSubmit = () => {
    setServerError(null);
    if (!mode) {
      setServerError("Choose a costing type to continue.");
      return;
    }

    const paymentTerms =
      masters.paymentTerm.find((o) => o.id === paymentTermId)?.name ?? undefined;

    const inhousePayload = showInhouse
      ? {
          ...inhouse,
          machiningOps: inhouse.machiningOps.map((m) => ({
            optionId: m.optionId,
            label: machiningLabel(m.optionId),
            minutes: m.minutes,
            rate: m.rate,
          })),
          externalVendors: inhouse.externalVendors.map((e) => ({
            vendorId: e.vendorId,
            label: vendorLabel(e.vendorId),
            rate: e.rate,
          })),
          devCosts: inhouse.devCosts.map((d) => ({
            description: d.description,
            qty: d.qty,
            rate: d.rate,
            amount: d.amount,
            levyMode: d.levyMode,
          })),
        }
      : undefined;

    const buyoutPayload = showBuyout
      ? {
          vendors: buyout.vendors.map((r) => ({
            vendorId: r.vendorId,
            vendorName: r.vendorName,
            vendorCode: r.vendorCode,
            unitPrice: r.unitPrice,
            vendorOhPct: r.vendorOhPct,
            developmentCost: r.developmentCost,
            leadTimeDays: r.leadTimeDays,
            creditPeriodDays: r.creditPeriodDays,
            paymentTerms: r.paymentTerms,
            // per-vendor commercial terms (moved off the costing level for BO)
            paymentTermsId: r.paymentTermsId,
            quantityToleranceId: r.quantityToleranceId,
            deliveryTime: r.deliveryTime,
            deliveryTimeUnit: r.deliveryTimeUnit,
            validity: r.validity,
            validityUnit: r.validityUnit,
            quoteLink: r.quoteLink,
            notes: r.notes,
            key: r.key,
          })),
          selectedKey: buyout.selectedKey,
        }
      : undefined;

    // The (possibly costing-revised) Product & Specifications — writes back to the
    // LIVE inquiry_item spec columns so the PF-vs-Costing variance engine reflects
    // costing edits. Blank text → undefined; blank number → "" (schema drops it).
    const t = (s: string) => (s.trim() === "" ? undefined : s.trim());
    const revisedSpec = {
      custProductName: t(specValue.custProductName),
      custDrawingNo: t(specValue.custDrawingNo),
      drawingRevisionNo: t(specValue.drawingRevisionNo),
      quantityNos: specValue.quantityNos,
      quantityUom: t(specValue.quantityUom),
      shape: t(specValue.shape),
      outerDia: specValue.outerDia,
      innerDia: specValue.innerDia,
      length: specValue.length,
      width: specValue.width,
      thickness: specValue.thickness,
      dimensionUnit: t(specValue.dimensionUnit),
      dimensionNotes: t(specValue.dimensionNotes),
      gradeCustomer: t(specValue.gradeCustomer),
      gradeCustomerFacingId: t(specValue.gradeCustomerFacingId),
      gradeInternalProductionId: t(specValue.gradeInternalProductionId),
      toleranceId: t(specValue.toleranceId),
      conditionId: t(specValue.conditionId),
      internalProductionCodeId: t(specValue.internalProductionCodeId),
      partNoId: t(specValue.partNoId),
    };

    startTransition(async () => {
      const res = await saveCostingMaster({
        inquiryItemId,
        inquiryId,
        costingMode: mode,
        soldBefore: soldBefore ? soldBefore === "yes" : undefined,
        qty,
        quantityToleranceId: quantityToleranceId || undefined,
        deliveryTime: buildDuration(deliveryAmt, deliveryUnit),
        validity: buildDuration(validityAmt, validityUnit),
        paymentTerms,
        technicalNotes: technicalNotes || undefined,
        commercialNotes: commercialNotes || undefined,
        inhouse: inhousePayload,
        buyout: buyoutPayload,
        revisedSpec,
      });
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Costing saved successfully.", type: "success" });
      router.push(("/inquiries/" + inquiryId) as Route);
    });
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  return (
    <form onSubmit={onFormSubmit} onKeyDown={formProps.onKeyDown} className="flex flex-col gap-6" noValidate>
      {/* 0. PRODUCT & SPECIFICATIONS (transferred, editable, variance-tracked) */}
      <CostingSpecPanel
        value={specValue}
        onChange={setSpecValue}
        baseline={spec?.feasibilityBaseline ?? null}
        masters={specMasters}
        smNumber={smNumber ?? null}
        enquiryDate={enquiryDate ?? null}
      />

      {/* 1. ENTRY ROUTING */}
      <SectionCard
        title="Start Costing"
        inlineHint
        hint={`Product: ${productCaption}. Choose how this line is costed.`}
      >
        {/* Product Sold · Costing Type · Quantity — one line, small controls */}
        <div className="grid grid-cols-1 items-end gap-5 md:grid-cols-3">
          <Field label="Product Sold / Made Before?" labelOnly>
            <Segmented
              options={SOLD_OPTIONS}
              value={soldBefore}
              onChange={(v) => setSoldBefore(v)}
              ariaLabel="Product sold or made before"
              className="!border-2 !border-[#9aa0c8]"
            />
          </Field>
          <Field label="Costing Type" labelOnly>
            <Segmented
              options={MODE_OPTIONS}
              value={mode}
              onChange={(v) => v && setMode(v)}
              allowClear={false}
              ariaLabel="Costing type"
              className="!border-2 !border-[#9aa0c8]"
            />
          </Field>
          <Field label="Quantity (from enquiry line)" labelOnly>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="any"
              className="nt-input tabular-nums w-full"
              style={{ borderWidth: 2, borderColor: "#9aa0c8" }}
              placeholder="0"
              aria-label="Quantity"
              value={qty}
              onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </Field>
        </div>
      </SectionCard>

      {!mode && (
        <p className="text-[13px] text-ink-subtle">
          Pick a costing type above to open the calculator.
        </p>
      )}

      {/* 2. IN-HOUSE PANEL */}
      {showInhouse && (
        <div className="flex flex-col gap-3">
          <PanelHeading label="In-House (Manufactured)" />
          <InhouseCalculator
            value={inhouse}
            onChange={setInhouse}
            masters={inhouseMasters}
            vendorOptions={inhouseVendorOptions}
          />
        </div>
      )}

      {/* 3. BUY-OUT PANEL — per-vendor input cards (the "which vendor?" decision
          panel is rendered LAST, after the shared notes, since the vendor is
          chosen last). */}
      {showBuyout && (
        <div className="flex flex-col gap-3">
          <PanelHeading label="Bought-Out (Vendor)" />
          <BuyoutCalculator
            value={buyout}
            onChange={setBuyout}
            vendorOptions={vendorOptions}
            paymentTermOptions={masters.paymentTerm}
            quantityToleranceOptions={masters.quantityTolerance}
          />
        </div>
      )}

      {/* 4. COMPARE VIEW (Both only) */}
      {mode === "both" && (
        <CompareView
          inhousePerPiece={inhousePerPiece}
          buyoutPerPiece={buyoutPerPiece}
          qty={qtyNum}
        />
      )}

      {/* 5. TERMINAL FIELDS. The structured commercial terms (Quantity Tolerance ·
          Payment Terms · Delivery · Validity) now live PER-VENDOR on each Buy-Out
          card, so this shared block carries them only for the in-house path; when
          the costing is bought-out only, it collapses to just the shared notes. */}
      {mode && (
        <SectionCard
          title={showInhouse ? "Commercial Terms" : "Notes"}
          inlineHint
          hint={
            showInhouse
              ? "In-house commercial terms are admin-managed. Delivery & validity use a number + unit. Bought-out terms are set per vendor above."
              : "Notes for this costing. Bought-out commercial terms are set per vendor above."
          }
        >
          {showInhouse && (
            /* Quantity Tolerance · Payment Terms · Delivery Time · Price Validity — one line */
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <Field label="Quantity Tolerance" labelOnly>
                <Select
                  ariaLabel="Quantity tolerance"
                  value={quantityToleranceId}
                  onValueChange={setQuantityToleranceId}
                  placeholder={
                    masters.quantityTolerance.length === 0
                      ? "No options in master"
                      : "Select quantity tolerance"
                  }
                  disabled={masters.quantityTolerance.length === 0}
                  options={masters.quantityTolerance.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Field>
              <Field label="Payment Terms" labelOnly>
                <Select
                  ariaLabel="Payment terms"
                  value={paymentTermId}
                  onValueChange={setPaymentTermId}
                  placeholder={
                    masters.paymentTerm.length === 0
                      ? "No options in master"
                      : "Select payment terms"
                  }
                  disabled={masters.paymentTerm.length === 0}
                  searchable
                  searchPlaceholder="Search payment terms"
                  options={masters.paymentTerm.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Field>
              <DurationField
                label="Delivery Time"
                amount={deliveryAmt}
                unit={deliveryUnit}
                onAmount={setDeliveryAmt}
                onUnit={setDeliveryUnit}
              />
              <DurationField
                label="Price Validity"
                amount={validityAmt}
                unit={validityUnit}
                onAmount={setValidityAmt}
                onUnit={setValidityUnit}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
            <Field label="Technical Notes" labelOnly>
              <NotesField
                rows={3}
                value={technicalNotes}
                onChange={setTechnicalNotes}
                placeholder="Technical notes for this costing"
              />
            </Field>
            <Field label="Commercial Notes" labelOnly>
              <NotesField
                rows={3}
                value={commercialNotes}
                onChange={setCommercialNotes}
                placeholder="Commercial notes for this costing"
              />
            </Field>
          </div>
        </SectionCard>
      )}

      {/* 6. WHICH VENDOR? — the Buy-Out decision panel (scenario tiles + landed-
          cost comparison table + Selected Final Cost). Rendered LAST, just above
          Save, because the vendor is chosen after every quote + its commercial
          terms are entered. */}
      {showBuyout && (
        <div className="flex flex-col gap-3">
          <PanelHeading label="Which vendor? — decide" />
          <BuyoutDecisionPanel value={buyout} onChange={setBuyout} />
        </div>
      )}

      {/* Errors */}
      {serverError && (
        <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-red-deep)" }}>
          {serverError}
        </p>
      )}

      {/* Submit */}
      {mode && (
        <div
          className="flex items-center justify-end gap-3 pt-2"
          style={{ borderTop: "1px solid var(--color-hairline)" }}
        >
          <span className="text-[11px] text-ink-subtle">Ctrl / ⌘ + Enter to save</span>
          <button
            type="submit"
            disabled={pending}
            className="text-cta text-white px-8 py-4 rounded-chip transition-transform disabled:opacity-50"
            style={{
              background: "#454595",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.34)",
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: "0.005em",
            }}
          >
            {pending
              ? "Saving..."
              : mode === "both"
                ? "Save both & decide"
                : "Save Costing"}
          </button>
        </div>
      )}
    </form>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function PanelHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-4 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-brand)" }} />
      <h2
        className="text-[13px] font-black uppercase tracking-[0.12em]"
        style={{ color: "var(--color-brand)" }}
      >
        {label}
      </h2>
    </div>
  );
}

/** Google-style duration: a number box + a days/weeks unit segmented control. */
function DurationField({
  label,
  amount,
  unit,
  onAmount,
  onUnit,
}: {
  label: string;
  amount: number | "";
  unit: string;
  onAmount: (v: number | "") => void;
  onUnit: (v: string) => void;
}) {
  return (
    <Field label={label} labelOnly>
      <div className="flex items-stretch gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step="any"
          className="nt-input tabular-nums w-[120px]"
          placeholder="0"
          aria-label={`${label} amount`}
          value={amount}
          onChange={(e) => onAmount(e.target.value === "" ? "" : Number(e.target.value))}
        />
        <Segmented
          options={DURATION_UNIT_OPTIONS}
          value={unit}
          onChange={(v) => v && onUnit(v)}
          allowClear={false}
          ariaLabel={`${label} unit`}
        />
      </div>
    </Field>
  );
}

/** Side-by-side make-vs-buy compare with the cheaper-path recommendation. */
function CompareView({
  inhousePerPiece,
  buyoutPerPiece,
  qty,
}: {
  inhousePerPiece: number;
  buyoutPerPiece: number;
  qty: number;
}) {
  const hasBoth = inhousePerPiece > 0 && buyoutPerPiece > 0;
  const buyCheaper = buyoutPerPiece < inhousePerPiece;
  const equal = Math.abs(inhousePerPiece - buyoutPerPiece) < 0.005;
  const cheaperLabel = equal ? "Level" : buyCheaper ? "Bought-Out" : "In-House";
  const cheaperPerPiece = buyCheaper ? buyoutPerPiece : inhousePerPiece;

  return (
    <section
      className="rounded-section border-2 p-6"
      style={{
        background: "#FFFFFF",
        borderColor: "var(--color-brand)",
        boxShadow: "0 4px 24px -8px rgba(63,63,148,0.18)",
      }}
    >
      <p
        className="mb-4 text-[11px] uppercase tracking-[0.16em] font-bold"
        style={{ color: "var(--color-brand)" }}
      >
        Make vs Buy — Compare
      </p>
      <div className="flex flex-wrap items-stretch gap-4">
        <ComparePane
          label="In-House Quote / pc"
          value={inhousePerPiece}
          highlight={hasBoth && !buyCheaper && !equal}
        />
        <ComparePane
          label="Bought-Out Quote / pc"
          value={buyoutPerPiece}
          highlight={hasBoth && buyCheaper && !equal}
        />
        <div
          className="flex min-w-[220px] flex-1 flex-col justify-center gap-1 rounded-section border-2 p-4"
          style={{ borderColor: "var(--color-brand)", background: "#EEEEFF" }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-brand)" }}
          >
            Recommended (cheaper)
          </span>
          {hasBoth ? (
            <>
              <span className="flex items-center gap-2 text-[18px] font-black text-ink-strong">
                {cheaperLabel}
                <ArrowRight size={16} strokeWidth={2.6} style={{ color: "var(--color-brand)" }} />
                <span className="tabular-nums">{formatInr(cheaperPerPiece)}</span>
              </span>
              <span className="text-[12.5px] font-semibold text-ink-muted">
                Quote value ≈ {formatInr(cheaperPerPiece * qty)} for {qty} pcs. Both paths are
                saved; the send-to-customer choice is made at approval.
              </span>
            </>
          ) : (
            <span className="text-[13px] font-semibold text-ink-subtle">
              Fill both panels to compare.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function ComparePane({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight: boolean;
}) {
  return (
    <div
      className="flex min-w-[180px] flex-1 flex-col gap-1 rounded-section border-2 p-4"
      style={{
        borderColor: highlight ? "#16a34a" : "#b7bcd2",
        background: highlight ? "#ECF7EF" : "var(--color-surface-card)",
      }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </span>
      <span className="tabular-nums text-[24px] font-black text-ink-strong">
        {value > 0 ? formatInr(value) : "—"}
      </span>
    </div>
  );
}
