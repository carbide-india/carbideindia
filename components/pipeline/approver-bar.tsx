"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Pause, Play, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";
import {
  applyPipelineDecision,
  type PipelineDecision,
  type PipelineStageKey,
} from "@/app/(app)/pipeline/actions";

/**
 * Reusable approver control bar for a single inquiry, dropped onto any module's
 * detail page. Approve / Not Approved act on THIS stage; On Hold / Cancel freeze
 * the whole inquiry (overlay — no migration); Resume lifts it. Approver-only
 * (Alok & Altus); the server re-checks. Enquiry (and KYC/Sample) pass a stage
 * that only supports Hold/Cancel — omit `canApproveStage` there.
 */
export function ApproverBar({
  inquiryId,
  stage,
  isApprover,
  frozen,
  canApproveStage = true,
}: {
  inquiryId: string;
  stage: PipelineStageKey;
  isApprover: boolean;
  frozen: "on_hold" | "cancelled" | null;
  /** false for stages with no per-stage Approve (e.g. Enquiry) — Hold/Cancel only. */
  canApproveStage?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  if (!isApprover) return null;

  function decide(decision: PipelineDecision) {
    startTransition(async () => {
      const res = await applyPipelineDecision({ inquiryId, stage, decision });
      if (res.ok) {
        fireToast({ message: "Decision applied." });
        setConfirmCancel(false);
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#e2dfdc] bg-white px-3 py-2">
      <ShieldCheck className="h-4 w-4 shrink-0 text-[#454595]" strokeWidth={2.4} />
      <span className="mr-1 text-[11px] font-black uppercase tracking-[0.1em] text-[#454595]">
        Approver
      </span>

      {frozen ? (
        <>
          <span
            className={cn(
              "text-[12px] font-bold",
              frozen === "cancelled" ? "text-[#d03232]" : "text-[#b45309]",
            )}
          >
            This inquiry is {frozen === "cancelled" ? "Cancelled" : "On Hold"}.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => decide("resume")}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-md bg-[#16a34a] px-3 text-[12px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2.6} />
            Resume
          </button>
        </>
      ) : (
        <>
          {canApproveStage && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("approve")}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-[#16a34a] bg-[#16a34a]/10 px-2.5 text-[12px] font-bold text-[#15803d] transition-colors hover:bg-[#16a34a]/20 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.8} /> Approve
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("not_approved")}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-[#e11d74] bg-[#e11d74]/10 px-2.5 text-[12px] font-bold text-[#be185d] transition-colors hover:bg-[#e11d74]/20 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.8} /> Not Approved
              </button>
              <span className="mx-1 h-5 w-px bg-[#e2dfdc]" />
            </>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => decide("on_hold")}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#e8830c] bg-[#e8830c]/10 px-2.5 text-[12px] font-bold text-[#b45309] transition-colors hover:bg-[#e8830c]/20 disabled:opacity-50"
          >
            <Pause className="h-3.5 w-3.5" strokeWidth={2.6} /> Put On Hold
          </button>
          {confirmCancel ? (
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => decide("cancelled")}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-[#d03232] px-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[#b02525] disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" strokeWidth={2.6} /> Confirm cancel
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
              <Ban className="h-3.5 w-3.5" strokeWidth={2.6} /> Cancel Inquiry
            </button>
          )}
        </>
      )}
    </div>
  );
}
