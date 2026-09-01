"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineRow } from "@/lib/queries/pipeline-tracker";
import { OverallChip, Stepper, fmtDate } from "./parts";

type Status = "in_progress" | "on_hold" | "completed" | "dead";

export function PipelineOverview({ rows, status }: { rows: PipelineRow[]; status?: string }) {
  const router = useRouter();
  const counts = React.useMemo(
    () => ({
      total: rows.length,
      in_progress: rows.filter((r) => r.overall === "in_progress").length,
      on_hold: rows.filter((r) => r.overall === "on_hold").length,
      completed: rows.filter((r) => r.overall === "completed").length,
      dead: rows.filter((r) => r.overall === "dead").length,
    }),
    [rows],
  );

  // Where deals are sitting — count by current stage.
  const stageOrder = rows[0]?.stages ?? [];
  const dist = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.currentStageKey, (map.get(r.currentStageKey) ?? 0) + 1);
    return map;
  }, [rows]);
  const distMax = Math.max(1, ...stageOrder.map((s) => dist.get(s.key) ?? 0));

  const active: Status | null =
    status === "in_progress" || status === "on_hold" || status === "completed" || status === "dead"
      ? status
      : null;
  const shown = active ? rows.filter((r) => r.overall === active) : rows;

  const TILES: { key: keyof typeof counts; label: string; color: string }[] = [
    { key: "total", label: "Total", color: "#1f2547" },
    { key: "in_progress", label: "In Progress", color: "#454595" },
    { key: "on_hold", label: "On Hold", color: "#e8830c" },
    { key: "completed", label: "Completed", color: "#16a34a" },
    { key: "dead", label: "Dropped", color: "#d03232" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <div className="mb-4">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#d03232]">
          Admin Panel
        </span>
        <h1 className="mt-1 text-[24px] font-black tracking-tight text-[#1f2547]">
          {active === "completed"
            ? "Completed Enquiries"
            : active === "in_progress"
              ? "In-Progress Enquiries"
              : active === "on_hold"
                ? "On-Hold Enquiries"
                : active === "dead"
                  ? "Dropped Enquiries"
                  : "Pipeline Overview"}
        </h1>
        <p className="mt-1 text-[13px] text-[#777985]">
          Click any enquiry to open its full stage tracker.
        </p>
      </div>

      {/* Graph: stat tiles + progress bar + stage distribution */}
      <div className="mb-5 grid gap-3.5 lg:grid-cols-[1fr_1.3fr]">
        {/* Stat tiles + proportion bar */}
        <div className="rounded-lg border border-[#e2dfdc] bg-white p-4">
          <div className="grid grid-cols-5 gap-2">
            {TILES.map((t) => (
              <div key={t.key} className="text-center">
                <div className="text-[26px] font-black leading-none" style={{ color: t.color }}>
                  {counts[t.key]}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#777985]">
                  {t.label}
                </div>
              </div>
            ))}
          </div>
          {/* Proportion bar */}
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-[#f4f0e8]">
            {counts.total > 0 && (
              <>
                <div style={{ width: `${(counts.completed / counts.total) * 100}%`, background: "#16a34a" }} />
                <div style={{ width: `${(counts.in_progress / counts.total) * 100}%`, background: "#454595" }} />
                <div style={{ width: `${(counts.on_hold / counts.total) * 100}%`, background: "#e8830c" }} />
                <div style={{ width: `${(counts.dead / counts.total) * 100}%`, background: "#d03232" }} />
              </>
            )}
          </div>
          <div className="mt-2 text-[11px] font-semibold text-[#777985]">
            {counts.total > 0
              ? `${Math.round((counts.completed / counts.total) * 100)}% completed`
              : "No enquiries yet"}
          </div>
        </div>

        {/* Stage distribution */}
        <div className="rounded-lg border border-[#e2dfdc] bg-white p-4">
          <div className="mb-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-[#777985]">
            Where deals are sitting
          </div>
          <div className="flex flex-col gap-1.5">
            {stageOrder.map((s) => {
              const c = dist.get(s.key) ?? 0;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="w-[76px] shrink-0 text-right text-[11px] font-semibold text-[#57534e]">
                    {s.label}
                  </span>
                  <div className="h-3.5 flex-1 overflow-hidden rounded-[3px] bg-[#f4f0e8]">
                    <div
                      className="h-full rounded-[3px] bg-[#454595]"
                      style={{ width: `${(c / distMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-[11px] font-bold tabular-nums text-[#1f2547]">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Enquiry register — a dense table like the module registers; the whole
          row opens the detail. */}
      {shown.length === 0 ? (
        <div className="rounded-lg border border-[#e2dfdc] bg-white p-8 text-center text-[13px] text-[#777985]">
          No enquiries in this view.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#e2dfdc] bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e2dfdc] text-[10.5px] font-black uppercase tracking-[0.08em] text-[#777985]">
                <th className="px-3 py-2.5">SM No</th>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Sales Person</th>
                <th className="px-3 py-2.5">Current Stage</th>
                <th className="px-3 py-2.5">Progress</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.inquiryId}
                  onClick={() => router.push(`/pipeline/${r.inquiryId}` as Route)}
                  className="group cursor-pointer border-b border-[#f3f1ec] transition-colors last:border-0 hover:bg-[#faf9f6]"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-black text-[#1f2547]" style={{ fontFamily: "var(--font-mono, monospace)" }}>
                    {r.smNumber}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] font-semibold text-[#1f2547]">
                    <div className="max-w-[220px] truncate">{r.companyName}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-[#777985]">
                    {r.salesPerson ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="rounded-[3px] bg-[#f4f0e8] px-1.5 py-0.5 text-[11px] font-bold text-[#57534e]">
                      {r.currentStageLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="w-[210px]">
                      <Stepper stages={r.stages} minWidth={190} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <OverallChip overall={r.overall} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <Link
                      href={`/inquiries/${r.inquiryId}/edit` as Route}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-[#e2dfdc] bg-white px-2 text-[11px] font-bold text-[#454595] opacity-0 transition-all hover:border-[#454595] hover:bg-[#454595]/8 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Pencil className="h-3 w-3" strokeWidth={2.4} />
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
