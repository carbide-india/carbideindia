"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  ACTIVE_RECHECK_STATES,
  RECHECK_STATE_LABELS,
  RECHECK_STATE_TONES,
  FEAS_PRIORITIES,
  FEAS_PRIORITY_LABELS,
  ACTIVE_FEASIBILITY_STATUSES,
  FEASIBILITY_STATUS_LABELS,
  type FeasPriority,
  type FeasibilityStatus,
  type RecheckState,
} from "@/db/enums";
import type { Inquiry } from "@/db/schema";
import type { EmployeeOption } from "@/lib/queries/employees";
import { saveFeasibilityChecklist } from "@/app/(app)/feasibility/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { Field, SectionCard, Segmented } from "@/components/inquiries/form-field";
import { Chip } from "@/components/inquiries/chip";

/* ── Option lists ──────────────────────────────────────────────────────── */
const CHECK_OPTS = ACTIVE_RECHECK_STATES.map((v) => ({ value: v, label: RECHECK_STATE_LABELS[v] }));
const PRIORITY_OPTS = FEAS_PRIORITIES.map((v) => ({ value: v, label: FEAS_PRIORITY_LABELS[v] }));
const STATUS_OPTS = ACTIVE_FEASIBILITY_STATUSES.map((v) => ({ value: v, label: FEASIBILITY_STATUS_LABELS[v] }));
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/* The five checklist rows, in sheet order. */
const CHECKS = [
  { key: "sizeDrawing", label: "Size & Drawing" },
  { key: "tolerance", label: "Tolerance" },
  { key: "gradeApp", label: "Grade / Application" },
  { key: "quantity", label: "Quantity" },
  { key: "condition", label: "Condition" },
] as const;
type CheckKey = (typeof CHECKS)[number]["key"];

interface CheckState {
  value: RecheckState;
  notes: string;
}

export function FeasibilityReviewWorkspace({
  inquiry,
  employees,
}: {
  inquiry: Inquiry;
  employees: EmployeeOption[];
}) {
  const router = useRouter();

  const [checks, setChecks] = React.useState<Record<CheckKey, CheckState>>(() => ({
    sizeDrawing: { value: inquiry.feasSizeDrawingCheck ?? "not_done", notes: inquiry.feasSizeDrawingNotes ?? "" },
    tolerance: { value: inquiry.feasToleranceCheck ?? "not_done", notes: inquiry.feasToleranceNotes ?? "" },
    gradeApp: { value: inquiry.feasGradeAppCheck ?? "not_done", notes: inquiry.feasGradeAppNotes ?? "" },
    quantity: { value: inquiry.feasQuantityCheck ?? "not_done", notes: inquiry.feasQuantityNotes ?? "" },
    condition: { value: inquiry.feasConditionCheck ?? "not_done", notes: inquiry.feasConditionNotes ?? "" },
  }));

  const [priority, setPriority] = React.useState<FeasPriority | undefined>(inquiry.feasPriority ?? undefined);
  const [exportVal, setExportVal] = React.useState<boolean | undefined>(inquiry.feasExport ?? undefined);
  const [salesPersonId, setSalesPersonId] = React.useState<string | undefined>(
    inquiry.assignedSalesPersonId ?? undefined,
  );
  const [checkedById, setCheckedById] = React.useState<string | undefined>(
    inquiry.feasibilityCheckedById ?? undefined,
  );
  const [status, setStatus] = React.useState<FeasibilityStatus>(inquiry.feasibilityStatus);
  const [actionsList, setActionsList] = React.useState(inquiry.feasActionsList ?? "");

  const setCheck = React.useCallback((key: CheckKey, patch: Partial<CheckState>) => {
    setChecks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const [saving, setSaving] = React.useState(false);

  const employeeOpts = React.useMemo(
    () => employees.map((e) => ({ value: e.id, label: e.name })),
    [employees],
  );

  async function onSave() {
    setSaving(true);
    try {
      // Emit a check value only when it's non-default; a note only for "assumed".
      const emit = (s: CheckState) => ({
        value: s.value === "not_done" ? undefined : s.value,
        notes: s.value === "assumed" && s.notes.trim() ? s.notes.trim() : undefined,
      });
      const sd = emit(checks.sizeDrawing);
      const tol = emit(checks.tolerance);
      const grd = emit(checks.gradeApp);
      const qty = emit(checks.quantity);
      const cnd = emit(checks.condition);

      const payload = {
        sizeDrawingCheck: sd.value,
        sizeDrawingNotes: sd.notes,
        toleranceCheck: tol.value,
        toleranceNotes: tol.notes,
        gradeAppCheck: grd.value,
        gradeAppNotes: grd.notes,
        quantityCheck: qty.value,
        quantityNotes: qty.notes,
        conditionCheck: cnd.value,
        conditionNotes: cnd.notes,
        priority,
        export: exportVal,
        actionsList: actionsList.trim() ? actionsList.trim() : undefined,
        feasibilityCheckedById: checkedById,
        assignedSalesPersonId: salesPersonId,
        status,
      };

      const res = await saveFeasibilityChecklist(inquiry.id, payload);
      if (res.ok) {
        fireToast({ message: "Feasibility review saved." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Feasibility Checks ─────────────────────────────────────────── */}
      <SectionCard
        title="Feasibility Checks"
        inlineHint
        hint="Mark each check · add a reason only where you had to assume."
      >
        <div className="flex flex-col gap-2.5">
          {CHECKS.map(({ key, label }) => {
            const st = checks[key];
            const assumed = st.value === "assumed";
            return (
              <div
                key={key}
                className="flex flex-col gap-2.5 rounded-[10px] border border-hairline bg-surface-soft p-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-[13.5px] font-bold text-ink-strong">{label}</span>
                  {st.value !== "not_done" && (
                    <Chip label={RECHECK_STATE_LABELS[st.value]} tone={RECHECK_STATE_TONES[st.value]} />
                  )}
                  <div className="ml-auto">
                    <Segmented<RecheckState>
                      options={CHECK_OPTS}
                      value={st.value}
                      onChange={(v) => setCheck(key, { value: v ?? "not_done" })}
                      allowClear={false}
                      activeTone="brand"
                      ariaLabel={`${label} check`}
                    />
                  </div>
                </div>
                {assumed && (
                  <input
                    className="nt-input text-[13px]"
                    placeholder="Reason / what was assumed"
                    aria-label={`${label} assumption reason`}
                    value={st.notes}
                    onChange={(e) => setCheck(key, { notes: e.target.value })}
                  />
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Sign-off & Routing ─────────────────────────────────────────── */}
      <SectionCard
        title="Sign-off & Routing"
        inlineHint
        hint="Approved · Proceed to Costing unlocks the costing stage."
      >
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field label="Priority" labelOnly>
            <Select
              value={priority ?? ""}
              onValueChange={(v) => setPriority((v || undefined) as FeasPriority | undefined)}
              placeholder="Select"
              options={PRIORITY_OPTS}
              ariaLabel="Feasibility priority"
            />
          </Field>
          <Field label="Export" labelOnly>
            <Select
              value={exportVal === undefined ? "" : exportVal ? "yes" : "no"}
              onValueChange={(v) => setExportVal(v === "" ? undefined : v === "yes")}
              placeholder="Select"
              options={YES_NO}
              ariaLabel="Export"
            />
          </Field>
          <Field label="Assign Sales Person" labelOnly>
            <Select
              value={salesPersonId ?? ""}
              onValueChange={(v) => setSalesPersonId(v || undefined)}
              placeholder="Select"
              options={employeeOpts}
              ariaLabel="Assign sales person"
            />
          </Field>
          <Field label="Feasibility Checked" labelOnly>
            <Select
              value={checkedById ?? ""}
              onValueChange={(v) => setCheckedById(v || undefined)}
              placeholder="Select"
              options={employeeOpts}
              ariaLabel="Feasibility checked by"
            />
          </Field>
          <Field label="Feasibility Status" labelOnly>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as FeasibilityStatus)}
              placeholder="Select"
              options={STATUS_OPTS}
              ariaLabel="Feasibility status"
            />
          </Field>
        </div>

        <Field id="feas-actions-list" label="Actions List">
          <NotesField
            id="feas-actions-list"
            rows={2}
            placeholder="Actions to take before costing"
            value={actionsList}
            onChange={setActionsList}
          />
        </Field>
      </SectionCard>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] text-white transition-opacity disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
            fontWeight: 800,
          }}
        >
          {saving && <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />}
          Save Review
        </button>
      </div>
    </div>
  );
}
