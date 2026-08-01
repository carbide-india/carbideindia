"use client";

import * as React from "react";
import { GitCompareArrows, History, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INQUIRY_SHAPES, QUANTITY_UOMS } from "@/db/enums";
import type { MasterOptionItem } from "@/lib/queries/masters";
import type { CostingSpec } from "@/lib/queries/costings";
import {
  computeSpecVariance,
  countChanged,
  type SpecSnapshot,
  type SpecVarianceRow,
} from "@/lib/feasibility/spec-variance";
import { VarianceReport } from "@/components/feasibility/variance-report";
import { Select } from "@/components/ui/select";
import { SectionCard } from "@/components/inquiries/form-field";

// ─────────────────────────────────────────────────────────────────────────────
// Costing "Product & Specifications" transfer panel (sheet "From Data" 4–21).
//
// Auto-populated from the enquiry line's CURRENT spec, fully editable. Every
// tracked field is diffed live against the frozen Primary-Feasibility baseline
// (`feasibility_baseline`) via the SHARED `computeSpecVariance` engine — so an
// amber "Primary Feasibility: X" tag animates in the moment a value drifts, a
// warning banner drops in while any field differs, and the same rows power the
// shared VarianceReport modal. The revised spec flows back through the shell's
// save payload → `saveCostingMaster` updates the LIVE inquiry_item columns, so
// the variance engine (baseline jsonb vs live columns) reflects costing edits.
// ─────────────────────────────────────────────────────────────────────────────

const DIMENSION_UNITS = ["mm", "cm", "m", "inch"] as const;

// Bare "table cell" field styling — the value reads like the Feasibility
// snapshot (bold dark text), but a thin "fill-in" underline under each writable
// input makes it obvious WHERE to type (plain text alone read as non-editable).
// The underline turns indigo on focus; the SpecField cell adds a focus-within
// tint so keyboard nav stays visible.
const CELL_INPUT =
  "w-full border-x-0 border-t-0 border-b border-solid border-[#c9cee0] bg-transparent p-0 pb-1 text-[14px] font-bold leading-tight text-ink-strong outline-none transition-colors focus:border-[#3f3f94] placeholder:font-medium placeholder:text-[#aab0bd]";
const CELL_SELECT =
  "!h-auto !min-h-0 !gap-1 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none text-[14px] font-bold text-ink-strong data-[state=open]:!border-0";

/** Controlled value for the panel — the shell owns this state. All strings. */
export interface CostingSpecValue {
  custProductName: string;
  custDrawingNo: string;
  drawingRevisionNo: string;
  quantityNos: string;
  quantityUom: string;
  shape: string;
  outerDia: string;
  innerDia: string;
  length: string;
  width: string;
  thickness: string;
  dimensionUnit: string;
  dimensionNotes: string;
  gradeCustomer: string;
  gradeCustomerFacingId: string;
  gradeInternalProductionId: string;
  toleranceId: string;
  conditionId: string;
  internalProductionCodeId: string;
  partNoId: string;
}

/** Master option lists that back the panel's keyboard-navigable dropdowns. */
export interface SpecPanelMasters {
  externalGrade: MasterOptionItem[];
  internalGrade: MasterOptionItem[];
  tolerance: MasterOptionItem[];
  condition: MasterOptionItem[];
  internalProductionCode: MasterOptionItem[];
  partNo: MasterOptionItem[];
}

const str = (v: string | null | undefined): string => v ?? "";

/** Build the editable panel value from the transferred spec (or blanks). */
export function specValueFromSpec(spec: CostingSpec | null): CostingSpecValue {
  return {
    custProductName: str(spec?.custProductName),
    custDrawingNo: str(spec?.custDrawingNo),
    drawingRevisionNo: str(spec?.drawingRevisionNo),
    quantityNos: str(spec?.quantityNos),
    quantityUom: spec?.quantityUom || "Nos",
    shape: str(spec?.shape),
    outerDia: str(spec?.outerDia),
    innerDia: str(spec?.innerDia),
    length: str(spec?.length),
    width: str(spec?.width),
    thickness: str(spec?.thickness),
    dimensionUnit: spec?.dimensionUnit || "mm",
    dimensionNotes: str(spec?.dimensionNotes),
    gradeCustomer: str(spec?.gradeCustomer),
    gradeCustomerFacingId: str(spec?.gradeCustomerFacingId),
    gradeInternalProductionId: str(spec?.gradeInternalProductionId),
    toleranceId: str(spec?.toleranceId),
    conditionId: str(spec?.conditionId),
    internalProductionCodeId: str(spec?.internalProductionCodeId),
    partNoId: str(spec?.partNoId),
  };
}

/** Map the panel value onto a SpecSnapshot the variance engine understands. */
function toSnapshot(v: CostingSpecValue): SpecSnapshot {
  const orNull = (s: string) => (s.trim() === "" ? null : s);
  return {
    shape: orNull(v.shape),
    outerDia: orNull(v.outerDia),
    innerDia: orNull(v.innerDia),
    length: orNull(v.length),
    width: orNull(v.width),
    thickness: orNull(v.thickness),
    dimensionUnit: orNull(v.dimensionUnit),
    gradeCustomer: orNull(v.gradeCustomer),
    gradeCustomerFacingId: orNull(v.gradeCustomerFacingId),
    gradeInternalProductionId: orNull(v.gradeInternalProductionId),
    toleranceId: orNull(v.toleranceId),
    conditionId: orNull(v.conditionId),
    quantityNos: orNull(v.quantityNos),
    quantityUom: orNull(v.quantityUom),
  };
}

interface Props {
  value: CostingSpecValue;
  onChange: (v: CostingSpecValue) => void;
  /** Frozen PF baseline (null when the line was never locked → no variance UI). */
  baseline: SpecSnapshot | null;
  masters: SpecPanelMasters;
  /** Auto/"From Data" header fields (read-only): SM number + enquiry date. */
  smNumber?: string | null;
  enquiryDate?: Date | string | null;
}

/** "29 Jul 2026" — matches the enquiry-snapshot date format. */
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CostingSpecPanel({
  value,
  onChange,
  baseline,
  masters,
  smNumber,
  enquiryDate,
}: Props) {
  const hasBaseline = baseline != null;
  const [showReport, setShowReport] = React.useState(false);
  const [warnDismissed, setWarnDismissed] = React.useState(false);

  // Brief amber ring on the field that just diverged. Keyed by a monotonic nonce
  // so each pulse remounts the overlay (restarting the CSS animation) without
  // touching the input itself — focus is never lost mid-type.
  const [pulse, setPulse] = React.useState<{ field: string; nonce: number } | null>(null);
  const nonceRef = React.useRef(0);
  React.useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(null), 650);
    return () => clearTimeout(t);
  }, [pulse]);

  // One id → label map across every master list (feeds the shared engine).
  const labels = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const list of [
      masters.externalGrade,
      masters.internalGrade,
      masters.tolerance,
      masters.condition,
      masters.internalProductionCode,
      masters.partNo,
    ]) {
      for (const o of list) m[o.id] = o.name;
    }
    return m;
  }, [masters]);

  // Live variance rows (only meaningful when a PF baseline exists).
  const rows = React.useMemo(
    () => (hasBaseline ? computeSpecVariance(baseline, toSnapshot(value), labels) : []),
    [hasBaseline, baseline, value, labels],
  );
  const rowByField = React.useMemo(() => {
    const m = new Map<string, SpecVarianceRow>();
    for (const r of rows) m.set(r.field, r);
    return m;
  }, [rows]);
  const changedCount = countChanged(rows);
  const showWarn = hasBaseline && changedCount > 0 && !warnDismissed;

  // A field-scoped setter that also fires a pulse on the changed field.
  const patch = React.useCallback(
    (p: Partial<CostingSpecValue>, pulseField?: string) => {
      onChange({ ...value, ...p });
      if (pulseField && hasBaseline) {
        nonceRef.current += 1;
        setPulse({ field: pulseField, nonce: nonceRef.current });
      }
    },
    [onChange, value, hasBaseline],
  );

  const uomOptions = React.useMemo(
    () => QUANTITY_UOMS.map((u) => ({ value: u, label: u })),
    [],
  );
  const shapeOptions = React.useMemo(
    () => INQUIRY_SHAPES.map((s) => ({ value: s, label: s })),
    [],
  );
  const unitOptions = React.useMemo(
    () => DIMENSION_UNITS.map((u) => ({ value: u, label: u })),
    [],
  );

  return (
    <SectionCard
      title="Product & Specifications"
      inlineHint
      hint="Transferred from the enquiry / Primary Feasibility. Edit as measured — every change is tracked against the frozen PF baseline."
    >
      {/* Animated warning banner — mounts while any tracked field diverges. */}
      {showWarn && (
        <div
          className="animate-spec-warn-in flex items-start gap-3 rounded-xl border-2 border-[#f3d9a6] bg-[#fdf6e7] px-4 py-3"
          role="status"
        >
          <TriangleAlert size={18} strokeWidth={2.5} className="mt-0.5 shrink-0 text-[#b45309]" />
          <div className="flex-1 text-[13px] leading-snug text-[#8a5a12]">
            <span className="font-black text-[#b45309]">
              You&rsquo;re changing values locked in Primary Feasibility
            </span>{" "}
            — {changedCount} field{changedCount === 1 ? "" : "s"} differ. Changes are tracked in
            the Variance Report.
          </div>
          <button
            type="button"
            onClick={() => setWarnDismissed(true)}
            aria-label="Dismiss variance warning"
            className="shrink-0 rounded-lg p-1 text-[#b45309]/70 transition-colors hover:bg-[#f6e6c4] hover:text-[#b45309]"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
      )}

      {/* Spec table — bordered, divided cells for a clean, compact tabular read */}
      <div className="overflow-hidden rounded-xl border-2 border-[#b7bcd2] bg-white divide-y divide-[#e3e6f1]">
      {/* Row 0 — SM No · Enquiry Date (auto, from the enquiry — read-only) */}
      <div className="grid grid-cols-2 divide-x divide-[#eceef6] bg-[#f8f9fe]">
        <SpecField label="SM No.">
          <span className="text-[14px] font-black tabular-nums text-[#3f3f94]">
            {smNumber ?? "—"}
          </span>
        </SpecField>
        <SpecField label="Enquiry Date">
          <span className="text-[14px] font-bold text-ink-strong">
            {fmtDate(enquiryDate)}
          </span>
        </SpecField>
      </div>
      {/* Row 1 — identity: Product Name · Drawing No · Revision No · Quantity · UOM */}
      <div className="grid grid-cols-2 divide-x divide-[#eceef6] md:grid-cols-12">
        <SpecField label="Product Name" className="col-span-2 md:col-span-4">
          <input
            type="text"
            className={CELL_INPUT}
            placeholder="Product / part name"
            aria-label="Product name"
            value={value.custProductName}
            onChange={(e) => patch({ custProductName: e.target.value })}
          />
        </SpecField>
        <SpecField label="Drawing No." className="md:col-span-2">
          <input
            type="text"
            className={CELL_INPUT}
            placeholder="Drawing no."
            aria-label="Drawing number"
            value={value.custDrawingNo}
            onChange={(e) => patch({ custDrawingNo: e.target.value })}
          />
        </SpecField>
        <SpecField label="Revision No." className="md:col-span-2">
          <input
            type="text"
            className={CELL_INPUT}
            placeholder="Rev."
            aria-label="Drawing revision number"
            value={value.drawingRevisionNo}
            onChange={(e) => patch({ drawingRevisionNo: e.target.value })}
          />
        </SpecField>
        <SpecField
          label="Quantity"
          fieldKey="quantity"
          row={rowByField.get("quantity")}
          pulse={pulse}
          className="md:col-span-2"
        >
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            className={cn(CELL_INPUT, "tabular-nums")}
            placeholder="0"
            aria-label="Quantity"
            value={value.quantityNos}
            onChange={(e) => patch({ quantityNos: e.target.value }, "quantity")}
          />
        </SpecField>
        <SpecField label="UOM" className="md:col-span-2">
          <Select
            ariaLabel="Quantity unit"
            value={value.quantityUom}
            onValueChange={(v) => patch({ quantityUom: v }, "quantity")}
            className={CELL_SELECT}
            options={uomOptions}
          />
        </SpecField>
      </div>

      {/* Row 2 — Shape (small, aligned above Outer Dia) · Dimension / Spec Notes */}
      <div className="grid grid-cols-1 divide-x divide-[#eceef6] md:grid-cols-6">
        <SpecField label="Shape" fieldKey="shape" row={rowByField.get("shape")} pulse={pulse}>
          <Select
            ariaLabel="Shape"
            value={value.shape}
            onValueChange={(v) => patch({ shape: v }, "shape")}
            className={cn(CELL_SELECT, "!w-fit max-w-full")}
            placeholder="Select shape"
            options={shapeOptions}
          />
        </SpecField>
        <SpecField label="Dimension / Spec Notes" className="md:col-span-5">
          <input
            type="text"
            className={CELL_INPUT}
            placeholder="Any dimensional notes or special instructions"
            aria-label="Dimension / spec notes"
            value={value.dimensionNotes}
            onChange={(e) => patch({ dimensionNotes: e.target.value })}
          />
        </SpecField>
      </div>

      {/* Row 3 — dimensions: Outer Dia · Inner Dia · Length · Width · Thickness · Unit */}
      <div className="grid grid-cols-3 divide-x divide-[#eceef6] md:grid-cols-6">
        <SpecField label="Outer Dia" fieldKey="outerDia" row={rowByField.get("outerDia")} pulse={pulse}>
          <DimInput
            value={value.outerDia}
            onChange={(v) => patch({ outerDia: v }, "outerDia")}
            label="Outer diameter"
          />
        </SpecField>
        <SpecField label="Inner Dia" fieldKey="innerDia" row={rowByField.get("innerDia")} pulse={pulse}>
          <DimInput
            value={value.innerDia}
            onChange={(v) => patch({ innerDia: v }, "innerDia")}
            label="Inner diameter"
          />
        </SpecField>
        <SpecField label="Length" fieldKey="length" row={rowByField.get("length")} pulse={pulse}>
          <DimInput
            value={value.length}
            onChange={(v) => patch({ length: v }, "length")}
            label="Length"
          />
        </SpecField>
        <SpecField label="Width" fieldKey="width" row={rowByField.get("width")} pulse={pulse}>
          <DimInput
            value={value.width}
            onChange={(v) => patch({ width: v }, "width")}
            label="Width"
          />
        </SpecField>
        <SpecField label="Thickness" fieldKey="thickness" row={rowByField.get("thickness")} pulse={pulse}>
          <DimInput
            value={value.thickness}
            onChange={(v) => patch({ thickness: v }, "thickness")}
            label="Thickness"
          />
        </SpecField>
        <SpecField label="Unit">
          <Select
            ariaLabel="Dimension unit"
            value={value.dimensionUnit}
            onValueChange={(v) => patch({ dimensionUnit: v })}
            className={CELL_SELECT}
            options={unitOptions}
          />
        </SpecField>
      </div>

      {/* Row 4 — grades + tolerance/condition/codes, all on one line */}
      <div className="grid grid-cols-2 divide-x divide-[#eceef6] md:grid-cols-4 lg:grid-cols-7">
        <SpecField
          label="Grade (from Customer)"
          fieldKey="gradeCustomer"
          row={rowByField.get("gradeCustomer")}
          pulse={pulse}
        >
          <input
            type="text"
            className={CELL_INPUT}
            placeholder="On the drawing"
            aria-label="Grade from customer"
            value={value.gradeCustomer}
            onChange={(e) => patch({ gradeCustomer: e.target.value }, "gradeCustomer")}
          />
        </SpecField>
        <SpecField
          label="Grade (to Customer)"
          fieldKey="gradeCustomerFacing"
          row={rowByField.get("gradeCustomerFacing")}
          pulse={pulse}
        >
          <MasterSelect
            ariaLabel="Grade given to customer"
            value={value.gradeCustomerFacingId}
            onValueChange={(v) => patch({ gradeCustomerFacingId: v }, "gradeCustomerFacing")}
            options={masters.externalGrade}
          />
        </SpecField>
        <SpecField
          label="Internal Grade (Production)"
          fieldKey="gradeInternalProduction"
          row={rowByField.get("gradeInternalProduction")}
          pulse={pulse}
        >
          <MasterSelect
            ariaLabel="Internal grade for production"
            value={value.gradeInternalProductionId}
            onValueChange={(v) => patch({ gradeInternalProductionId: v }, "gradeInternalProduction")}
            options={masters.internalGrade}
          />
        </SpecField>
        <SpecField label="Tolerance" fieldKey="tolerance" row={rowByField.get("tolerance")} pulse={pulse}>
          <MasterSelect
            ariaLabel="Tolerance"
            value={value.toleranceId}
            onValueChange={(v) => patch({ toleranceId: v }, "tolerance")}
            options={masters.tolerance}
          />
        </SpecField>
        <SpecField label="Condition" fieldKey="condition" row={rowByField.get("condition")} pulse={pulse}>
          <MasterSelect
            ariaLabel="Condition"
            value={value.conditionId}
            onValueChange={(v) => patch({ conditionId: v }, "condition")}
            options={masters.condition}
          />
        </SpecField>
        <SpecField label="Internal Production Code">
          <MasterSelect
            ariaLabel="Internal production code"
            value={value.internalProductionCodeId}
            onValueChange={(v) => patch({ internalProductionCodeId: v })}
            options={masters.internalProductionCode}
          />
        </SpecField>
        <SpecField label="Part No.">
          <MasterSelect
            ariaLabel="Part number"
            value={value.partNoId}
            onValueChange={(v) => patch({ partNoId: v })}
            options={masters.partNo}
          />
        </SpecField>
      </div>
      </div>

      {/* Variance action — status centered (red = differs / not locked, green =
          matches) with the Variance button beside it. */}
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-hairline pt-4 text-center">
        <p
          className={cn(
            "inline-flex items-center rounded-lg border-2 px-4 py-2 text-[12.5px] font-bold",
            hasBaseline && changedCount === 0
              ? "border-[#16a34a] bg-[#eaf7ee] text-[#16a34a]"
              : "border-[#d32f2f] bg-[#fdecea] text-[#d32f2f]",
          )}
        >
          {hasBaseline
            ? changedCount > 0
              ? `${changedCount} field${changedCount === 1 ? "" : "s"} differ from Primary Feasibility.`
              : "Matches the Primary Feasibility baseline."
            : "This line was not locked in Primary Feasibility — no baseline to compare."}
        </p>
        <button
          type="button"
          onClick={() => setShowReport(true)}
          disabled={!hasBaseline}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border-2 px-3.5 py-2 text-[13px] font-bold transition-colors",
            hasBaseline
              ? "border-[#c7cae6] text-ink-soft hover:border-brand hover:text-brand"
              : "cursor-not-allowed border-hairline text-ink-subtle opacity-60",
          )}
        >
          <GitCompareArrows size={15} strokeWidth={2.6} />
          Variance vs Feasibility
          {changedCount > 0 && (
            <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#f59e0b] px-1.5 text-[11px] font-black text-white">
              {changedCount}
            </span>
          )}
        </button>
      </div>

      {showReport && (
        <VarianceReport
          rows={rows}
          title={value.custProductName || "Product line"}
          subtitle="Primary Feasibility vs Costing"
          onClose={() => setShowReport(false)}
        />
      )}
    </SectionCard>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

/** Label + control + inline PF-variance tag + a focus-safe pulse overlay. */
function SpecField({
  label,
  fieldKey,
  row,
  pulse,
  children,
  className,
}: {
  label: string;
  fieldKey?: string;
  row?: SpecVarianceRow;
  pulse?: { field: string; nonce: number } | null;
  children: React.ReactNode;
  className?: string;
}) {
  const pulsing = Boolean(fieldKey && pulse?.field === fieldKey && row?.changed);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 px-3 py-2 transition-colors focus-within:bg-[#f6f7fd]",
        className,
      )}
    >
      <span
        className="font-bold uppercase"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 10.5,
          letterSpacing: "0.045em",
          color: "var(--color-ink-subtle)",
        }}
      >
        {label}
      </span>
      {/* mt-auto pins the input to the cell bottom. Grid stretches every cell in
          a row to the tallest, so when a label wraps to two lines (last row) the
          inputs still align on one baseline — with no added height where labels
          are single-line. */}
      <div className="relative mt-auto">
        {children}
        {pulsing && (
          <span
            key={pulse!.nonce}
            aria-hidden
            className="animate-spec-field-pulse pointer-events-none absolute inset-0"
          />
        )}
      </div>
      <VarianceTag row={row} />
    </div>
  );
}

/** The amber "Primary Feasibility: X" inline tag — animates in on divergence. */
function VarianceTag({ row }: { row?: SpecVarianceRow }) {
  if (!row || !row.changed) return null;
  return (
    <span className="animate-spec-tag-in inline-flex w-fit items-center gap-1.5 rounded-md border border-[#f3d9a6] bg-[#fdf6e7] px-2 py-1 text-[11px] font-bold text-[#b45309]">
      <History size={11} strokeWidth={2.6} className="shrink-0" />
      Primary Feasibility: {row.feasibilityValue}
    </span>
  );
}

/** A dimension number input (shared styling across the 5 dimension cells). */
function DimInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      className={cn(CELL_INPUT, "tabular-nums")}
      placeholder="0"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Master-option Select with an empty-state placeholder when the master is bare. */
function MasterSelect({
  ariaLabel,
  value,
  onValueChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  onValueChange: (v: string) => void;
  options: MasterOptionItem[];
}) {
  return (
    <Select
      ariaLabel={ariaLabel}
      value={value}
      onValueChange={onValueChange}
      className={CELL_SELECT}
      placeholder={options.length === 0 ? "No options in master" : "Select"}
      disabled={options.length === 0}
      options={options.map((o) => ({ value: o.id, label: o.name }))}
    />
  );
}
