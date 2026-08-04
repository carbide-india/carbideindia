"use client";

import * as React from "react";
import { Loader2, Paperclip, X, UploadCloud, CircleCheck } from "lucide-react";
import { upload } from "@vercel/blob/client";
import {
  FEAS_PRIORITIES,
  FEAS_PRIORITY_LABELS,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  type FeasPriority,
  type FeasibilityStatus,
  type RecheckState,
} from "@/db/enums";
import type { Inquiry } from "@/db/schema";
import type { EmployeeOption } from "@/lib/queries/employees";
import { saveFeasibilityChecklist } from "@/app/(app)/feasibility/actions";
import { FEAS_ATTACHMENT_TYPES, safeFeasFileName } from "@/lib/feasibility/attachments";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { Field, SectionCard } from "@/components/inquiries/form-field";
import { Chip } from "@/components/inquiries/chip";
import { FeasibilityChecksBoard } from "@/components/feasibility/feasibility-checks-board";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";

/* ── Option lists ──────────────────────────────────────────────────────── */
const PRIORITY_OPTS = FEAS_PRIORITIES.map((v) => ({ value: v, label: FEAS_PRIORITY_LABELS[v] }));
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
  const [actionsList, setActionsList] = React.useState(inquiry.feasActionsList ?? "");
  const [notes, setNotes] = React.useState(inquiry.feasNotes ?? "");
  const [attachments, setAttachments] = React.useState<{ name: string; url: string }[]>(
    inquiry.feasAttachments ?? [],
  );
  const [uploading, setUploading] = React.useState(0);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!FEAS_ATTACHMENT_TYPES.has(file.type)) {
        fireToast({ type: "error", message: `${file.name}: unsupported file type.` });
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const blob = await upload(`feasibility/${safeFeasFileName(file.name)}`, file, {
          access: "public",
          handleUploadUrl: "/api/feasibility/upload",
          clientPayload: JSON.stringify({ contentType: file.type }),
        });
        setAttachments((prev) => [...prev, { name: file.name, url: blob.url }]);
      } catch {
        fireToast({ type: "error", message: `${file.name}: upload failed.` });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }
  const removeAttachment = (url: string) => setAttachments((prev) => prev.filter((a) => a.url !== url));

  const setCheck = React.useCallback((key: CheckKey, patch: Partial<CheckState>) => {
    setChecks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // Feasibility status is DERIVED from the five checks (auto-routes the review
  // into the right sidebar/Kanban column):
  //   any Not Feasible → Not Feasible · any Need Info → Need Info ·
  //   any still Not Done → Not Started · all Done → Feasibility Confirmed
  //   (proceed_to_costing) · otherwise (Done + Assumed) → Pending Approval.
  const checkValues = CHECKS.map((c) => checks[c.key].value);
  const allDone = checkValues.every((v) => v === "done");
  const doneCount = checkValues.filter((v) => v === "done").length;
  const pendingCount = checkValues.filter((v) => v === "not_done").length;
  const derivedStatus: FeasibilityStatus = React.useMemo(() => {
    if (checkValues.some((v) => v === "not_feasible")) return "not_feasible";
    if (checkValues.some((v) => v === "need_info")) return "need_info";
    if (checkValues.some((v) => v === "not_done")) return "not_started";
    if (checkValues.every((v) => v === "done")) return "proceed_to_costing";
    return "pending_approval";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks]);

  type SaveState = "idle" | "saving" | "saved" | "error";
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const employeeOpts = React.useMemo(
    () => employees.map((e) => ({ value: e.id, label: e.name })),
    [employees],
  );

  // Build the full review payload from live state. Every check emits its REAL
  // value — including "not_done" — so moving a check back to Not Done actually
  // persists (the action's `clean()` drops only `undefined`; a real enum value
  // always writes). The previous code sent `undefined` for Not Done, which the
  // action skipped, so a check could never be reset from Done → the board kept
  // reverting to Done on reload.
  const buildPayload = React.useCallback(() => {
    const emit = (s: CheckState) => ({
      value: s.value,
      notes: s.value !== "not_done" && s.notes.trim() ? s.notes.trim() : undefined,
    });
    const sd = emit(checks.sizeDrawing);
    const tol = emit(checks.tolerance);
    const grd = emit(checks.gradeApp);
    const qty = emit(checks.quantity);
    const cnd = emit(checks.condition);

    return {
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
      notes: notes.trim() ? notes.trim() : undefined,
      attachments,
      feasibilityCheckedById: checkedById,
      assignedSalesPersonId: salesPersonId,
      status: derivedStatus,
    };
  }, [
    checks,
    priority,
    exportVal,
    actionsList,
    notes,
    attachments,
    checkedById,
    salesPersonId,
    derivedStatus,
  ]);

  const doSave = React.useCallback(async () => {
    setSaveState("saving");
    const res = await saveFeasibilityChecklist(inquiry.id, buildPayload());
    setSaveState(res.ok ? "saved" : "error");
    if (!res.ok) fireToast({ type: "error", message: res.error });
  }, [buildPayload, inquiry.id]);

  // ── Autosave: persist ~700 ms after the last change. No manual Save button —
  //   every edit (drag a check, pick a person, type a note, add a file) writes
  //   on its own. A signature baseline is captured on the first run so merely
  //   opening the review never writes back a derived status — and it stays
  //   correct under React StrictMode's double-invoked effects (dev).
  const lastSavedSig = React.useRef<string | null>(null);
  React.useEffect(() => {
    const sig = JSON.stringify(buildPayload());
    if (lastSavedSig.current === null) {
      lastSavedSig.current = sig; // baseline — nothing to save on open
      return;
    }
    if (sig === lastSavedSig.current) return; // no real change
    const t = setTimeout(() => {
      lastSavedSig.current = sig;
      void doSave();
    }, 700);
    return () => clearTimeout(t);
  }, [buildPayload, doSave]);

  // Ctrl/⌘+Enter flushes an immediate save (skips the debounce).
  const { containerProps } = useKeyboardForm({ onSubmit: () => void doSave() });

  return (
    <div className="flex flex-col gap-6" onKeyDown={containerProps.onKeyDown}>
      {/* ── At-a-glance status banner ──────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-section border-2 border-[#2b303b] bg-surface-card px-5 py-3"
        style={{ boxShadow: "0 6px 20px -10px rgba(15,23,42,0.2)" }}
      >
        <span className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">Feasibility Status</span>
        <Chip label={FEASIBILITY_STATUS_LABELS[derivedStatus]} tone={FEASIBILITY_STATUS_COLORS[derivedStatus]} />
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#3f3f94]">Auto from checks</span>
        <span className="ml-auto text-[13px] font-semibold text-ink-soft">
          <span className="font-black tabular-nums text-ink-strong">{doneCount}</span> of 5 checks Done
          {pendingCount > 0 && <span className="text-ink-subtle"> · {pendingCount} not done</span>}
        </span>
      </div>

      {/* ── Feasibility Checks ─────────────────────────────────────────── */}
      <SectionCard
        title="Feasibility Checks"
        inlineHint
        hint="Drag each check into a status · a reason popup opens for Need Info / Not Feasible / Assumed."
      >
        <FeasibilityChecksBoard
          items={CHECKS.map((c) => ({
            key: c.key,
            label: c.label,
            value: checks[c.key].value,
            notes: checks[c.key].notes,
          }))}
          onChange={(key, patch) => setCheck(key as CheckKey, patch)}
        />
      </SectionCard>

      {/* ── Sign-off & Routing ─────────────────────────────────────────── */}
      <SectionCard
        title="Sign-off & Routing"
        inlineHint
        hint="Feasibility Confirmed unlocks the costing stage."
      >
        <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
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
          <Field label="Feasibility Checked By" labelOnly>
            <Select
              value={checkedById ?? ""}
              onValueChange={(v) => setCheckedById(v || undefined)}
              placeholder="Select"
              options={employeeOpts}
              ariaLabel="Feasibility checked by"
            />
          </Field>
          <Field label="Feasibility Status" labelOnly>
            {/* Read-only (auto-derived) but boxed with .nt-input so its height,
                radius and border match the Select fields beside it exactly. */}
            <div className="nt-input flex items-center gap-2">
              <Chip
                label={FEASIBILITY_STATUS_LABELS[derivedStatus]}
                tone={FEASIBILITY_STATUS_COLORS[derivedStatus]}
              />
              <span className="ml-auto text-[9.5px] font-black uppercase tracking-[0.1em] text-ink-subtle">
                Auto
              </span>
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field id="feas-actions-list" label="Actions List">
            <NotesField
              id="feas-actions-list"
              rows={2}
              placeholder="Actions to take before costing"
              value={actionsList}
              onChange={setActionsList}
            />
          </Field>
          <Field id="feas-notes" label="Notes">
            <NotesField
              id="feas-notes"
              rows={2}
              placeholder="General remarks"
              value={notes}
              onChange={setNotes}
            />
          </Field>
          <Field label="Attachments" labelOnly className="h-full">
            <AttachmentsField
              attachments={attachments}
              uploading={uploading}
              onPick={handleFiles}
              onRemove={removeAttachment}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── Footer · autosave status (no manual Save button) ───────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4">
        {allDone && (
          <span className="mr-auto text-[12.5px] font-semibold text-[#16a34a]">
            All checks Done — this enquiry is approved for costing.
          </span>
        )}
        <AutosaveIndicator state={saveState} onRetry={() => void doSave()} />
      </div>
    </div>
  );
}

/* ── Autosave status pill — replaces the old Save button ───────────────── */
function AutosaveIndicator({
  state,
  onRetry,
}: {
  state: "idle" | "saving" | "saved" | "error";
  onRetry: () => void;
}) {
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-pill border border-[#f0b4b4] bg-[#fdeeee] px-3.5 py-2 text-[12.5px] font-bold text-[#d32f2f] transition hover:bg-[#fbe3e3]"
      >
        <X size={14} strokeWidth={2.6} />
        Save failed — retry
      </button>
    );
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
        <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
        Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#16a34a]">
        <CircleCheck size={15} />
        All changes saved
      </span>
    );
  }
  return (
    <span className="text-[11.5px] font-medium text-ink-subtle">
      Changes save automatically
    </span>
  );
}

/* ── Attachments (client-direct upload to Vercel Blob) ─────────────────── */
function AttachmentsField({
  attachments,
  uploading,
  onPick,
  onRemove,
}: {
  attachments: { name: string; url: string }[];
  uploading: number;
  onPick: (files: FileList | null) => void;
  onRemove: (url: string) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-full flex-1 flex-col gap-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.url}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#dcdce8] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft"
            >
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-[180px] items-center gap-1.5 truncate hover:text-brand hover:underline"
                title={a.name}
              >
                <Paperclip className="h-[13px] w-[13px] shrink-0" />
                <span className="truncate">{a.name}</span>
              </a>
              <button
                type="button"
                onClick={() => onRemove(a.url)}
                aria-label={`Remove ${a.name}`}
                className="text-ink-subtle hover:text-[#d32f2f]"
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading > 0}
        className="inline-flex min-h-[42px] w-full flex-1 items-center justify-center gap-2 rounded-lg border border-[#c9c9ea] bg-white text-[13px] font-bold text-[#3f3f94] transition hover:border-brand disabled:opacity-60"
      >
        {uploading > 0 ? (
          <Loader2 size={15} style={{ animation: "spinFast 0.8s linear infinite" }} />
        ) : (
          <UploadCloud size={16} />
        )}
        {uploading > 0 ? `Uploading ${uploading}…` : "Add Files"}
      </button>
    </div>
  );
}
