"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, ShieldCheck, TriangleAlert, Loader2, GitCompareArrows } from "lucide-react";
import type { ItemLockState } from "@/lib/queries/feasibility";
import type { SpecVarianceRow } from "@/lib/feasibility/spec-variance";
import { lockItemDimensions, unlockItemDimensions } from "@/app/(app)/feasibility/actions";
import { fireToast } from "@/lib/toast";
import { VarianceReport } from "@/components/feasibility/variance-report";

/**
 * Per-product-line "Lock Dimensions & Specifications" control on the Primary
 * Feasibility / Technical Review surface (Form 04 → Form 05 gate, migration
 * 0062). Locking freezes the PF baseline and unblocks Costing for that line.
 * Unlocked → amber "costing blocked" hint + Lock button. Locked → green badge
 * with who/when + an admin-only Unlock button (reversible).
 */

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

/** Compact one-line dims summary from the line's live spec columns. */
function specSummary(line: ItemLockState): string {
  const unit = line.dimensionUnit ?? "mm";
  const dims = [
    line.outerDia && `OD ${line.outerDia}`,
    line.innerDia && `ID ${line.innerDia}`,
    line.length && `L ${line.length}`,
    line.width && `W ${line.width}`,
    line.thickness && `T ${line.thickness}`,
  ].filter(Boolean);
  const parts: string[] = [];
  if (line.shape) parts.push(line.shape);
  if (dims.length) parts.push(`${dims.join(" · ")} ${unit}`);
  if (line.gradeCustomer) parts.push(`Grade ${line.gradeCustomer}`);
  if (line.quantityNos) parts.push(`Qty ${line.quantityNos} ${line.quantityUom}`);
  return parts.join("  |  ");
}

export function LockDimensionsControl({
  line,
  lineNumber,
  isAdmin,
  varianceRows,
}: {
  line: ItemLockState;
  lineNumber: number;
  isAdmin: boolean;
  /** PF-vs-Costing rows for a locked line with a baseline; null when N/A. */
  varianceRows?: SpecVarianceRow[] | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [showVariance, setShowVariance] = React.useState(false);

  const title = line.custProductName?.trim() || `Product line ${lineNumber}`;
  const summary = specSummary(line);
  const changedCount = varianceRows?.filter((r) => r.changed).length ?? 0;

  async function onLock(): Promise<void> {
    if (
      !window.confirm(
        "Freeze these dimensions & specifications? Costing will use this as the baseline.",
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const res = await lockItemDimensions(line.inquiryItemId);
      if (res.ok) {
        fireToast({ message: "Dimensions & specifications locked." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setPending(false);
    }
  }

  async function onUnlock(): Promise<void> {
    if (
      !window.confirm(
        "Unlock this line? Costing for it will be blocked again until it is re-locked. The frozen baseline is kept for history.",
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const res = await unlockItemDimensions(line.inquiryItemId);
      if (res.ok) {
        fireToast({ message: "Dimensions unlocked." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border-2 px-4 py-3.5 ${
        line.isLocked ? "border-[#bfe3c9] bg-[#f2fbf5]" : "border-[#b7bcd2] bg-surface-card"
      }`}
    >
      {/* Identity + spec summary */}
      <div className="min-w-[220px] flex-1">
        <div className="flex items-center gap-2">
          <span className="grid h-[24px] min-w-[24px] shrink-0 place-items-center rounded-full bg-[#ececf7] px-1.5 text-[12px] font-black tabular-nums text-[#3f3f94]">
            {lineNumber}
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-ink-strong">{title}</span>
        </div>
        {summary && <p className="mt-1 text-[12.5px] font-medium text-ink-soft">{summary}</p>}
      </div>

      {/* State + action */}
      {line.isLocked ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16a34a] px-2.5 py-1 text-[11.5px] font-black uppercase tracking-[0.08em] text-white">
            <ShieldCheck size={13} strokeWidth={2.6} />
            Locked
          </span>
          <span className="text-[12px] font-semibold text-ink-soft">
            {line.lockedByName ? `by ${line.lockedByName}` : "Locked"}
            {fmtWhen(line.lockedAt) && (
              <span className="text-ink-subtle"> · {fmtWhen(line.lockedAt)}</span>
            )}
          </span>
          {varianceRows && (
            <button
              type="button"
              onClick={() => setShowVariance(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#c7cae6] px-3 py-1.5 text-[13px] font-bold text-[#3f3f94] transition-colors hover:border-brand hover:bg-[#f3f3fb]"
            >
              <GitCompareArrows size={14} strokeWidth={2.4} />
              Variance vs Costing
              {changedCount > 0 && (
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#f59e0b] px-1.5 text-[10.5px] font-black text-white">
                  {changedCount}
                </span>
              )}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => void onUnlock()}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-[#d32f2f] hover:text-[#d32f2f] disabled:opacity-50"
            >
              {pending ? (
                <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
              ) : (
                <LockOpen size={14} strokeWidth={2.2} />
              )}
              Unlock
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#b45309]">
            <TriangleAlert size={14} strokeWidth={2.4} />
            Costing is blocked until these dimensions are locked.
          </span>
          <button
            type="button"
            onClick={() => void onLock()}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-extrabold text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))" }}
          >
            {pending ? (
              <Loader2 size={15} style={{ animation: "spinFast 0.8s linear infinite" }} />
            ) : (
              <Lock size={15} strokeWidth={2.4} />
            )}
            Lock Dimensions &amp; Specifications
          </button>
        </div>
      )}
    </div>
    {showVariance && varianceRows && (
      <VarianceReport
        rows={varianceRows}
        title={title}
        subtitle={summary || undefined}
        onClose={() => setShowVariance(false)}
      />
    )}
    </>
  );
}
