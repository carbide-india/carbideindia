"use client";

import * as React from "react";
import { X, GitCompareArrows, CheckCircle2 } from "lucide-react";
import type { SpecVarianceRow } from "@/lib/feasibility/spec-variance";

/**
 * VarianceReport — presentational spec variance modal.
 *
 * A tabular modal [ Field | <baseline> | <current> | Variance ] that highlights
 * rows whose value drifted from the frozen Primary-Feasibility baseline. Purely
 * presentational: it takes already-resolved rows (see `computeSpecVariance`) so
 * Form 04 (feasibility), the Secondary register and Form 05 (costing) all embed
 * the SAME component. When nothing changed it shows a clean "no changes" state.
 *
 * The three captions default to the original Feasibility-vs-Costing wording;
 * the Secondary Feasibility register overrides them to read Primary-vs-current
 * without forking a second modal.
 */

interface Props {
  rows: SpecVarianceRow[];
  /** Line identity for the modal header (e.g. product name / SM line). */
  title?: string;
  subtitle?: string;
  /** Eyebrow caption above the title. */
  heading?: string;
  /** Column caption for the frozen baseline side. */
  baselineLabel?: string;
  /** Column caption for the live/current side. */
  currentLabel?: string;
  onClose: () => void;
}

export function VarianceReport({
  rows,
  title,
  subtitle,
  heading = "Variance · Feasibility vs Costing",
  baselineLabel = "Feasibility (PF)",
  currentLabel = "Costing (C)",
  onClose,
}: Props) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changedCount = rows.filter((r) => r.changed).length;
  const hasChanges = changedCount > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-[min(94vw,760px)] max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Feasibility vs Costing variance"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-[#e7e9f6] px-6 pt-6 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#3f3f94]">
              <GitCompareArrows size={14} strokeWidth={2.6} />
              {heading}
            </div>
            {title && (
              <h2 className="mt-1.5 text-[20px] font-black leading-tight tracking-tight text-ink-strong">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[12.5px] font-medium text-ink-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Summary line */}
          <div
            className={`mb-4 flex items-center gap-2 rounded-xl border-2 px-3.5 py-2.5 text-[13px] font-bold ${
              hasChanges
                ? "border-[#f3d9a6] bg-[#fdf6e7] text-[#b45309]"
                : "border-[#bfe3c9] bg-[#f2fbf5] text-[#15803d]"
            }`}
          >
            {hasChanges ? (
              <>
                <GitCompareArrows size={15} strokeWidth={2.6} />
                {changedCount} field{changedCount === 1 ? "" : "s"} changed since Primary Feasibility.
              </>
            ) : (
              <>
                <CheckCircle2 size={15} strokeWidth={2.6} />
                No changes from Primary Feasibility.
              </>
            )}
          </div>

          {/* Variance table */}
          <div className="overflow-x-auto rounded-xl border-2 border-[#b7bcd2]">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-[#e7e9f6] text-[11px] font-black uppercase tracking-[0.08em] text-[#3f3f94]">
                  <th className="px-3.5 py-2.5">Field</th>
                  <th className="px-3.5 py-2.5">{baselineLabel}</th>
                  <th className="px-3.5 py-2.5">{currentLabel}</th>
                  <th className="px-3.5 py-2.5 text-center">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c6cbdd]">
                {rows.map((r) => (
                  <tr
                    key={r.field}
                    className={r.changed ? "bg-[#fdf6e7]" : "bg-white"}
                  >
                    <td className="px-3.5 py-2.5 font-bold text-ink-strong">{r.label}</td>
                    <td className="px-3.5 py-2.5 font-medium text-ink-soft tabular-nums">
                      {r.feasibilityValue}
                    </td>
                    <td
                      className={`px-3.5 py-2.5 tabular-nums ${
                        r.changed ? "font-black text-[#b45309]" : "font-medium text-ink-soft"
                      }`}
                    >
                      {r.costingValue}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      {r.changed ? (
                        <span className="inline-flex items-center rounded-full bg-[#f59e0b] px-2 py-0.5 text-[10.5px] font-black uppercase tracking-[0.06em] text-white">
                          Changed
                        </span>
                      ) : (
                        <span className="text-[12px] font-semibold text-ink-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end border-t border-hairline px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border-2 border-[#c7cae6] px-4 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
