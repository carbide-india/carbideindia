"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, TriangleAlert, FlaskConical, Lock } from "lucide-react";
import type { SecondaryFeasibilityState } from "@/lib/queries/feasibility";
import type { MasterOptionItem } from "@/lib/queries/masters";
import { saveSecondaryFeasibility } from "@/app/(app)/feasibility/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { MiniField, Segmented } from "@/components/inquiries/form-field";

/**
 * Per-product-line "Secondary / Technical Feasibility" card — the detailed
 * technical-spec stage that sits BETWEEN Primary Feasibility (the 5-check review
 * + Lock Dimensions) and Confirm. Captures confirmed dimensions with per-dim
 * tolerances (only the dims that carry a value get a ± box, mirroring the
 * shape-aware hide), weights (Block / Net / Material), internal production grade
 * + condition, manufacturability (process route + tooling/material availability)
 * and a technical verdict + notes. "Mark Secondary Feasibility Done" stamps the
 * line (who/when) and unlocks the Confirm step — before that an amber hint says
 * Confirm is blocked (matches the server gate in lockItemDimensions).
 */

/* ── Option lists ──────────────────────────────────────────────────────── */
const AVAILABILITY_OPTS = [
  { value: "available", label: "Available" },
  { value: "to_be_made", label: "To Be Made" },
  { value: "to_procure", label: "To Procure" },
  { value: "na", label: "N/A" },
];

const VERDICT_OPTS = [
  { value: "feasible", label: "Feasible" },
  { value: "not_feasible", label: "Not Feasible" },
  { value: "needs_info", label: "Needs Info" },
] as const;
type Verdict = (typeof VERDICT_OPTS)[number]["value"];

/* Dimension rows, in sheet order. Only rows whose value is non-empty render. */
const DIM_DEFS = [
  { key: "outerDia", tolKey: "outerDiaTol", label: "Outer Dia" },
  { key: "innerDia", tolKey: "innerDiaTol", label: "Inner Dia" },
  { key: "length", tolKey: "lengthTol", label: "Length" },
  { key: "width", tolKey: "widthTol", label: "Width" },
  { key: "thickness", tolKey: "thicknessTol", label: "Thickness" },
] as const;

function fmtWhen(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface FormState {
  outerDiaTol: string;
  innerDiaTol: string;
  lengthTol: string;
  widthTol: string;
  thicknessTol: string;
  secBlockWt: string;
  secNetWt: string;
  secMaterialWt: string;
  gradeInternalProductionId: string;
  conditionId: string;
  secProcessRoute: string;
  secToolingAvailability: string;
  secMaterialAvailability: string;
  secVerdict: string;
  secNotes: string;
}

function initialState(line: SecondaryFeasibilityState): FormState {
  return {
    outerDiaTol: line.outerDiaTol ?? "",
    innerDiaTol: line.innerDiaTol ?? "",
    lengthTol: line.lengthTol ?? "",
    widthTol: line.widthTol ?? "",
    thicknessTol: line.thicknessTol ?? "",
    secBlockWt: line.secBlockWt ?? "",
    secNetWt: line.secNetWt ?? "",
    secMaterialWt: line.secMaterialWt ?? "",
    gradeInternalProductionId: line.gradeInternalProductionId ?? "",
    conditionId: line.conditionId ?? "",
    secProcessRoute: line.secProcessRoute ?? "",
    secToolingAvailability: line.secToolingAvailability ?? "",
    secMaterialAvailability: line.secMaterialAvailability ?? "",
    secVerdict: line.secVerdict ?? "",
    secNotes: line.secNotes ?? "",
  };
}

/** Trim → value or null (so a cleared box nulls the column). */
const orNull = (s: string): string | null => {
  const t = s.trim();
  return t === "" ? null : t;
};

export function SecondaryFeasibilitySection({
  line,
  lineNumber,
  gradeOptions,
  conditionOptions,
}: {
  line: SecondaryFeasibilityState;
  lineNumber: number;
  gradeOptions: MasterOptionItem[];
  conditionOptions: MasterOptionItem[];
}) {
  const router = useRouter();
  const [state, setState] = React.useState<FormState>(() => initialState(line));
  const [pending, setPending] = React.useState<false | "save" | "done">(false);

  const done = line.secondaryFeasibilityDone;
  const locked = line.feasibilityConfirmed; // a confirmed line's specs are frozen
  const readOnly = locked;

  const title = line.custProductName?.trim() || `Product line ${lineNumber}`;
  const unit = line.dimensionUnit ?? "mm";

  const gradeOpts = React.useMemo(
    () => gradeOptions.map((o) => ({ value: o.id, label: o.name })),
    [gradeOptions],
  );
  const conditionOpts = React.useMemo(
    () => conditionOptions.map((o) => ({ value: o.id, label: o.name })),
    [conditionOptions],
  );

  // Only dims that carry a value on the line get a ± tolerance box (shape-aware).
  const activeDims = React.useMemo(
    () =>
      DIM_DEFS.map((d) => ({ ...d, value: (line[d.key] ?? "").toString().trim() })).filter(
        (d) => d.value !== "",
      ),
    [line],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  function buildPayload(markDone: boolean) {
    return {
      inquiryItemId: line.inquiryItemId,
      outerDiaTol: orNull(state.outerDiaTol),
      innerDiaTol: orNull(state.innerDiaTol),
      lengthTol: orNull(state.lengthTol),
      widthTol: orNull(state.widthTol),
      thicknessTol: orNull(state.thicknessTol),
      secBlockWt: orNull(state.secBlockWt),
      secNetWt: orNull(state.secNetWt),
      secMaterialWt: orNull(state.secMaterialWt),
      gradeInternalProductionId: state.gradeInternalProductionId || null,
      conditionId: state.conditionId || null,
      secProcessRoute: orNull(state.secProcessRoute),
      secToolingAvailability: state.secToolingAvailability || null,
      secMaterialAvailability: state.secMaterialAvailability || null,
      secVerdict: state.secVerdict || null,
      secNotes: orNull(state.secNotes),
      markDone,
    };
  }

  async function run(markDone: boolean) {
    if (readOnly) return;
    if (markDone && state.secVerdict === "") {
      fireToast({ type: "error", message: "Set a technical verdict before marking done." });
      return;
    }
    if (
      markDone &&
      !window.confirm(
        "Mark Secondary / Technical Feasibility as done for this line? This unlocks the Confirm step.",
      )
    ) {
      return;
    }
    setPending(markDone ? "done" : "save");
    try {
      const res = await saveSecondaryFeasibility(buildPayload(markDone));
      if (res.ok) {
        fireToast({
          message: markDone ? "Secondary Feasibility marked done." : "Secondary Feasibility saved.",
        });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border-2 ${
        done ? "border-[#bfe3c9] bg-[#f2fbf5]" : "border-[#b7bcd2] bg-surface-card"
      }`}
    >
      {/* Header: identity + done/blocked state */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-[#e2e4f0] px-4 py-3">
        <span className="grid h-[24px] min-w-[24px] shrink-0 place-items-center rounded-full bg-[#ececf7] px-1.5 text-[12px] font-black tabular-nums text-[#3f3f94]">
          {lineNumber}
        </span>
        <span className="text-[15px] font-extrabold tracking-tight text-ink-strong">{title}</span>
        {line.gradeCustomer && (
          <span className="text-[12px] font-semibold text-ink-subtle">Grade {line.gradeCustomer}</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {done ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16a34a] px-2.5 py-1 text-[11.5px] font-black uppercase tracking-[0.08em] text-white">
                <ShieldCheck size={13} strokeWidth={2.6} />
                Secondary Feasibility done
              </span>
              <span className="text-[12px] font-semibold text-ink-soft">
                {line.secondaryByName ? `by ${line.secondaryByName}` : ""}
                {fmtWhen(line.secondaryFeasibilityAt) && (
                  <span className="text-ink-subtle"> · {fmtWhen(line.secondaryFeasibilityAt)}</span>
                )}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#b45309]">
              <TriangleAlert size={14} strokeWidth={2.4} />
              Confirm is blocked until Secondary Feasibility is complete.
            </span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-subtle">
              <Lock size={12} strokeWidth={2.4} /> Confirmed — read only
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {/* ── Confirmed dimensions + per-dim tolerances + weights ───────────
            Each dim gets its own value box + ± tol box, and the three weights
            follow — all on ONE flex-wrap line (equal-width, wraps on narrow
            screens) so nothing gets cramped/clipped. */}
        <div>
          <SubHead icon={<FlaskConical size={13} strokeWidth={2.4} />} label="Confirmed Dimensions, Tolerances & Weights" />
          <div className="flex flex-wrap items-end gap-2.5">
            {activeDims.map((d) => (
              <React.Fragment key={d.key}>
                <div className="min-w-[80px] flex-1">
                  <MiniField label={`${d.label} (${unit})`}>
                    <span className="nt-input flex w-full items-center bg-[#f4f5fb] tabular-nums text-ink-strong">
                      {d.value}
                    </span>
                  </MiniField>
                </div>
                <div className="min-w-[76px] flex-1">
                  <MiniField label="± Tol">
                    <input
                      className="nt-input w-full tabular-nums"
                      inputMode="decimal"
                      placeholder="Tol"
                      aria-label={`${d.label} tolerance`}
                      disabled={readOnly}
                      value={state[d.tolKey]}
                      onChange={(e) => set(d.tolKey, e.target.value)}
                    />
                  </MiniField>
                </div>
              </React.Fragment>
            ))}
            <div className="min-w-[92px] flex-1">
              <MiniField label="Block Wt (g)">
                <input
                  className="nt-input w-full tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Block weight"
                  disabled={readOnly}
                  value={state.secBlockWt}
                  onChange={(e) => set("secBlockWt", e.target.value)}
                />
              </MiniField>
            </div>
            <div className="min-w-[92px] flex-1">
              <MiniField label="Net Wt (g)">
                <input
                  className="nt-input w-full tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Net weight"
                  disabled={readOnly}
                  value={state.secNetWt}
                  onChange={(e) => set("secNetWt", e.target.value)}
                />
              </MiniField>
            </div>
            <div className="min-w-[92px] flex-1">
              <MiniField label="Material Wt (g)">
                <input
                  className="nt-input w-full tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label="Material weight"
                  disabled={readOnly}
                  value={state.secMaterialWt}
                  onChange={(e) => set("secMaterialWt", e.target.value)}
                />
              </MiniField>
            </div>
          </div>
          {activeDims.length === 0 && (
            <p className="mt-1.5 text-[12.5px] text-ink-subtle">No dimensions captured on this line — weights only.</p>
          )}
        </div>

        {/* ── Grade / Condition ─────────────────────────────────────────── */}
        <div>
          <SubHead label="Production Grade & Condition" />
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <MiniField label="Internal Production Grade">
              <Select
                value={state.gradeInternalProductionId}
                onValueChange={(v) => !readOnly && set("gradeInternalProductionId", v)}
                placeholder="Select grade"
                options={gradeOpts}
                disabled={readOnly}
                ariaLabel="Internal production grade"
              />
            </MiniField>
            <MiniField label="Condition / Finish">
              <Select
                value={state.conditionId}
                onValueChange={(v) => !readOnly && set("conditionId", v)}
                placeholder="Select condition"
                options={conditionOpts}
                disabled={readOnly}
                ariaLabel="Condition / finish"
              />
            </MiniField>
          </div>
        </div>

        {/* ── Manufacturability ─────────────────────────────────────────── */}
        <div>
          <SubHead label="Manufacturability" />
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <MiniField label="Process Route">
              <input
                className="nt-input"
                placeholder="e.g. Press → Sinter → Grind"
                aria-label="Process route"
                disabled={readOnly}
                value={state.secProcessRoute}
                onChange={(e) => set("secProcessRoute", e.target.value)}
              />
            </MiniField>
            <MiniField label="Tooling Availability">
              <Select
                value={state.secToolingAvailability}
                onValueChange={(v) => !readOnly && set("secToolingAvailability", v)}
                placeholder="Select"
                options={AVAILABILITY_OPTS}
                disabled={readOnly}
                ariaLabel="Tooling availability"
              />
            </MiniField>
            <MiniField label="Material Availability">
              <Select
                value={state.secMaterialAvailability}
                onValueChange={(v) => !readOnly && set("secMaterialAvailability", v)}
                placeholder="Select"
                options={AVAILABILITY_OPTS}
                disabled={readOnly}
                ariaLabel="Material availability"
              />
            </MiniField>
          </div>
        </div>

        {/* ── Technical Verdict + notes ─────────────────────────────────── */}
        <div>
          <SubHead label="Technical Verdict" />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 max-md:grid-cols-1">
            <MiniField label="Verdict">
              <Segmented<Verdict>
                size="lg"
                allowClear={false}
                options={VERDICT_OPTS}
                value={(state.secVerdict || undefined) as Verdict | undefined}
                onChange={(v) => !readOnly && set("secVerdict", v ?? "")}
                ariaLabel="Technical verdict"
              />
            </MiniField>
            <MiniField label="Technical Notes">
              <NotesField
                rows={2}
                placeholder="Technical remarks, assumptions, risks"
                ariaLabel="Technical notes"
                value={state.secNotes}
                onChange={(v) => !readOnly && set("secNotes", v)}
              />
            </MiniField>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={() => void run(false)}
              disabled={pending !== false}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-[#c7cae6] px-4 py-2 text-[13.5px] font-bold text-[#3f3f94] transition-colors hover:border-brand hover:bg-[#f3f3fb] disabled:opacity-50"
            >
              {pending === "save" && (
                <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
              )}
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => void run(true)}
              disabled={pending !== false}
              className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-extrabold text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #16a34a, #12813b)" }}
            >
              {pending === "done" ? (
                <Loader2 size={15} style={{ animation: "spinFast 0.8s linear infinite" }} />
              ) : (
                <ShieldCheck size={16} strokeWidth={2.4} />
              )}
              {done ? "Re-save & Keep Done" : "Mark Secondary Feasibility Done"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubHead({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5">
      {icon && <span className="text-[#3f3f94]">{icon}</span>}
      <span className="text-[11.5px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">{label}</span>
    </div>
  );
}
