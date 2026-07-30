"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { type ManufacturingCostOutput } from "@/lib/costing/mfg-engine";
import {
  computeInhouseMaster,
  totalMachiningMinutes,
  NEW_TOOL,
  numOr,
  numOrU,
  type InhouseCalculatorValue,
  type LevyMode,
  type CalcToolType,
  type CalcWeightMethod,
  type DevCostRow,
  type MachiningOpRow,
  type ExternalMachiningVendorRow,
} from "@/lib/costing/inhouse-master";
import { formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";
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

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC CONTRACT — the value object + supporting types live in the pure
// `lib/costing/inhouse-master.ts` module (imported above) so the SAME shape and
// compute are shared by this panel, the shell, and the server action. They are
// re-exported here for back-compat with callers that import them off the panel.
// ─────────────────────────────────────────────────────────────────────────────

export {
  emptyInhouseCalculatorValue,
  NEW_TOOL,
  type InhouseCalculatorValue,
  type LevyMode,
  type CalcToolType,
  type CalcWeightMethod,
  type DevCostRow,
  type MachiningOpRow,
  type ExternalMachiningVendorRow,
} from "@/lib/costing/inhouse-master";

/** Admin-Master option (id + display label) fed to the calculator dropdowns. */
export interface CalcMasterOption {
  id: string;
  label: string;
}

/** Master option sets the calculator needs. */
export interface InhouseCalculatorMasters {
  /** `tooling_chart` master options. */
  toolingChart: CalcMasterOption[];
  /** `machining_op` master options. */
  machiningOp: CalcMasterOption[];
}

/** Minimal vendor shape for the external-machining rate rows. */
export interface CalcVendorOption {
  id: string;
  name: string;
  vendorCode?: string | null;
}

export interface InhouseCalculatorProps {
  value: InhouseCalculatorValue;
  onChange: (next: InhouseCalculatorValue) => void;
  masters: InhouseCalculatorMasters;
  vendorOptions?: CalcVendorOption[];
  /** When true the five size fields are read-only (transferred from upstream). */
  sizesTransferred?: boolean;
  /** Optional submit handler for Ctrl/Cmd + Enter. */
  onSubmit?: () => void;
}

/** Hard cap on external machining vendors (§7). */
const MAX_EXTERNAL_VENDORS = 5;

/** Unique id for a fresh repeatable row (browser crypto, safe fallback). */
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `row-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

const perGm = (n: number): string => "Rs " + n.toFixed(4);

// ── shared field atoms ────────────────────────────────────────────────────────

/** Plain number input bound to a `number | ""` cell. */
function NumberInput({
  value,
  onChange,
  className,
  ...rest
}: {
  value: number | "";
  onChange: (v: number | "") => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      className={cn("nt-input tabular-nums", className)}
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      {...rest}
    />
  );
}

/** ₹ money input bound to a `number | ""` cell. */
function MoneyField({
  value,
  onChange,
  ...rest
}: {
  value: number | "";
  onChange: (v: number | "") => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <MoneyInput
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      {...rest}
    />
  );
}

/** Read-only value display used for transferred sizes. */
function ReadonlyValue({ value }: { value: string }) {
  return (
    <div className="nt-input flex items-center bg-surface-soft text-ink-strong tabular-nums">
      {value.trim() ? value : <span className="text-ink-subtle">—</span>}
    </div>
  );
}

const LEVY_OPTIONS: readonly { value: LevyMode; label: string }[] = [
  { value: "flat", label: "Flat Cost" },
  { value: "per_piece", label: "Cost / Piece" },
  { value: "none", label: "Do not levy" },
];

const TOOL_TYPE_OPTIONS: readonly { value: CalcToolType; label: string }[] = [
  { value: "perfect", label: "Perfect Tool" },
  { value: "block", label: "Block Tool" },
  { value: "big", label: "Big Tool" },
];

const WEIGHT_METHOD_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "1", label: "1 · Previously made (Pressing Wt)" },
  { value: "2", label: "2 · Tooling available (Pressing Wt)" },
  { value: "3", label: "3 · Tooling to be made (Theoretical Wt)" },
  { value: "4", label: "4 · No tooling (Theoretical Wt)" },
];

/** Focus-the-new-row helper for the +1 repeatable sections. */
function useAppendFocus(length: number) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const pending = React.useRef(false);
  React.useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const c = containerRef.current;
    if (!c) return;
    const rows = c.querySelectorAll<HTMLElement>("[data-row]");
    const last = rows[rows.length - 1];
    if (!last) return;
    const first = last.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), [aria-haspopup="listbox"]:not([disabled]), textarea:not([disabled])',
    );
    first?.focus();
  }, [length]);
  return {
    containerRef,
    markAppend: () => {
      pending.current = true;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-House manufacturing calculator PANEL (spec §10, steps 2-7). Fully keyboard
 * -first, live-recomputing via `computeManufacturingCost`. Pure UI: it owns no
 * server calls and no schema — it takes a `value`, emits `onChange(next)`, and
 * renders the engine's step-by-step output on every keystroke.
 */
export function InhouseCalculator({
  value,
  onChange,
  masters,
  vendorOptions = [],
  sizesTransferred = false,
  onSubmit,
}: InhouseCalculatorProps) {
  const { containerProps } = useKeyboardForm({ onSubmit });

  // Single-field patch — everything routes through here so onChange stays pure.
  const patch = React.useCallback(
    (p: Partial<InhouseCalculatorValue>) => onChange({ ...value, ...p }),
    [onChange, value],
  );

  // ── repeatable-row focus wiring ──
  const devFocus = useAppendFocus(value.devCosts.length);
  const machFocus = useAppendFocus(value.machiningOps.length);
  const vendFocus = useAppendFocus(value.externalVendors.length);

  // ── dropdown option lists ──
  const toolingOptions = React.useMemo(
    () => [
      ...masters.toolingChart.map((o) => ({ value: o.id, label: o.label })),
      { value: NEW_TOOL, label: "＋ New Tool to be Developed" },
    ],
    [masters.toolingChart],
  );
  const machiningOptions = React.useMemo(
    () => masters.machiningOp.map((o) => ({ value: o.id, label: o.label })),
    [masters.machiningOp],
  );
  const vendorSelectOptions = React.useMemo(
    () =>
      vendorOptions.map((o) => ({
        value: o.id,
        label: o.vendorCode ? `${o.name} · ${o.vendorCode}` : o.name,
      })),
    [vendorOptions],
  );

  // ── machining base + LIVE engine compute (single shared source of truth) ──
  const totalMachiningMins = React.useMemo(
    () => totalMachiningMinutes(value),
    [value],
  );

  // The whole In-House breakdown (engine chain + levied add-ons) comes from the
  // pure `computeInhouseMaster` wrapper — the SAME function the server recomputes
  // with on save, so the live estimate and the persisted number can never drift.
  const totals = React.useMemo(() => computeInhouseMaster(value), [value]);
  const out: ManufacturingCostOutput = totals.engine;
  const machiningBase = totals.machiningBase;
  const {
    toolLevyPerPiece,
    mandrilPerPiece,
    devPerPiece,
    addOnPerPiece,
    quoteInclPerPiece,
    quoteInclValue,
  } = totals;

  const qty = numOr(value.qty, 0);

  // VA winner badge.
  const vaFromPct = (numOr(value.vaPct, 0) / 100) * numOr(value.rmPerKg, 0);
  const vaFloorWins = numOr(value.vaFloorPerKg, 2000) >= vaFromPct;

  // ── row mutators ──
  const addDev = () => {
    devFocus.markAppend();
    patch({
      devCosts: [
        ...value.devCosts,
        { id: newId(), description: "", qty: "", rate: "", amount: "", levyMode: "none" },
      ],
    });
  };
  const setDev = (id: string, p: Partial<DevCostRow>) =>
    patch({
      devCosts: value.devCosts.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...p };
        // Auto-derive amount = qty × rate whenever qty or rate changes.
        if ("qty" in p || "rate" in p) {
          next.amount = numOr(next.qty, 0) * numOr(next.rate, 0);
        }
        return next;
      }),
    });
  const removeDev = (id: string) =>
    patch({ devCosts: value.devCosts.filter((r) => r.id !== id) });

  const addMachOp = () => {
    machFocus.markAppend();
    patch({
      machiningOps: [
        ...value.machiningOps,
        { id: newId(), optionId: "", minutes: "", rate: "" },
      ],
    });
  };
  const setMachOp = (id: string, p: Partial<MachiningOpRow>) =>
    patch({
      machiningOps: value.machiningOps.map((r) => (r.id === id ? { ...r, ...p } : r)),
    });
  const removeMachOp = (id: string) =>
    patch({ machiningOps: value.machiningOps.filter((r) => r.id !== id) });

  const addVendor = () => {
    if (value.externalVendors.length >= MAX_EXTERNAL_VENDORS) return;
    vendFocus.markAppend();
    patch({
      externalVendors: [
        ...value.externalVendors,
        { id: newId(), vendorId: "", rate: "" },
      ],
    });
  };
  const setVendor = (id: string, p: Partial<ExternalMachiningVendorRow>) =>
    patch({
      externalVendors: value.externalVendors.map((r) => (r.id === id ? { ...r, ...p } : r)),
    });
  const removeVendor = (id: string) => {
    // If the removed vendor was the decided rate source, fall back to internal.
    const nextChoice = value.machiningChoice === id ? "internal" : value.machiningChoice;
    patch({
      externalVendors: value.externalVendors.filter((r) => r.id !== id),
      machiningChoice: nextChoice,
    });
  };

  // "Decide which" rate-source options.
  const rateSourceOptions = React.useMemo(
    () => [
      { value: "per_op", label: "By operation rates" },
      { value: "internal", label: "Internal rate" },
      ...value.externalVendors.map((r, i) => {
        const vend = vendorOptions.find((o) => o.id === r.vendorId);
        return { value: r.id, label: `External · ${vend ? vend.name : `Vendor ${i + 1}`}` };
      }),
    ],
    [value.externalVendors, vendorOptions],
  );

  const newToolPicked = value.toolingChartId === NEW_TOOL;

  return (
    <div onKeyDown={containerProps.onKeyDown} className="flex flex-col gap-6">
      {/* LIVE OUTPUT — the engine breakdown, recomputing on every keystroke. */}
      <OutputCard
        out={out}
        qty={qty}
        addOnPerPiece={addOnPerPiece}
        quoteInclPerPiece={quoteInclPerPiece}
        quoteInclValue={quoteInclValue}
        toolLevyPerPiece={toolLevyPerPiece}
        mandrilPerPiece={mandrilPerPiece}
        devPerPiece={devPerPiece}
      />

      {/* 2. SIZES */}
      <SectionCard
        title="Sizes"
        inlineHint
        hint={
          sizesTransferred
            ? "Transferred from the Tolerance Calculator (read-only)."
            : "Finished, tolerance, sintered, green sizes & shrinkage."
        }
      >
        <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-1">
          {(
            [
              ["finishedSize", "Finished Size"],
              ["toleranceSize", "Tolerance Size"],
              ["sinteredSize", "Sintered Size"],
              ["greenSize", "Green Size"],
              ["shrinkage", "Shrinkage"],
            ] as const
          ).map(([key, label]) => (
            <MiniField key={key} label={label}>
              {sizesTransferred ? (
                <ReadonlyValue value={value[key]} />
              ) : (
                <input
                  type="text"
                  className="nt-input"
                  placeholder="—"
                  aria-label={label}
                  value={value[key]}
                  onChange={(e) => patch({ [key]: e.target.value })}
                />
              )}
            </MiniField>
          ))}
        </div>
      </SectionCard>

      {/* 3. TOOLING */}
      <SectionCard
        title="Tooling"
        inlineHint
        hint="Pick a tooling chart (or develop a new tool), the tool type, and how the tool cost is levied."
      >
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label="Tooling Chart" labelOnly>
            <Select
              ariaLabel="Tooling chart"
              value={value.toolingChartId}
              onValueChange={(v) => patch({ toolingChartId: v })}
              placeholder={
                masters.toolingChart.length === 0
                  ? "No charts yet — develop new"
                  : "Select tooling chart"
              }
              searchable
              searchPlaceholder="Search tooling chart"
              options={toolingOptions}
            />
          </Field>
          <Field label="Tool Type" labelOnly>
            <Segmented
              options={TOOL_TYPE_OPTIONS}
              value={value.toolType}
              onChange={(v) => v && patch({ toolType: v })}
              allowClear={false}
              ariaLabel="Tool type"
            />
          </Field>
        </div>

        {newToolPicked && (
          <p
            className="rounded-chip border px-3 py-2 text-[12.5px] font-medium"
            style={{
              background: "#FEF6E7",
              borderColor: "#e2c78a",
              color: "#8a6218",
            }}
          >
            New tool — enter the tool cost manually below via the levy amount.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label="Levy Tool Cost" labelOnly>
            <Segmented
              options={LEVY_OPTIONS}
              value={value.levyToolMode}
              onChange={(v) => v && patch({ levyToolMode: v })}
              allowClear={false}
              ariaLabel="Levy tool cost"
            />
          </Field>
          {value.levyToolMode !== "none" && (
            <MiniField
              label={value.levyToolMode === "flat" ? "Flat Tool Cost (whole order)" : "Tool Cost / Piece"}
            >
              <MoneyField
                aria-label="Levy tool amount"
                value={value.levyToolAmount}
                onChange={(v) => patch({ levyToolAmount: v })}
              />
            </MiniField>
          )}
        </div>
      </SectionCard>

      {/* 4. WEIGHT SELECTION */}
      <SectionCard
        title="Weight Selection"
        inlineHint
        hint="Choose the method, enter the weights, and the loss weight computes live."
      >
        <Field label="Method" labelOnly>
          <Segmented
            options={WEIGHT_METHOD_OPTIONS}
            value={String(value.weightMethod)}
            onChange={(v) => v && patch({ weightMethod: Number(v) as CalcWeightMethod })}
            allowClear={false}
            ariaLabel="Weight method"
          />
        </Field>

        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
          <MiniField label="Block Wt (gms)">
            <NumberInput
              aria-label="Block weight in grams"
              value={value.blockWt}
              onChange={(v) => patch({ blockWt: v })}
              min={0}
              placeholder="0"
            />
          </MiniField>
          <MiniField label="Theoretical Wt (gms)">
            <NumberInput
              aria-label="Theoretical weight in grams"
              value={value.theoreticalWt}
              onChange={(v) => patch({ theoreticalWt: v })}
              min={0}
              placeholder="0"
            />
          </MiniField>
          <MiniField label="Pressing Wt (gms)">
            <NumberInput
              aria-label="Pressing weight in grams"
              value={value.pressingWt}
              onChange={(v) => patch({ pressingWt: v })}
              min={0}
              placeholder="0"
            />
          </MiniField>
          <MiniField label="Total Wt (gms)">
            <NumberInput
              aria-label="Total weight in grams"
              value={value.totalWt}
              onChange={(v) => patch({ totalWt: v })}
              min={0}
              placeholder="0"
            />
          </MiniField>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <MiniField label="Loss % (10–20)" className="w-[160px]">
            <NumberInput
              aria-label="Loss percentage"
              value={value.lossPct}
              onChange={(v) => patch({ lossPct: v })}
              min={0}
              max={20}
              placeholder="15"
            />
          </MiniField>
          <div className="flex flex-col gap-1 pb-1">
            <span className="text-[11px] uppercase tracking-[0.1em] font-bold text-ink-subtle">
              Loss Weight (live)
            </span>
            <span className="tabular-nums text-[15px] font-bold text-ink-strong">
              {out.lossWtGms.toFixed(3)} gms
              <span className="ml-2 text-[12px] font-semibold text-ink-subtle">
                ({(out.effectiveLossPct * 100).toFixed(0)}% applied)
              </span>
            </span>
          </div>
        </div>
      </SectionCard>

      {/* 5. RM + VA */}
      <SectionCard
        title="Raw Material + Value Addition"
        inlineHint
        hint="RM price per kg (Alok decides per batch). VA = 20–40% of RM, or ₹2000/kg — whichever is higher."
      >
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <MiniField label="RM Price / kg">
            <MoneyField
              aria-label="RM price per kg"
              value={value.rmPerKg}
              onChange={(v) => patch({ rmPerKg: v })}
            />
          </MiniField>
          <MiniField label="Batch Details">
            <input
              type="text"
              className="nt-input"
              placeholder="Batch / grade note for RM cost"
              aria-label="Batch details"
              value={value.batchDetails}
              onChange={(e) => patch({ batchDetails: e.target.value })}
            />
          </MiniField>
        </div>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <MiniField label="VA % (20–40)">
            <NumberInput
              aria-label="Value addition percentage"
              value={value.vaPct}
              onChange={(v) => patch({ vaPct: v })}
              min={0}
              max={100}
              placeholder="30"
            />
          </MiniField>
          <MiniField label="VA Floor / kg">
            <MoneyField
              aria-label="VA floor per kg"
              value={value.vaFloorPerKg}
              onChange={(v) => patch({ vaFloorPerKg: v })}
            />
          </MiniField>
        </div>
        <div
          className="inline-flex w-fit items-center gap-2 rounded-chip border px-3 py-1.5 text-[12.5px] font-semibold"
          style={{
            background: "#EEEEFF",
            borderColor: "#c6cbdd",
            color: "var(--color-brand)",
          }}
        >
          VA applied: {formatInr(out.vaPerKg)}/kg
          <span className="text-ink-subtle">
            · {vaFloorWins ? "floor ₹2000/kg wins" : `${numOr(value.vaPct, 0)}% of RM wins`}
          </span>
        </div>
      </SectionCard>

      {/* 5b. SHAPING / FORMING */}
      <SectionCard
        title="Shaping / Forming"
        inlineHint
        hint="Minutes default 0. Rate is compulsory once minutes are entered."
      >
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <MiniField label="Shaping (mins)">
            <NumberInput
              aria-label="Shaping minutes"
              value={value.shapingMins}
              onChange={(v) => patch({ shapingMins: v })}
              min={0}
              placeholder="0"
            />
          </MiniField>
          <MiniField label="Rate / min">
            <MoneyField
              aria-label="Shaping rate per minute"
              value={value.shapingRatePerMin}
              onChange={(v) => patch({ shapingRatePerMin: v })}
              aria-invalid={numOr(value.shapingMins, 0) > 0 && numOrU(value.shapingRatePerMin) === undefined}
            />
          </MiniField>
        </div>
        {numOr(value.shapingMins, 0) > 0 && numOrU(value.shapingRatePerMin) === undefined && (
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--color-red-deep)" }}>
            Shaping rate is required when minutes are entered.
          </p>
        )}
      </SectionCard>

      {/* 5c. MANDRIL */}
      <SectionCard
        title="Mandril"
        inlineHint
        hint="Rate + size, both default 0."
      >
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <MiniField label="Mandril Rate">
            <MoneyField
              aria-label="Mandril rate"
              value={value.mandrilRate}
              onChange={(v) => patch({ mandrilRate: v })}
            />
          </MiniField>
          <MiniField label="Mandril Size">
            <NumberInput
              aria-label="Mandril size"
              value={value.mandrilSize}
              onChange={(v) => patch({ mandrilSize: v })}
              min={0}
              placeholder="0"
            />
          </MiniField>
        </div>
      </SectionCard>

      {/* 5d. OTHER DEVELOPMENT COSTS */}
      <SectionCard
        title="Other Development Costs"
        inlineHint
        hint="Add any number of development lines. Amount = qty × rate; levy as flat / per-piece / none."
      >
        <div ref={devFocus.containerRef} className="flex flex-col gap-4">
          {value.devCosts.length === 0 && (
            <p className="text-[13px] text-ink-subtle">No development costs yet.</p>
          )}
          {value.devCosts.map((row, i) => (
            <div
              key={row.id}
              data-row
              className="flex flex-col gap-4 rounded-section border border-hairline bg-surface-soft p-5"
            >
              <GroupHeader
                n={i + 1}
                label="Development Cost"
                action={<RemoveButton onClick={() => removeDev(row.id)} />}
              />
              <Field label="Description" labelOnly>
                <input
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Special fixture, coating"
                  aria-label="Development cost description"
                  value={row.description}
                  onChange={(e) => setDev(row.id, { description: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
                <MiniField label="Qty">
                  <NumberInput
                    aria-label="Development qty"
                    value={row.qty}
                    onChange={(v) => setDev(row.id, { qty: v })}
                    min={0}
                    placeholder="0"
                  />
                </MiniField>
                <MiniField label="Rate">
                  <MoneyField
                    aria-label="Development rate"
                    value={row.rate}
                    onChange={(v) => setDev(row.id, { rate: v })}
                  />
                </MiniField>
                <MiniField label="Amount (auto)">
                  <MoneyField
                    aria-label="Development amount"
                    value={row.amount}
                    onChange={() => {}}
                    readOnly
                    tabIndex={-1}
                    className="bg-surface-soft"
                  />
                </MiniField>
                <MiniField label="Levy">
                  <Select
                    ariaLabel="Development levy"
                    value={row.levyMode}
                    onValueChange={(v) => setDev(row.id, { levyMode: v as LevyMode })}
                    options={LEVY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  />
                </MiniField>
              </div>
            </div>
          ))}
        </div>
        <AddButton label="+ Add development cost" onClick={addDev} />
      </SectionCard>

      {/* 6. MACHINING */}
      <SectionCard
        title="Machining"
        inlineHint
        hint="Overhead applies to machining only (15–150%). Machining minutes are still pending confirmation with Alok."
      >
        {/* Operations */}
        <div ref={machFocus.containerRef} className="flex flex-col gap-4">
          {value.machiningOps.length === 0 && (
            <p className="text-[13px] text-ink-subtle">
              No machining operations yet. Add operations from the master.
            </p>
          )}
          {value.machiningOps.map((row, i) => (
            <div
              key={row.id}
              data-row
              className="flex flex-col gap-4 rounded-section border border-hairline bg-surface-soft p-5"
            >
              <GroupHeader
                n={i + 1}
                label="Operation"
                action={<RemoveButton onClick={() => removeMachOp(row.id)} />}
              />
              <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                <Field label="Operation" labelOnly>
                  <Select
                    ariaLabel="Machining operation"
                    value={row.optionId}
                    onValueChange={(v) => setMachOp(row.id, { optionId: v })}
                    placeholder={
                      machiningOptions.length === 0 ? "No ops in master" : "Select operation"
                    }
                    disabled={machiningOptions.length === 0}
                    searchable
                    searchPlaceholder="Search operation"
                    options={machiningOptions}
                  />
                </Field>
                <MiniField label="Minutes">
                  <NumberInput
                    aria-label="Operation minutes"
                    value={row.minutes}
                    onChange={(v) => setMachOp(row.id, { minutes: v })}
                    min={0}
                    placeholder="0"
                  />
                </MiniField>
                <MiniField label="Rate / min">
                  <MoneyField
                    aria-label="Operation rate per minute"
                    value={row.rate}
                    onChange={(v) => setMachOp(row.id, { rate: v })}
                  />
                </MiniField>
              </div>
            </div>
          ))}
        </div>
        <AddButton label="+ Add operation" onClick={addMachOp} />

        {/* Rates: internal + external vendors */}
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <MiniField label="Internal Machining Rate / min">
            <MoneyField
              aria-label="Internal machining rate per minute"
              value={value.internalMachiningRate}
              onChange={(v) => patch({ internalMachiningRate: v })}
            />
          </MiniField>
          <MiniField label="Total Machining Minutes">
            <ReadonlyValue value={`${totalMachiningMins} min`} />
          </MiniField>
        </div>

        <div ref={vendFocus.containerRef} className="flex flex-col gap-3">
          <span className="text-[12px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
            External Machining Vendors (up to {MAX_EXTERNAL_VENDORS})
          </span>
          {value.externalVendors.length === 0 && (
            <p className="text-[13px] text-ink-subtle">No external vendor rates.</p>
          )}
          {value.externalVendors.map((row, i) => (
            <div
              key={row.id}
              data-row
              className="grid grid-cols-[2fr_1fr_auto] items-end gap-3 max-md:grid-cols-1"
            >
              <Field label={`Vendor ${i + 1}`} labelOnly>
                <Select
                  ariaLabel={`External machining vendor ${i + 1}`}
                  value={row.vendorId}
                  onValueChange={(v) => setVendor(row.id, { vendorId: v })}
                  placeholder={
                    vendorSelectOptions.length === 0 ? "No vendors" : "Select vendor"
                  }
                  disabled={vendorSelectOptions.length === 0}
                  searchable
                  searchPlaceholder="Search vendor"
                  options={vendorSelectOptions}
                />
              </Field>
              <MiniField label="Rate / min">
                <MoneyField
                  aria-label={`External vendor ${i + 1} rate per minute`}
                  value={row.rate}
                  onChange={(v) => setVendor(row.id, { rate: v })}
                />
              </MiniField>
              <div className="pb-1">
                <RemoveButton onClick={() => removeVendor(row.id)} />
              </div>
            </div>
          ))}
          {value.externalVendors.length < MAX_EXTERNAL_VENDORS && (
            <AddButton label="+ Add external vendor" onClick={addVendor} />
          )}
        </div>

        {/* Decide which + overhead */}
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label="Decide Which Rate Applies" labelOnly>
            <Select
              ariaLabel="Machining rate source"
              value={value.machiningChoice}
              onValueChange={(v) => patch({ machiningChoice: v })}
              options={rateSourceOptions}
            />
          </Field>
          <MiniField label="Overhead % (15–150)">
            <NumberInput
              aria-label="Overhead percentage"
              value={value.overheadPct}
              onChange={(v) => patch({ overheadPct: v })}
              min={0}
              max={150}
              placeholder="25"
            />
          </MiniField>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px]">
          <span className="font-semibold text-ink-muted">
            Decided machining base:{" "}
            <span className="tabular-nums font-bold text-ink-strong">{formatInr(machiningBase)}/pc</span>
          </span>
          <span className="font-semibold text-ink-muted">
            With overhead:{" "}
            <span className="tabular-nums font-bold text-ink-strong">
              {formatInr(out.machiningWithOverhead)}/pc
            </span>
          </span>
        </div>
      </SectionCard>

      {/* 7. NEGOTIATION */}
      <SectionCard
        title="Negotiation"
        inlineHint
        hint="Manual negotiation buffer applied to the running total."
      >
        <MiniField label="Negotiation % (manual)" className="w-[180px]">
          <NumberInput
            aria-label="Negotiation percentage"
            value={value.negotiationPct}
            onChange={(v) => patch({ negotiationPct: v })}
            min={0}
            max={100}
            placeholder="3"
          />
        </MiniField>
      </SectionCard>
    </div>
  );
}

// ── output card ───────────────────────────────────────────────────────────────

/** One labelled output cell. */
function Out({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.1em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="tabular-nums text-[14px] font-semibold text-ink-strong">{value}</span>
    </div>
  );
}

/**
 * The prominent live output — every engine intermediate from §6, recomputing on
 * each keystroke, plus the separately-levied captured add-ons (tool/mandril/dev)
 * which the current engine does not fold into its quote.
 */
function OutputCard({
  out,
  qty,
  addOnPerPiece,
  quoteInclPerPiece,
  quoteInclValue,
  toolLevyPerPiece,
  mandrilPerPiece,
  devPerPiece,
}: {
  out: ManufacturingCostOutput;
  qty: number;
  addOnPerPiece: number;
  quoteInclPerPiece: number;
  quoteInclValue: number;
  toolLevyPerPiece: number;
  mandrilPerPiece: number;
  devPerPiece: number;
}) {
  return (
    <section
      className="rounded-section border-2 p-6"
      style={{
        background: "linear-gradient(135deg, #F8F7FF 0%, #EEEEFF 100%)",
        borderColor: "var(--color-brand)",
        boxShadow: "0 4px 24px -8px rgba(63,63,148,0.18)",
      }}
    >
      <p
        className="mb-4 text-[11px] uppercase tracking-[0.16em] font-bold"
        style={{ color: "var(--color-brand)" }}
      >
        Live Manufacturing Estimate
      </p>

      {/* weight + material row */}
      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-3">
        <Out label="Base Wt / pc" value={`${out.baseWeightGms.toFixed(3)} g`} />
        <Out label="Loss Wt / pc" value={`${out.lossWtGms.toFixed(3)} g`} />
        <Out label="Chosen Wt / pc" value={`${out.chosenWeight.toFixed(3)} g`} />
        <Out label="Total Wt" value={`${out.totalWtKg.toFixed(3)} kg`} />
        <Out label="RM / gm" value={perGm(out.rmPerGm)} />
        <Out label="VA / gm" value={perGm(out.vaPerGm)} />
      </div>

      {/* engine cost chain */}
      <div
        className="flex flex-wrap gap-x-8 gap-y-3 pt-4"
        style={{ borderTop: "1px solid rgba(63,63,148,0.18)" }}
      >
        <Out label="Sintered / gm (Ratio)" value={perGm(out.sinteredCostPerGm)} />
        <Out label="Sintered / pc" value={formatInr(out.sinteredPricePerPiece)} />
        <Out label="+ Shaping" value={formatInr(out.shapingCostPerPiece)} />
        <Out label="Sintered + Shaping" value={formatInr(out.sinteredPlusShaping)} />
        <Out label="+ Machining (OH)" value={formatInr(out.machiningWithOverhead)} />
        <Out label="Cost After Machining" value={formatInr(out.costAfterMachining)} />
        <Out label="Negotiation" value={formatInr(out.negotiationAmount)} />
      </div>

      {/* headline quote */}
      <div
        className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-3 pt-4"
        style={{ borderTop: "1px solid rgba(63,63,148,0.18)" }}
      >
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[11px] uppercase tracking-[0.12em] font-bold"
            style={{ color: "var(--color-brand)" }}
          >
            Quote Price / pc
          </span>
          <span
            className="tabular-nums font-black"
            style={{ fontSize: 32, lineHeight: 1, color: "var(--color-brand)" }}
          >
            {formatInr(out.quotePricePerPiece)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
            Quote Value (×{qty} pcs)
          </span>
          <span className="tabular-nums text-[22px] font-bold text-ink-strong">
            {formatInr(out.quoteValue)}
          </span>
        </div>
      </div>

      {/* captured add-ons — levied separately (not in the engine quote) */}
      {addOnPerPiece > 0 && (
        <div
          className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 pt-4"
          style={{ borderTop: "1px dashed rgba(63,63,148,0.28)" }}
        >
          <Out label="Tool Levy / pc" value={formatInr(toolLevyPerPiece)} />
          <Out label="Mandril / pc" value={formatInr(mandrilPerPiece)} />
          <Out label="Dev Costs / pc" value={formatInr(devPerPiece)} />
          <Out label="Quote incl. add-ons / pc" value={formatInr(quoteInclPerPiece)} />
          <Out label="Quote Value incl. add-ons" value={formatInr(quoteInclValue)} />
        </div>
      )}
    </section>
  );
}

// ── small buttons ─────────────────────────────────────────────────────────────

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-chip border border-brand bg-brand/8 px-4 py-2.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/12"
      >
        {label}
      </button>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong"
    >
      <Trash2 size={13} strokeWidth={2.4} />
      Remove
    </button>
  );
}
