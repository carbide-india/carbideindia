"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader2, Lock } from "lucide-react";
import {
  CHECK_STATES,
  CHECK_STATE_LABELS,
  DOC_GIVEN_OPTIONS,
  INQUIRY_SHAPES,
  QUANTITY_UOMS,
} from "@/db/enums";
import type { Inquiry } from "@/db/schema";
import type { InquiryProductCard } from "@/lib/queries/sm-workspace";
import type { SecondaryFeasibilityState } from "@/lib/queries/feasibility";
import type { MasterOptionItem } from "@/lib/queries/masters";
import type { ShapeProfiles } from "@/lib/queries/masters";
import { DIM_LABELS, defaultShapeConfig, visibleDims, type DimField } from "@/lib/masters/shape-config";
import { saveSecondaryProductDetails } from "@/app/(app)/secondary-feasibility/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { cn } from "@/lib/utils";
import {
  Band,
  Cell,
  EnquiryCustomerBand,
  GRID_CLASS,
  LinksNotesBand,
  dash,
} from "@/components/feasibility/snapshot-primitives";

/**
 * The Secondary review's enquiry panel — the same snapshot the Primary review
 * shows, except the two product bands are EDITABLE here:
 *
 *   • Product & Quantity          → the enquiry row
 *   • Enquiry Checks              → the enquiry row
 *   • Dimensions & Specification  → the first product line (which re-syncs to
 *                                   the Item Master) + the enquiry's mirror
 *
 * Edits autosave ~700 ms after the last keystroke, like the Secondary cards
 * below. The spec band goes read-only once the line's dimensions are locked /
 * its feasibility is confirmed — the frozen PF baseline must stay frozen.
 *
 * "Condition" stays read-only here on purpose: the Secondary / Technical card
 * below owns that column ("Condition / Finish"), and two autosaving editors on
 * one column would race and clobber each other.
 */

const CHECK_OPTS = CHECK_STATES.map((s) => ({ value: s, label: CHECK_STATE_LABELS[s] }));
const SHAPE_OPTS = INQUIRY_SHAPES.map((s) => ({ value: s, label: s }));
const UOM_OPTS = QUANTITY_UOMS.map((u) => ({ value: u, label: u }));
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** The four enquiry-form checks, in sheet order. */
const ENQUIRY_CHECKS = [
  { key: "shapeDimensionCheck", label: "Shape & Dimension Check" },
  { key: "gradeCheck", label: "Grade (Customer) Check" },
  { key: "toleranceCheck", label: "Tolerance Check" },
  { key: "conditionCheck", label: "Condition Check" },
] as const;

/** DB numerics arrive as "12.00" — show them the way a person typed them. */
function numText(v: string | number | null | undefined): string {
  if (v == null || String(v).trim() === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

interface FormState {
  productDescription: string;
  quantityStatus: string;
  quantityNos: string;
  quantityUom: string;
  sampleReceived: "" | "yes" | "no";
  docsGiven: string[];
  shapeDimensionCheck: string;
  gradeCheck: string;
  toleranceCheck: string;
  conditionCheck: string;
  shape: string;
  outerDia: string;
  innerDia: string;
  length: string;
  width: string;
  thickness: string;
  gradeCustomer: string;
  toleranceId: string;
  dimensionNotes: string;
}

function initialState(
  inquiry: Inquiry,
  line: SecondaryFeasibilityState | null,
  product: InquiryProductCard | null,
): FormState {
  const pick = (
    lineVal: string | null | undefined,
    productVal: string | null | undefined,
    inquiryVal: string | null | undefined,
  ) => numText(lineVal ?? productVal ?? inquiryVal);
  return {
    productDescription: inquiry.productDescription ?? "",
    quantityStatus: inquiry.quantityStatus ?? "",
    quantityNos: numText(inquiry.quantityNos),
    quantityUom: inquiry.quantityUom ?? "",
    sampleReceived: inquiry.sampleReceived == null ? "" : inquiry.sampleReceived ? "yes" : "no",
    docsGiven: (inquiry.docsGiven ?? []) as string[],
    shapeDimensionCheck: inquiry.shapeDimensionCheck ?? "",
    gradeCheck: inquiry.gradeCheck ?? "",
    toleranceCheck: inquiry.toleranceCheck ?? "",
    conditionCheck: inquiry.conditionCheck ?? "",
    shape: line?.shape ?? product?.shapeName ?? inquiry.shape ?? "",
    outerDia: pick(line?.outerDia, product?.outerDia, inquiry.outerDia),
    innerDia: pick(line?.innerDia, product?.innerDia, inquiry.innerDia),
    length: pick(line?.length, product?.length, inquiry.length),
    width: pick(line?.width, product?.width, inquiry.width),
    thickness: pick(line?.thickness, product?.thickness, inquiry.thickness),
    gradeCustomer: line?.gradeCustomer ?? product?.gradeCustomer ?? "",
    toleranceId: line?.toleranceId ?? inquiry.toleranceId ?? "",
    dimensionNotes: product?.dimensionNotes ?? inquiry.dimensionNotes ?? "",
  };
}

export function SecondaryProductDetailsPanel({
  inquiry,
  product,
  line,
  lineCount,
  specLocked,
  toleranceOptions,
  shapeProfiles,
}: {
  inquiry: Inquiry;
  /** First product line as read through the Item Master (display fallback). */
  product: InquiryProductCard | null;
  /** First product line's own spec (the source of truth for the edit). */
  line: SecondaryFeasibilityState | null;
  lineCount: number;
  /** Line 1's dimensions are locked / its feasibility confirmed → spec frozen. */
  specLocked: boolean;
  toleranceOptions: MasterOptionItem[];
  shapeProfiles: ShapeProfiles;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<FormState>(() => initialState(inquiry, line, product));
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");

  const unit = line?.dimensionUnit ?? "mm";
  const tolOpts = React.useMemo(
    () => toleranceOptions.map((o) => ({ value: o.id, label: o.name })),
    [toleranceOptions],
  );

  // Which dimension boxes apply to the chosen shape (data-driven from the Shape
  // master). An unknown/blank shape falls back to all-five-optional so nothing
  // a reviewer needs to correct is ever hidden.
  const dims: DimField[] = React.useMemo(() => {
    const cfg = (state.shape && shapeProfiles.byName[state.shape]) || defaultShapeConfig();
    return visibleDims(cfg);
  }, [state.shape, shapeProfiles]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const buildPayload = React.useCallback(
    (s: FormState) => ({
      productDescription: s.productDescription,
      quantityStatus: s.quantityStatus,
      quantityNos: s.quantityNos,
      quantityUom: s.quantityUom,
      sampleReceived: s.sampleReceived === "" ? null : s.sampleReceived === "yes",
      docsGiven: s.docsGiven.filter((d): d is (typeof DOC_GIVEN_OPTIONS)[number] =>
        (DOC_GIVEN_OPTIONS as readonly string[]).includes(d),
      ),
      shapeDimensionCheck: s.shapeDimensionCheck,
      gradeCheck: s.gradeCheck,
      toleranceCheck: s.toleranceCheck,
      conditionCheck: s.conditionCheck,
      ...(specLocked
        ? {}
        : {
            shape: s.shape,
            outerDia: s.outerDia,
            innerDia: s.innerDia,
            length: s.length,
            width: s.width,
            thickness: s.thickness,
            gradeCustomer: s.gradeCustomer,
            toleranceId: s.toleranceId,
            dimensionNotes: s.dimensionNotes,
          }),
    }),
    [specLocked],
  );

  const save = React.useCallback(async () => {
    setSaveState("saving");
    const res = await saveSecondaryProductDetails(inquiry.id, buildPayload(state));
    setSaveState(res.ok ? "saved" : "error");
    if (!res.ok) fireToast({ type: "error", message: res.error });
    else router.refresh();
  }, [inquiry.id, state, buildPayload, router]);

  // Debounced autosave (skips the mount pass; StrictMode-safe via the ref).
  const lastSavedSig = React.useRef<string | null>(null);
  React.useEffect(() => {
    const sig = JSON.stringify(buildPayload(state));
    if (lastSavedSig.current === null) {
      lastSavedSig.current = sig;
      return;
    }
    if (sig === lastSavedSig.current) return;
    const t = setTimeout(() => {
      lastSavedSig.current = sig;
      void save();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const savePill =
    saveState === "saving" ? (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-soft">
        <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} /> Saving…
      </span>
    ) : saveState === "saved" ? (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#16a34a]">
        <CircleCheck size={13} /> All changes saved
      </span>
    ) : saveState === "error" ? (
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-pill border border-[#f0b4b4] bg-[#fdeeee] px-2.5 py-1 text-[11.5px] font-bold text-[#d32f2f]"
      >
        Save failed — retry
      </button>
    ) : (
      <span className="text-[11.5px] font-semibold text-ink-subtle">Changes save automatically</span>
    );

  return (
    <div className="overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
      <EnquiryCustomerBand inquiry={inquiry} />

      {/* ── Product & Quantity — editable ─────────────────────────────────── */}
      <Band title="Product & Quantity" action={savePill} />
      <div className="grid grid-cols-2 divide-x divide-y divide-[#c6cbdd] sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <EditCell label="Product Description (Detailed Note)">
            <NotesField
              rows={2}
              placeholder="What the customer asked for"
              ariaLabel="Product description"
              value={state.productDescription}
              onChange={(v) => set("productDescription", v)}
            />
          </EditCell>
        </div>
        <EditCell label="Quantity Status">
          <Select
            value={state.quantityStatus}
            onValueChange={(v) => set("quantityStatus", v)}
            placeholder="Select"
            options={CHECK_OPTS}
            ariaLabel="Quantity status"
          />
        </EditCell>
        <EditCell label="Quantity (Nos)">
          <input
            className="nt-input w-full tabular-nums"
            inputMode="decimal"
            placeholder="0"
            aria-label="Quantity in numbers"
            value={state.quantityNos}
            onChange={(e) => set("quantityNos", e.target.value)}
          />
        </EditCell>
        <EditCell label="Quantity (UOM)">
          <Select
            value={state.quantityUom}
            onValueChange={(v) => set("quantityUom", v)}
            placeholder="Select"
            options={UOM_OPTS}
            ariaLabel="Quantity unit of measure"
          />
        </EditCell>
        <EditCell label="Sample Received">
          <div className="flex flex-wrap gap-1.5">
            {YES_NO.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                checked={state.sampleReceived === o.value}
                onClick={() =>
                  set(
                    "sampleReceived",
                    state.sampleReceived === o.value ? "" : (o.value as "yes" | "no"),
                  )
                }
              />
            ))}
          </div>
        </EditCell>
        <div className="col-span-full">
          <EditCell label="Docs Given">
            <div className="flex flex-wrap gap-1.5">
              {DOC_GIVEN_OPTIONS.map((opt) => {
                const checked = state.docsGiven.includes(opt);
                return (
                  <Chip
                    key={opt}
                    label={opt}
                    checked={checked}
                    onClick={() =>
                      set(
                        "docsGiven",
                        checked
                          ? state.docsGiven.filter((d) => d !== opt)
                          : [...state.docsGiven, opt],
                      )
                    }
                  />
                );
              })}
            </div>
          </EditCell>
        </div>
      </div>

      {/* ── Enquiry Checks — editable (Given / Not Given / Assumed) ───────── */}
      <Band title="Enquiry Checks (from the enquiry form)" />
      <div className={GRID_CLASS}>
        {ENQUIRY_CHECKS.map((c) => (
          <EditCell key={c.key} label={c.label}>
            <Select
              value={state[c.key]}
              onValueChange={(v) => set(c.key, v)}
              placeholder="Select"
              options={CHECK_OPTS}
              ariaLabel={c.label}
            />
          </EditCell>
        ))}
      </div>

      {/* ── Dimensions & Specification — editable (unless the line is locked) ── */}
      <Band
        title="Dimensions & Specification"
        action={
          specLocked ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-subtle">
              <Lock size={12} strokeWidth={2.4} /> Locked by Confirm — read only
            </span>
          ) : lineCount > 1 ? (
            <span className="text-[11.5px] font-semibold text-ink-subtle">
              Editing product line 1 of {lineCount}
            </span>
          ) : undefined
        }
      />
      {specLocked ? (
        <div className="flex flex-col divide-y divide-[#c6cbdd] lg:flex-row lg:divide-x lg:divide-y-0">
          <ReadCell label="Shape" value={dash(state.shape)} />
          {dims.map((d) => (
            <ReadCell
              key={d}
              label={`${DIM_LABELS[d]} (${unit})`}
              value={dash(state[d] === "" ? null : state[d])}
            />
          ))}
          <ReadCell label="Grade (Customer)" value={dash(state.gradeCustomer)} />
          <ReadCell label="Tolerance" value={dash(product?.toleranceName)} />
          <ReadCell label="Condition" value={dash(product?.conditionName)} />
          <ReadCell label="Dimension Notes" value={dash(state.dimensionNotes)} />
        </div>
      ) : (
        // Wrapping flex with per-cell minimums: labels never wrap mid-word and a
        // Tolerance/Shape name is never clipped — cells drop to the next line
        // instead of squeezing when the viewport is narrow.
        <div className="flex flex-wrap">
          <SpecCell width="min-w-[148px] flex-[1.3]">
            <EditCell label="Shape">
              <Select
                value={state.shape}
                onValueChange={(v) => set("shape", v)}
                placeholder="Select shape"
                options={SHAPE_OPTS}
                ariaLabel="Shape"
              />
            </EditCell>
          </SpecCell>
          {dims.map((d) => (
            <SpecCell key={d} width="min-w-[118px] flex-1">
              <EditCell label={`${DIM_LABELS[d]} (${unit})`}>
                <input
                  className="nt-input w-full tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={DIM_LABELS[d]}
                  value={state[d]}
                  onChange={(e) => set(d, e.target.value)}
                />
              </EditCell>
            </SpecCell>
          ))}
          <SpecCell width="min-w-[150px] flex-[1.3]">
            <EditCell label="Grade (Customer)">
              <input
                className="nt-input w-full"
                placeholder="Customer grade"
                aria-label="Customer grade"
                value={state.gradeCustomer}
                onChange={(e) => set("gradeCustomer", e.target.value)}
              />
            </EditCell>
          </SpecCell>
          <SpecCell width="min-w-[172px] flex-[1.5]">
            <EditCell label="Tolerance">
              <Select
                value={state.toleranceId}
                onValueChange={(v) => set("toleranceId", v)}
                placeholder="Select"
                options={tolOpts}
                ariaLabel="Tolerance"
              />
            </EditCell>
          </SpecCell>
          <SpecCell width="min-w-[150px] flex-[1.3]">
            <Cell
              label="Condition"
              value={
                <>
                  {dash(product?.conditionName)}
                  <span className="mt-1 block text-[10.5px] font-semibold leading-tight text-ink-subtle">
                    Edited as “Condition / Finish” below
                  </span>
                </>
              }
            />
          </SpecCell>
          {/* Dimension Notes rides the SAME wrapping row — it sits beside
              Condition instead of claiming a full-width line of its own. */}
          <SpecCell width="min-w-[260px] flex-[2.6]">
            <EditCell label="Dimension Notes">
              <NotesField
                rows={2}
                placeholder="Drawing notes, datums, special features"
                ariaLabel="Dimension notes"
                value={state.dimensionNotes}
                onChange={(v) => set("dimensionNotes", v)}
              />
            </EditCell>
          </SpecCell>
        </div>
      )}

      <LinksNotesBand inquiry={inquiry} />
    </div>
  );
}

/** A cell whose value is an input — same box metrics as the read-only `Cell`. */
function EditCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-1.5 px-4 py-3">
      <span className="whitespace-nowrap text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">
        {label}
      </span>
      {children}
    </div>
  );
}

/** One cell of the wrapping spec row — carries its own hairlines (the row wraps,
 *  so `divide-x` can't be used) and a per-field minimum width. */
function SpecCell({ width, children }: { width: string; children: React.ReactNode }) {
  return <div className={cn("border-b border-r border-[#c6cbdd]", width)}>{children}</div>;
}

/** Read-only cell inside the flex dimension row (keeps the equal-width sizing). */
function ReadCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="lg:min-w-0 lg:flex-1">
      <Cell label={label} value={value} />
    </div>
  );
}

/** Toggle chip - the app's checkbox-as-chip used by the enquiry checklist. */
function Chip({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-chip border-[1.75px] px-2.5 py-1 text-[12px] transition-all",
        checked
          ? // Selected reads as SELECTED: solid brand fill, white text, lifted.
            "border-[#2f2f6f] bg-[#3f3f94] font-extrabold text-white shadow-[0_3px_10px_-2px_rgba(63,63,148,0.55)]"
          : "border-[#9199b6] bg-surface-card font-semibold text-ink-strong hover:border-[#6f78a0] hover:bg-[#f3f4f8]",
      )}
    >
      {label}
    </button>
  );
}
