"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ShieldX, Send, Flag, AlertTriangle } from "lucide-react";
import {
  FEAS_CHECK_VERDICTS,
  FEAS_CHECK_VERDICT_LABELS,
  FEAS_CHECK_VERDICT_TONES,
  FEAS_RISKS,
  FEAS_RISK_LABELS,
  FEAS_RISK_TONES,
  FEAS_PRIORITIES,
  FEAS_PRIORITY_LABELS,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  type FeasCheckVerdict,
  type FeasRisk,
  type FeasPriority,
  type FeasibilityStatus,
} from "@/db/enums";
import type { InquiryFeasibility } from "@/db/schema";
import type { EmployeeOption } from "@/lib/queries/employees";
import type {
  FeasibilityDimensionRow,
  FeasibilityScorecardScore,
} from "@/lib/queries/feasibility";
import { computeFeasibility, type FeasVerdict } from "@/lib/feasibility/score";
import { FEAS_SCORE_BANDS } from "@/lib/feasibility/dimensions";
import {
  saveFeasibilityScorecard,
  submitFeasibilityForApproval,
  approveFeasibility,
} from "@/app/(app)/feasibility/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { Field, SectionCard, Segmented } from "@/components/inquiries/form-field";
import { Chip } from "@/components/inquiries/chip";
import { FeasibilityBulletGraph } from "@/components/feasibility/feasibility-bullet-graph";

/* ── Option lists ──────────────────────────────────────────────────────── */
const VERDICT_OPTS = FEAS_CHECK_VERDICTS.map((v) => ({ value: v, label: FEAS_CHECK_VERDICT_LABELS[v] }));
const PRIORITY_OPTS = FEAS_PRIORITIES.map((v) => ({ value: v, label: FEAS_PRIORITY_LABELS[v] }));
const RISK_OPTS = FEAS_RISKS.map((v) => ({ value: v, label: FEAS_RISK_LABELS[v] }));
const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];

/* The engine verdict and the DB check verdict share the same 4 string values. */
const asCheckVerdict = (v: FeasVerdict): FeasCheckVerdict => v as FeasCheckVerdict;

/** One dimension's editable state (client mirror of `inquiry_feasibility_scores`). */
interface RowState {
  score: number | null;
  risk: FeasRisk | null;
  isCritical: boolean;
  note: string;
}

/** SM-level engineer/commercial fields (overall verdict/risk are server-derived). */
interface SmState {
  priority?: FeasPriority;
  export?: boolean;
  exportRegulatoryVerdict?: FeasCheckVerdict;
  exportRegulatoryNote: string;
  leadTimeVerdict?: FeasCheckVerdict;
  leadTimeNote: string;
  assumptions: string;
  customerClarifications: string;
  actionItems: string;
  engineerId?: string;
}

export function FeasibilityReviewWorkspace({
  inquiryId,
  dimensions,
  scores,
  review,
  employees,
  isAdmin,
}: {
  inquiryId: string;
  dimensions: FeasibilityDimensionRow[];
  scores: Record<string, FeasibilityScorecardScore>;
  review: InquiryFeasibility | null;
  employees: EmployeeOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const status: FeasibilityStatus = review?.status ?? "not_started";
  const locked = status === "proceed_to_costing";

  const [rows, setRows] = React.useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const d of dimensions) {
      const s = scores[d.key];
      init[d.key] = {
        score: s?.score ?? null,
        risk: s?.risk ?? null,
        isCritical: s?.isCritical ?? false,
        note: s?.note ?? "",
      };
    }
    return init;
  });

  const [sm, setSm] = React.useState<SmState>(() => ({
    priority: review?.priority ?? undefined,
    export: review?.export ?? undefined,
    exportRegulatoryVerdict: review?.exportRegulatoryVerdict ?? undefined,
    exportRegulatoryNote: review?.exportRegulatoryNote ?? "",
    leadTimeVerdict: review?.leadTimeVerdict ?? undefined,
    leadTimeNote: review?.leadTimeNote ?? "",
    assumptions: review?.assumptions ?? "",
    customerClarifications: review?.customerClarifications ?? "",
    actionItems: review?.actionItems ?? "",
    engineerId: review?.engineerId ?? undefined,
  }));

  const [workingStatus, setWorkingStatus] = React.useState<"in_review" | "need_info">(
    status === "need_info" ? "need_info" : "in_review",
  );

  const setRow = React.useCallback((key: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));
  }, []);

  /* Live client-side recompute — identical engine the server uses on save. */
  const preview = React.useMemo(
    () =>
      computeFeasibility(
        dimensions.map((d) => ({
          key: d.key,
          weight: d.weight,
          score: rows[d.key]?.score ?? null,
          risk: rows[d.key]?.risk ?? null,
          isCritical: rows[d.key]?.isCritical ?? false,
        })),
      ),
    [dimensions, rows],
  );

  const buildPayload = React.useCallback(
    (nextStatus: "in_review" | "need_info") => ({
      sm: {
        priority: sm.priority,
        export: sm.export,
        exportRegulatoryVerdict: sm.exportRegulatoryVerdict,
        exportRegulatoryNote: sm.exportRegulatoryNote || undefined,
        leadTimeVerdict: sm.leadTimeVerdict,
        leadTimeNote: sm.leadTimeNote || undefined,
        assumptions: sm.assumptions || undefined,
        customerClarifications: sm.customerClarifications || undefined,
        actionItems: sm.actionItems || undefined,
        engineerId: sm.engineerId,
      },
      status: nextStatus,
      scores: dimensions.map((d) => {
        const r = rows[d.key]!;
        return {
          dimensionKey: d.key,
          score: r.score,
          risk: r.risk ?? undefined,
          isCritical: r.isCritical,
          note: r.note || undefined,
        };
      }),
    }),
    [sm, dimensions, rows],
  );

  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSave() {
    setSaving(true);
    try {
      const res = await saveFeasibilityScorecard(inquiryId, buildPayload(workingStatus));
      if (res.ok) {
        fireToast({ message: "Feasibility scorecard saved." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitForApproval() {
    setSubmitting(true);
    try {
      const saved = await saveFeasibilityScorecard(inquiryId, buildPayload("in_review"));
      if (!saved.ok) {
        fireToast({ type: "error", message: saved.error });
        return;
      }
      const res = await submitFeasibilityForApproval(inquiryId, {});
      if (res.ok) {
        fireToast({ message: "Submitted for approval." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const busy = saving || submitting;
  const overallVerdict = asCheckVerdict(preview.overallVerdict);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Verdict header ─────────────────────────────────────────────── */}
      <VerdictHeader
        index={preview.index}
        overallVerdict={overallVerdict}
        overallRisk={preview.overallRisk}
        blockerCount={preview.blockerCount}
        hasUnscored={preview.hasUnscored}
        status={status}
        review={review}
        locked={locked}
      />

      {/* Approval bar (admins, once submitted) */}
      {isAdmin && status === "pending_approval" && (
        <ApprovalBar
          inquiryId={inquiryId}
          costable={overallVerdict === "feasible" || overallVerdict === "feasible_with_deviation"}
          onDone={() => router.refresh()}
        />
      )}

      {/* ── Per-dimension bullet-graph scorecard ───────────────────────── */}
      <SectionCard
        title="Feasibility Scorecard"
        inlineHint
        hint="Score each dimension 0–100 · target 75 · weighted into the index above."
      >
        <div className="grid grid-cols-3 gap-2.5 max-lg:grid-cols-2 max-md:grid-cols-1">
          {dimensions.map((d) => (
            <DimensionRow
              key={d.key}
              dim={d}
              row={rows[d.key]!}
              verdict={preview.perDimensionVerdict[d.key] ?? "need_info"}
              disabled={locked}
              onChange={(patch) => setRow(d.key, patch)}
            />
          ))}
        </div>
      </SectionCard>

      {/* ── SM-level commercial + engineer notes ───────────────────────── */}
      <SectionCard
        title="Commercial & Engineering"
        inlineHint
        hint="Non-scored checks and what feeds costing."
      >
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field label="Priority" labelOnly>
            <Select
              value={sm.priority ?? ""}
              onValueChange={(v) => setSm((s) => ({ ...s, priority: (v || undefined) as FeasPriority | undefined }))}
              placeholder="Select"
              options={PRIORITY_OPTS}
              ariaLabel="Feasibility priority"
              disabled={locked}
            />
          </Field>
          <Field label="Export" labelOnly>
            <Select
              value={sm.export === undefined ? "" : sm.export ? "yes" : "no"}
              onValueChange={(v) => setSm((s) => ({ ...s, export: v === "" ? undefined : v === "yes" }))}
              placeholder="Select"
              options={YES_NO}
              ariaLabel="Export"
              disabled={locked}
            />
          </Field>
          <Field label="Feasibility Engineer" labelOnly>
            <Select
              value={sm.engineerId ?? ""}
              onValueChange={(v) => setSm((s) => ({ ...s, engineerId: v || undefined }))}
              placeholder="Select"
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              ariaLabel="Feasibility engineer"
              disabled={locked}
            />
          </Field>
          <Field id="feas-working-status" label="Working Status" labelOnly>
            <Select
              id="feas-working-status"
              value={workingStatus}
              onValueChange={(v) => setWorkingStatus(v as "in_review" | "need_info")}
              options={[
                { value: "in_review", label: "In Review" },
                { value: "need_info", label: "Need Info" },
              ]}
              ariaLabel="Working status"
              disabled={locked}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Export / Regulatory" labelOnly>
            <div className="flex flex-col gap-2">
              <Select
                value={sm.exportRegulatoryVerdict ?? ""}
                onValueChange={(v) => setSm((s) => ({ ...s, exportRegulatoryVerdict: (v || undefined) as FeasCheckVerdict | undefined }))}
                placeholder="Select"
                options={VERDICT_OPTS}
                ariaLabel="Export regulatory verdict"
                disabled={locked}
              />
              <input
                className="nt-input"
                placeholder="Note (optional)"
                aria-label="Export regulatory note"
                value={sm.exportRegulatoryNote}
                onChange={(e) => setSm((s) => ({ ...s, exportRegulatoryNote: e.target.value }))}
                disabled={locked}
              />
            </div>
          </Field>
          <Field label="Lead time" labelOnly>
            <div className="flex flex-col gap-2">
              <Select
                value={sm.leadTimeVerdict ?? ""}
                onValueChange={(v) => setSm((s) => ({ ...s, leadTimeVerdict: (v || undefined) as FeasCheckVerdict | undefined }))}
                placeholder="Select"
                options={VERDICT_OPTS}
                ariaLabel="Lead time verdict"
                disabled={locked}
              />
              <input
                className="nt-input"
                placeholder="Note (optional)"
                aria-label="Lead time note"
                value={sm.leadTimeNote}
                onChange={(e) => setSm((s) => ({ ...s, leadTimeNote: e.target.value }))}
                disabled={locked}
              />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="feas-assumptions" label="Assumptions">
            <NotesField id="feas-assumptions" rows={2} placeholder="What we assumed where info was missing" value={sm.assumptions} onChange={(v) => setSm((s) => ({ ...s, assumptions: v }))} />
          </Field>
          <Field id="feas-clarifications" label="Customer Clarifications Needed">
            <NotesField id="feas-clarifications" rows={2} placeholder="Info to request from the customer" value={sm.customerClarifications} onChange={(v) => setSm((s) => ({ ...s, customerClarifications: v }))} />
          </Field>
          <Field id="feas-actions" label="Action Items">
            <NotesField id="feas-actions" rows={2} placeholder="Internal actions before costing" value={sm.actionItems} onChange={(v) => setSm((s) => ({ ...s, actionItems: v }))} />
          </Field>
        </div>
      </SectionCard>

      {/* ── Footer: save + submit ──────────────────────────────────────── */}
      {!locked && (
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-surface-card px-5 py-2.5 text-[14px] font-bold text-ink-strong transition-opacity disabled:opacity-50 hover:border-brand hover:text-brand"
          >
            {saving && <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />}
            Save Scorecard
          </button>
          {status !== "pending_approval" && (
            <button
              type="button"
              onClick={onSubmitForApproval}
              disabled={busy || preview.hasUnscored}
              title={preview.hasUnscored ? "Score every dimension before submitting" : undefined}
              className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))", fontWeight: 800 }}
            >
              {submitting ? <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} /> : <Send size={14} />}
              Submit for Approval
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Verdict header ───────────────────────────────────────────────────── */
function VerdictHeader({
  index,
  overallVerdict,
  overallRisk,
  blockerCount,
  hasUnscored,
  status,
  review,
  locked,
}: {
  index: number;
  overallVerdict: FeasCheckVerdict;
  overallRisk: FeasRisk;
  blockerCount: number;
  hasUnscored: boolean;
  status: FeasibilityStatus;
  review: InquiryFeasibility | null;
  locked: boolean;
}) {
  const notFeasible = overallVerdict === "not_feasible";
  const indexColor = notFeasible ? "#d32f2f" : "#3f3f94";
  return (
    <div className="rounded-section border border-hairline bg-surface-card px-5 py-4" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Index dial */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-[46px] font-black leading-none tabular-nums" style={{ color: indexColor }}>
            {index}
          </span>
          <div className="flex flex-col">
            <span className="text-[15px] font-black leading-none" style={{ color: indexColor }}>%</span>
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-subtle">Index</span>
          </div>
        </div>

        <div className="h-10 w-px bg-hairline max-md:hidden" />

        {/* Verdict + risk + status */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Chip label={FEAS_CHECK_VERDICT_LABELS[overallVerdict]} tone={FEAS_CHECK_VERDICT_TONES[overallVerdict]} />
          <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: `color-mix(in srgb, var(--color-${FEAS_RISK_TONES[overallRisk]}) 12%, transparent)`, color: `var(--color-${FEAS_RISK_TONES[overallRisk]}-deep)`, border: `1px solid color-mix(in srgb, var(--color-${FEAS_RISK_TONES[overallRisk]}) 30%, transparent)` }}>
            {FEAS_RISK_LABELS[overallRisk]} risk
          </span>
          <Chip label={FEASIBILITY_STATUS_LABELS[status]} tone={FEASIBILITY_STATUS_COLORS[status]} />
        </div>

        {/* Blocker callout */}
        {blockerCount > 0 && (
          <div className="ml-auto inline-flex items-center gap-2 rounded-pill border border-[#f3b6b3] bg-[#fdecec] px-3 py-1.5 text-[12.5px] font-bold text-[#b91c1c]">
            <AlertTriangle size={15} />
            {blockerCount} critical blocker{blockerCount === 1 ? "" : "s"} — forces Not Feasible
          </div>
        )}
        {blockerCount === 0 && hasUnscored && (
          <div className="ml-auto inline-flex items-center gap-2 rounded-pill border border-[#f0d69a] bg-[#fdf6e3] px-3 py-1.5 text-[12.5px] font-bold text-[#96690b]">
            <AlertTriangle size={15} />
            Some dimensions unscored — Needs info
          </div>
        )}
      </div>

      {/* Audit trail */}
      {(review?.submittedAt || review?.approvedAt) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline pt-3 text-[12.5px] text-ink-subtle">
          {review?.submittedAt && (
            <span>Submitted {fmt(review.submittedAt)}</span>
          )}
          {review?.approvedAt && (
            <span className="font-semibold" style={{ color: locked ? "var(--color-green-deep)" : "var(--color-red-deep)" }}>
              {locked ? "Approved" : "Rejected"} {fmt(review.approvedAt)}
              {review.approvalNote ? ` — ${review.approvalNote}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── One dimension row (label + bullet graph + editable controls) ─────── */
function DimensionRow({
  dim,
  row,
  verdict,
  disabled,
  onChange,
}: {
  dim: FeasibilityDimensionRow;
  row: RowState;
  verdict: FeasVerdict;
  disabled: boolean;
  onChange: (patch: Partial<RowState>) => void;
}) {
  const isBlocker = row.isCritical && (verdict === "not_feasible" || row.risk === "high");
  return (
    <div
      className="flex flex-col gap-2 rounded-[10px] border p-2.5"
      style={{
        borderColor: isBlocker ? "#f3b6b3" : "var(--color-hairline)",
        background: isBlocker ? "rgba(211,47,47,0.03)" : "var(--color-surface-soft)",
      }}
    >
      {/* Line 1: label + weight */}
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-[13px] font-bold text-ink-strong" title={dim.hint || dim.label}>
          {dim.label}
        </span>
        <span className="shrink-0 rounded-full border border-hairline bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-ink-muted">
          wt {dim.weight}%
        </span>
      </div>

      {/* Line 2: bullet graph + score input (inline width beats .nt-input's width:100%) */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <FeasibilityBulletGraph score={row.score} target={FEAS_SCORE_BANDS.feasible} verdict={verdict} />
        </div>
        <input
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          disabled={disabled}
          className="nt-input shrink-0 text-center tabular-nums"
          style={{ width: 60, paddingLeft: 6, paddingRight: 6 }}
          aria-label={`${dim.label} score`}
          placeholder="—"
          value={row.score == null ? "" : row.score}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange({ score: null });
            const n = Math.max(0, Math.min(100, Math.round(Number(raw))));
            onChange({ score: Number.isNaN(n) ? null : n });
          }}
        />
      </div>

      {/* Line 3: risk + critical + note */}
      <div className="flex items-center gap-1.5">
        <Segmented<FeasRisk>
          options={RISK_OPTS}
          value={row.risk ?? undefined}
          onChange={(v) => onChange({ risk: v ?? null })}
          ariaLabel={`${dim.label} risk`}
          activeTone="brand"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ isCritical: !row.isCritical })}
          aria-pressed={row.isCritical}
          title={row.isCritical ? "Critical (veto) dimension" : "Mark critical"}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border p-1.5 transition-colors disabled:opacity-50"
          style={
            row.isCritical
              ? { borderColor: "#3f3f94", background: "#3f3f94", color: "#fff" }
              : { borderColor: "var(--color-hairline-strong)", background: "#fff", color: "var(--color-ink-muted)" }
          }
        >
          <Flag size={13} />
        </button>
        <input
          className="nt-input min-w-0 flex-1 px-2 text-[12.5px]"
          placeholder="Note"
          aria-label={`${dim.label} note`}
          value={row.note}
          disabled={disabled}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </div>
    </div>
  );
}

/* ── Admin approve/reject bar (once Pending Approval) ─────────────────── */
function ApprovalBar({
  inquiryId,
  costable,
  onDone,
}: {
  inquiryId: string;
  costable: boolean;
  onDone: () => void;
}) {
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState<null | "approve" | "reject">(null);

  async function decide(decision: "approve" | "reject") {
    setPending(decision);
    try {
      const res = await approveFeasibility(inquiryId, { decision, note: note || undefined });
      if (res.ok) {
        fireToast({ message: decision === "approve" ? "Approved — unlocked for costing." : "Marked not feasible." });
        onDone();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-section border-2 border-[#3f3f94] bg-[#f4f4fb] px-4 py-3.5">
      <span className="text-[13px] font-black uppercase tracking-[0.08em] text-[#3f3f94]">Approval</span>
      <input
        className="nt-input min-w-[220px] flex-1"
        placeholder="Approval / rejection note (optional)"
        aria-label="Approval note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        type="button"
        onClick={() => decide("approve")}
        disabled={pending !== null || !costable}
        title={costable ? undefined : "Only Feasible / Feasible-with-deviation reviews can be approved."}
        className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
        style={{ background: "linear-gradient(135deg,#16a34a,#12813b)" }}
      >
        {pending === "approve" ? <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} /> : <ShieldCheck size={15} />}
        Approve → Costing
      </button>
      <button
        type="button"
        onClick={() => decide("reject")}
        disabled={pending !== null}
        className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
        style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
      >
        {pending === "reject" ? <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} /> : <ShieldX size={15} />}
        Not Feasible
      </button>
    </div>
  );
}

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
