"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, ArrowUpRight, Ban, Check, Pause, Pencil, Play, X } from "lucide-react";
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

/** Stages an approver can decide on (Enquiry deferred; KYC/Sample aren't gated). */
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
    case "kyc":
      return "/clients" as Route;
    case "sample":
      return "/samples" as Route;
    case "enquiry":
      return `/enquiries/register/${id}` as Route;
    case "feasibility":
      return `/enquiries/feasibility/${id}` as Route;
    case "secondary":
      return "/secondary-feasibility" as Route;
    case "costing":
      return "/costings" as Route;
    case "quotation":
      return "/quotations" as Route;
    case "negotiation":
      return "/negotiations" as Route;
    case "sales_order":
      return "/sales-orders" as Route;
    default:
      return "/enquiries" as Route;
  }
}

export function PipelineDetail({ row, isApprover = false }: { row: PipelineRow; isApprover?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function decide(stage: PipelineStageKey, decision: PipelineDecision) {
    if (decision === "cancelled" &&
      !window.confirm("Cancel this inquiry? Every stage will be marked Cancelled.")) {
      return;
    }
    startTransition(async () => {
      const res = await applyPipelineDecision({ inquiryId: row.inquiryId, stage, decision });
      if (res.ok) {
        fireToast({ message: "Decision applied." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    });
  }

  const frozen = row.overall === "on_hold" || row.overall === "dead";

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <Link
        href={"/pipeline" as Route}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#454595] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
        Back to Pipeline
      </Link>

      {/* Header card */}
      <div className="rounded-lg border border-[#e2dfdc] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-[18px] font-black text-[#1f2547]"
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              >
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

        {/* Big stepper */}
        <div className="mt-5">
          <Stepper stages={row.stages} minWidth={620} />
        </div>

        {/* Approver-only inquiry controls (Alok / Altus): freeze / resume whole SM */}
        {isApprover && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[#eef0f3] pt-4">
            <span className="mr-1 text-[11px] font-black uppercase tracking-[0.1em] text-[#777985]">
              Approver
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("feasibility", "on_hold")}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-[#e8830c] bg-[#e8830c]/10 px-2.5 text-[12px] font-bold text-[#b45309] transition-colors hover:bg-[#e8830c]/20 disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={2.6} />
              Put On Hold
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("feasibility", "cancelled")}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-[#d03232] bg-[#d03232]/10 px-2.5 text-[12px] font-bold text-[#d03232] transition-colors hover:bg-[#d03232]/20 disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" strokeWidth={2.6} />
              Cancel Inquiry
            </button>
            {frozen && (
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("feasibility", "resume")}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-[#16a34a] bg-[#16a34a]/10 px-2.5 text-[12px] font-bold text-[#15803d] transition-colors hover:bg-[#16a34a]/20 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.6} />
                Resume
              </button>
            )}
          </div>
        )}
      </div>

      {/* Per-stage rows */}
      <div className="mt-4 rounded-lg border border-[#e2dfdc] bg-white">
        {row.stages.map((st, i) => {
          const t = STATE_TEXT[st.state];
          const canDecide = isApprover && DECISION_STAGES.has(st.key as PipelineStageKey);
          return (
            <div
              key={st.key}
              className={cn(
                "flex flex-wrap items-center gap-3 px-4 py-3",
                i > 0 && "border-t border-[#eef0f3]",
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f4f0e8] text-[11px] font-black text-[#777985] tabular-nums">
                {i + 1}
              </span>
              <span className="w-[110px] shrink-0 text-[13px] font-bold text-[#1f2547]">{st.label}</span>
              <span className={cn("min-w-[80px] text-[12.5px] font-semibold", t.cls)}>{t.label}</span>

              {canDecide && !frozen && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide(st.key as PipelineStageKey, "approve")}
                    className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#16a34a] bg-[#16a34a]/10 px-2 text-[11px] font-bold text-[#15803d] transition-colors hover:bg-[#16a34a]/20 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" strokeWidth={2.8} />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide(st.key as PipelineStageKey, "not_approved")}
                    className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#e11d74] bg-[#e11d74]/10 px-2 text-[11px] font-bold text-[#be185d] transition-colors hover:bg-[#e11d74]/20 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" strokeWidth={2.8} />
                    Not Approved
                  </button>
                </div>
              )}

              <Link
                href={stageHref(st.key, row.inquiryId)}
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#e2dfdc] bg-[#f4f0e8] px-2 text-[11px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#454595]/10"
              >
                Open
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })}
      </div>

      {!isApprover && (
        <p className="mt-3 text-[11.5px] text-[#a8a29e]">
          Approve / Not Approved / On Hold / Cancel are available to approvers (Alok / Altus) only.
        </p>
      )}
    </div>
  );
}
