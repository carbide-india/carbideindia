"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  CHECK_STATE_LABELS,
  FEAS_VERDICTS,
  FEAS_VERDICT_LABELS,
  RECHECK_STATES,
  RECHECK_STATE_LABELS,
  FEAS_PRIORITIES,
  FEAS_PRIORITY_LABELS,
  FEASIBILITY_STATUSES,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  type CheckState,
  type RecheckState,
} from "@/db/enums";
import type { Inquiry } from "@/db/schema";
import { saveFeasibility, setFeasibilityStatus } from "@/app/(app)/inquiries/actions";
import { SaveFeasibilitySchema, type SaveFeasibilityInput } from "@/lib/validators/inquiry";
import type { EmployeeOption } from "@/lib/queries/employees";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { Field, SectionCard, Segmented } from "./form-field";
import { Chip } from "./chip";
import { StatusPicker } from "./status-picker";

const CHECK_TONES: Record<CheckState, string> = {
  given: "green",
  not_given: "red",
  assumed: "amber",
};

const VERDICT_OPTIONS = FEAS_VERDICTS.map((v) => ({
  value: v,
  label: FEAS_VERDICT_LABELS[v],
}));

const RECHECK_OPTIONS = RECHECK_STATES.map((v) => ({
  value: v,
  label: RECHECK_STATE_LABELS[v],
}));

const PRIORITY_OPTIONS = FEAS_PRIORITIES.map((v) => ({
  value: v,
  label: FEAS_PRIORITY_LABELS[v],
}));

const YES_NO = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

/** The five sheet re-checks: field pair (segmented + notes) per row. */
const RECHECK_ROWS = [
  { check: "feasSizeDrawingCheck", notes: "feasSizeDrawingNotes", label: "Size & Drawing" },
  { check: "feasToleranceCheck", notes: "feasToleranceNotes", label: "Tolerance" },
  { check: "feasGradeAppCheck", notes: "feasGradeAppNotes", label: "Grade / Application" },
  { check: "feasQuantityCheck", notes: "feasQuantityNotes", label: "Quantity" },
  { check: "feasConditionCheck", notes: "feasConditionNotes", label: "Condition" },
] as const;

interface Props {
  inquiry: Inquiry;
  employees: EmployeeOption[];
}

/**
 * Primary Feasibility — the second stage of the SM record, per Manan's sheet:
 * the inquiry context auto-fetched read-only on top, the reviewer's verdicts
 * and five re-checks below. Notes inputs appear only once a re-check is
 * answered ("If clicked … only then notes pop up will come").
 */
export function FeasibilityPanel({ inquiry, employees }: Props) {
  const router = useRouter();

  const defaults: SaveFeasibilityInput = {
    feasShapeDimensionVerdict: inquiry.feasShapeDimensionVerdict ?? "to_check",
    feasGradeVerdict: inquiry.feasGradeVerdict ?? "to_check",
    feasToleranceVerdict: inquiry.feasToleranceVerdict ?? "to_check",
    feasConditionVerdict: inquiry.feasConditionVerdict ?? "to_check",
    feasPriority: inquiry.feasPriority ?? undefined,
    feasExport: inquiry.feasExport ?? undefined,
    feasSizeDrawingCheck: inquiry.feasSizeDrawingCheck,
    feasSizeDrawingNotes: inquiry.feasSizeDrawingNotes ?? undefined,
    feasToleranceCheck: inquiry.feasToleranceCheck,
    feasToleranceNotes: inquiry.feasToleranceNotes ?? undefined,
    feasGradeAppCheck: inquiry.feasGradeAppCheck,
    feasGradeAppNotes: inquiry.feasGradeAppNotes ?? undefined,
    feasQuantityCheck: inquiry.feasQuantityCheck,
    feasQuantityNotes: inquiry.feasQuantityNotes ?? undefined,
    feasConditionCheck: inquiry.feasConditionCheck,
    feasConditionNotes: inquiry.feasConditionNotes ?? undefined,
    feasActionsList: inquiry.feasActionsList ?? undefined,
    feasibilityCheckedById: inquiry.feasibilityCheckedById ?? undefined,
  };

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty, dirtyFields, isSubmitting },
  } = useForm<SaveFeasibilityInput>({
    resolver: zodResolver(SaveFeasibilitySchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    // Dirty-only patch — the action's strip-undefined + no-op short-circuit
    // handles the rest.
    const patch = Object.fromEntries(
      Object.keys(dirtyFields).map((k) => [k, values[k as keyof SaveFeasibilityInput]]),
    ) as SaveFeasibilityInput;
    if (Object.keys(patch).length === 0) return;
    const res = await saveFeasibility(inquiry.id, patch);
    if (res.ok) {
      fireToast({ message: "Feasibility saved." });
      reset(values);
      router.refresh();
    } else {
      fireToast({ message: res.error, type: "error" });
    }
  });

  return (
    <SectionCard
      title="Primary Feasibility"
      hint="Auto-fetched from the enquiry — record the technical verdicts below."
    >
      {/* ── Context strip (read-only, auto-fetched) ─────────────────── */}
      <div className="rounded-xl border border-hairline bg-surface-soft p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px]">
          <span className="font-bold text-ink-strong">{inquiry.companyName}</span>
          <span className="text-ink-muted">
            {inquiry.quantityNos ? `${inquiry.quantityNos} ${inquiry.quantityUom}` : "Quantity —"}
          </span>
          <span className="text-ink-muted line-clamp-1 max-w-[48ch]">
            {inquiry.productDescription}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["Shape & Dim", inquiry.shapeDimensionCheck],
              ["Grade", inquiry.gradeCheck],
              ["Tolerance", inquiry.toleranceCheck],
              ["Condition", inquiry.conditionCheck],
            ] as const
          ).map(([label, state]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
              {label}:
              {state ? (
                <Chip label={CHECK_STATE_LABELS[state]} tone={CHECK_TONES[state]} />
              ) : (
                <span className="text-ink-subtle">—</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {/* ── Verdicts on the four enquiry checks ─────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(
            [
              ["feasShapeDimensionVerdict", "Shape & Dimension"],
              ["feasGradeVerdict", "Grade (Customer)"],
              ["feasToleranceVerdict", "Tolerance"],
              ["feasConditionVerdict", "Condition"],
            ] as const
          ).map(([name, label]) => (
            <Field key={name} label={label}>
              <Controller
                control={control}
                name={name}
                render={({ field }) => (
                  <Segmented
                    options={VERDICT_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    allowClear={false}
                    ariaLabel={`${label} verdict`}
                  />
                )}
              />
            </Field>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Priority">
            <Controller
              control={control}
              name="feasPriority"
              render={({ field }) => (
                <Segmented
                  options={PRIORITY_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  ariaLabel="Feasibility priority"
                />
              )}
            />
          </Field>
          <Field label="Export">
            <Controller
              control={control}
              name="feasExport"
              render={({ field }) => (
                <Segmented
                  options={YES_NO}
                  value={field.value === undefined ? undefined : field.value ? "yes" : "no"}
                  onChange={(v) => field.onChange(v === undefined ? undefined : v === "yes")}
                  ariaLabel="Export"
                />
              )}
            />
          </Field>
        </div>

        {/* ── The five re-checks (notes appear once answered) ─────────── */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
            Feasibility Checks
          </h3>
          {RECHECK_ROWS.map((row) => {
            const current = watch(row.check) as RecheckState | undefined;
            const showNotes = current !== undefined && current !== "not_done";
            return (
              <div
                key={row.check}
                className="flex flex-col gap-2 rounded-xl border border-hairline p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-[14px] font-bold text-ink-strong min-w-[160px]">
                  {row.label}
                </span>
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Controller
                    control={control}
                    name={row.check}
                    render={({ field }) => (
                      <Segmented
                        options={RECHECK_OPTIONS}
                        value={field.value}
                        onChange={field.onChange}
                        allowClear={false}
                        ariaLabel={`${row.label} check`}
                      />
                    )}
                  />
                  {showNotes && (
                    <input
                      type="text"
                      placeholder="Notes…"
                      className="nt-input sm:max-w-[280px]"
                      aria-label={`${row.label} notes`}
                      {...register(row.notes)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="feas-actions" label="Actions List">
            <textarea
              id="feas-actions"
              rows={3}
              placeholder="Actions to take…"
              className="nt-input"
              {...register("feasActionsList")}
            />
          </Field>
          <Field id="feas-checked-by" label="Feasibility Checked By">
            <Controller
              control={control}
              name="feasibilityCheckedById"
              render={({ field }) => (
                <Select
                  id="feas-checked-by"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v === "" ? undefined : v)}
                  placeholder="Select…"
                  options={employees.map((e) => ({ value: e.id, label: e.name }))}
                />
              )}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-hairline pt-4">
          <div className="flex items-center gap-3">
            <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              Feasibility Status
            </span>
            <StatusPicker
              value={inquiry.feasibilityStatus}
              options={FEASIBILITY_STATUSES}
              labels={FEASIBILITY_STATUS_LABELS}
              tones={FEASIBILITY_STATUS_COLORS}
              onPick={(next) => setFeasibilityStatus(inquiry.id, next)}
              onConfirmed={(next) => {
                if (next === "proceed_to_costing") {
                  fireToast({
                    message: "Marked for costing — Costing module arrives in Phase 3.",
                    type: "info",
                  });
                }
              }}
              ariaLabel="Feasibility status"
            />
          </div>
          <button
            type="submit"
            disabled={!isDirty || isSubmitting}
            className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
            }}
          >
            {isSubmitting && (
              <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
            )}
            Save Feasibility
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
