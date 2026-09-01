"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Check,
  Pause,
  Pencil,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";
import type { PipelineRow, StageState } from "@/lib/queries/pipeline-tracker";
import {
  applyPipelineDecision,
  type PipelineDecision,
  type PipelineStageKey,
} from "@/app/(app)/pipeline/actions";
import { OverallChip, Stepper, fmtDate } from "./parts";

const STATE_TEXT: Record<StageState, { label: string; cls: string }> = {
  done: { label: "Done", cls: "text-[#15803d]" },
  active: { label: "In progress", cls: "text-[#454595]" },
  pending: { label: "Pending", cls: "text-[#a8a29e]" },
  dead: { label: "Dropped", cls: "text-[#d03232]" },
  hold: { label: "On Hold", cls: "text-[#b45309]" },
};

/** Stages an approver decides on (Enquiry only gets Hold/Cancel; KYC/Sample none). */
const DECISION_STAGES = new Set<PipelineStageKey>([
  "feasibility",
  "secondary",
  "costing",
  "quotation",
  "negotiation",
  "sales_order",
]);

function stageHref(key: string, id: string): Route {
  switch (key) {
    case "kyc": return "/clients" as Route;
    case "sample": return "/samples" as Route;
    case "enquiry": return `/enquiries/register/${id}` as Route;
    case "feasibility": return `/enquiries/feasibility/${id}` as Route;
    case "secondary": return "/secondary-feasibility" as Route;
    case "costing": return "/costings" as Route;
    case "quotation": return "/quotations" as Route;
    case "negotiation": return "/negotiations" as Route;
    case "sales_order": return "/sales-orders" as Route;
    default: return "/enquiries" as Route;
  }
}

export function PipelineDetail({ row, isApprover = false }: { row: PipelineRow; isApprover?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  function decide(stage: PipelineStageKey, decision: PipelineDecision) {
    startTransition(async () => {
      const res = await applyPipelineDecision({ inquiryId: row.inquiryId, stage, decision });
      if (res.ok) {
        fireToast({ message: "Decision applied." });
        setConfirmCancel(false);
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    });
  }

  const frozen = row.frozen; // "on_hold" | "cancelled" | null

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <Link
        href={"/pipeline" as Route}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#454595] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
        Back to Pipeline
      </Link>

      {/* Freeze banner */}
      {frozen && (
        <div
          className={cn(
            "mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3",
            frozen === "cancelled"
              ? "border-[#d03232]/30 bg-[#d03232]/8"
              : "border-[#e8830c]/40 bg-[#e8830c]/10",
          )}
        >
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full text-white",
              frozen === "cancelled" ? "bg-[#d03232]" : "bg-[#e8830c]",
            )}
          >
            {frozen === "cancelled" ? <Ban className="h-[18px] w-[18px]" /> : <Pause className="h-[18px] w-[18px]" fill="currentColor" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className={cn("text-[14px] font-extrabold", frozen === "cancelled" ? "text-[#d03232]" : "text-[#b45309]")}>
              This inquiry is {frozen === "cancelled" ? "Cancelled" : "On Hold"}
            </div>
            <div className="text-[12px] text-[#777985]">
              Every stage is frozen. {isApprover ? "Resume to lift it — stages return exactly as they were." : "An approver can resume it."}
            </div>
          </div>
          {isApprover && (
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("feasibility", "resume")}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#16a34a] px-3.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-50"
            >
              <Play className="h-4 w-4" strokeWidth={2.6} />
              Resume Inquiry
            </button>
          )}
        </div>
      )}

      {/* Header card */}
      <div className="rounded-lg border border-[#e2dfdc] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-black text-[#1f2547]" style={{ fontFamily: "var(--font-mono, monospace)" }}>
                {row.smNumber}
              </span>
              <OverallChip overall={row.overall} />
            </div>
            <div className="mt-0.5 text-[15px] font-bold text-[#1f2547]">{row.companyName}</div>
            <div className="mt-0.5 text-[12px] text-[#777985]">
              {row.salesPerson ?? "Unassigned"} · {fmtDate(row.enquiryDate)} · Currently at{" "}
              <span className="font-bold text-[#454595]">{row.currentStageLabel}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href={`/inquiries/${row.inquiryId}/edit` as Route}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#e2dfdc] bg-white px-3 text-[12.5px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#454595]/8"
            >
              <Pencil className="h-4 w-4" strokeWidth={2.4} />
              Edit Enquiry
            </Link>
            <Link
              href={`/inquiries/${row.inquiryId}` as Route}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#454595] px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#3a3a80]"
            >
              Open Full SM
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-5">
          <Stepper stages={row.stages} minWidth={620} />
        </div>
      </div>

      {/* Approver card */}
      {isApprover && (
        <div className="mt-4 rounded-lg border border-[#e2dfdc] bg-white">
          <div className="flex items-center gap-2 border-b border-[#eef0f3] px-4 py-3">
            <ShieldCheck className="h-4 w-4 text-[#454595]" strokeWidth={2.4} />
            <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#454595]">
              Approver Actions
            </span>
            <span className="text-[11px] text-[#a8a29e]">Alok &amp; Altus only</span>

            {/* Whole-inquiry freeze — only when not already frozen. */}
            {!frozen && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decide("feasibility", "on_hold")}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-[#e8830c] bg-[#e8830c]/10 px-2.5 text-[12px] font-bold text-[#b45309] transition-colors hover:bg-[#e8830c]/20 disabled:opacity-50"
                >
                  <Pause className="h-3.5 w-3.5" strokeWidth={2.6} />
                  Put On Hold
                </button>
                {confirmCancel ? (
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => decide("feasibility", "cancelled")}
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-[#d03232] px-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[#b02525] disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" strokeWidth={2.6} />
                      Confirm cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="inline-flex h-8 items-center rounded-md border border-[#e2dfdc] px-2.5 text-[12px] font-bold text-[#777985] hover:border-[#a8a8a8]"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirmCancel(true)}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-[#d03232] bg-[#d03232]/10 px-2.5 text-[12px] font-bold text-[#d03232] transition-colors hover:bg-[#d03232]/20 disabled:opacity-50"
                  >
                    <Ban className="h-3.5 w-3.5" strokeWidth={2.6} />
                    Cancel Inquiry
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Per-stage decisions */}
          <div>
            {row.stages.map((st, i) => {
              const t = STATE_TEXT[st.state];
              const canDecide = DECISION_STAGES.has(st.key as PipelineStageKey) && !frozen;
              return (
                <div key={st.key} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", i > 0 && "border-t border-[#f3f1ec]")}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f4f0e8] text-[11px] font-black text-[#777985] tabular-nums">
                    {i + 1}
                  </span>
                  <span className="w-[104px] shrink-0 text-[13px] font-bold text-[#1f2547]">{st.label}</span>
                  <span className={cn("min-w-[76px] text-[12px] font-semibold", t.cls)}>{t.label}</span>

                  {canDecide && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => decide(st.key as PipelineStageKey, "approve")}
                        className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#16a34a] bg-[#16a34a]/10 px-2 text-[11px] font-bold text-[#15803d] transition-colors hover:bg-[#16a34a]/20 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" strokeWidth={2.8} /> Approve
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => decide(st.key as PipelineStageKey, "not_approved")}
                        className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#e11d74] bg-[#e11d74]/10 px-2 text-[11px] font-bold text-[#be185d] transition-colors hover:bg-[#e11d74]/20 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" strokeWidth={2.8} /> Not Approved
                      </button>
                    </div>
                  )}

                  <Link
                    href={stageHref(st.key, row.inquiryId)}
                    className="ml-auto inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#e2dfdc] bg-[#f4f0e8] px-2 text-[11px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#454595]/10"
                  >
                    Open <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Read-only per-stage list for non-approvers */}
      {!isApprover && (
        <div className="mt-4 rounded-lg border border-[#e2dfdc] bg-white">
          {row.stages.map((st, i) => {
            const t = STATE_TEXT[st.state];
            return (
              <div key={st.key} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-[#f3f1ec]")}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f4f0e8] text-[11px] font-black text-[#777985] tabular-nums">
                  {i + 1}
                </span>
                <span className="w-[110px] shrink-0 text-[13px] font-bold text-[#1f2547]">{st.label}</span>
                <span className={cn("flex-1 text-[12.5px] font-semibold", t.cls)}>{t.label}</span>
                <Link
                  href={stageHref(st.key, row.inquiryId)}
                  className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#e2dfdc] bg-[#f4f0e8] px-2 text-[11px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#454595]/10"
                >
                  Open <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            );
          })}
          <p className="px-4 pb-3 pt-1 text-[11.5px] text-[#a8a29e]">
            Approve / Not Approved / On Hold / Cancel are available to approvers (Alok / Altus) only.
          </p>
        </div>
      )}
    </div>
  );
}
