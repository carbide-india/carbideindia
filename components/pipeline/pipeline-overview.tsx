"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, Pencil, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineRow, PipelineStageCell, StageState } from "@/lib/queries/pipeline-tracker";
import { OverallChip, StageDot, StepperWide } from "./parts";

type Status = "in_progress" | "on_hold" | "completed" | "dead";

const PAGE_SIZE = 8;

/** What each stepper colour means — shown as a legend above the list. */
const LEGEND: { state: StageState; label: string }[] = [
  { state: "done", label: "Completed" },
  { state: "active", label: "In Progress" },
  { state: "pending", label: "Not started" },
  { state: "hold", label: "On hold" },
  { state: "dead", label: "Dropped" },
];

/**
 * A single, linear view of the pipeline for the stepper: exactly ONE current
 * stage. Everything before the current stage reads done, the current stage is
 * active, everything after is pending. A frozen (on-hold / cancelled) or
 * completed / dropped enquiry paints the whole bar in that one state.
 */
function displayStages(r: PipelineRow): PipelineStageCell[] {
  const idx = r.stages.findIndex((s) => s.key === r.currentStageKey);
  return r.stages.map((s, i) => {
    let state: StageState;
    if (r.frozen === "cancelled" || r.overall === "dead") state = "dead";
    else if (r.frozen === "on_hold" || r.overall === "on_hold") state = "hold";
    else if (r.overall === "completed") state = "done";
    else if (idx < 0) state = i === 0 ? "active" : "pending";
    else if (i < idx) state = "done";
    else if (i === idx) state = "active";
    else state = "pending";
    return { ...s, state };
  });
}

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

  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(() => {
    const base = active ? rows.filter((r) => r.overall === active) : rows;
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((r) =>
      `${r.smNumber} ${r.companyName ?? ""} ${r.salesPerson ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, active, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

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
        <div className="pt-enter rounded-lg border border-[#e2dfdc] bg-white p-4">
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
        <div className="pt-enter rounded-lg border border-[#e2dfdc] bg-white p-4" style={{ animationDelay: "80ms" }}>
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

      {/* Search + colour legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-full max-w-[380px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a8a8a8]" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by SM no, company, or sales person…"
            className="h-10 w-full rounded-lg border border-[#e2dfdc] bg-white pl-9 pr-9 text-[13.5px] text-[#1f2547] outline-none transition-colors focus:border-[#454595] focus:ring-2 focus:ring-[#454595]/20"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setPage(1);
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#a8a8a8] hover:text-[#1f2547]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          {LEGEND.map((l) => (
            <span key={l.state} className="inline-flex items-center gap-1.5">
              <StageDot state={l.state} size={15} />
              <span className="text-[11.5px] font-semibold text-[#57534e]">{l.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Enquiry register — each row shows its stage progress inline; the whole
          row opens the detail. */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-[#e2dfdc] bg-white p-8 text-center text-[13px] text-[#777985]">
          {q ? "No enquiries match your search." : "No enquiries in this view."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[#e2dfdc] bg-white">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#e2dfdc] text-[10.5px] font-black uppercase tracking-[0.08em] text-[#777985]">
                  <th className="px-3 py-2.5">SM No</th>
                  <th className="px-3 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Sales Person</th>
                  <th className="px-3 py-2.5">Current Stage</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              {pageRows.map((r, i) => (
                <tbody
                  key={r.inquiryId}
                  className={cn(
                    "group border-b border-[#e2dfdc] last:border-0",
                    // Zebra striping so each enquiry reads as its own block.
                    i % 2 === 0 ? "bg-white" : "bg-[#f5f2ec]",
                  )}
                >
                  <tr
                    onClick={() => router.push(`/pipeline/${r.inquiryId}` as Route)}
                    className="cursor-pointer transition-colors group-hover:bg-[#efeae0]"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-black text-[#1f2547]" style={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {r.smNumber}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-[#1f2547]">
                      <div className="max-w-[260px] truncate">{r.companyName}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-[#777985]">
                      {r.salesPerson ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="rounded-[3px] bg-[#f4f0e8] px-1.5 py-0.5 text-[11px] font-bold text-[#57534e]">
                        {r.currentStageLabel}
                      </span>
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
                  {/* Full stage progress (labels + dots) per row, always visible. */}
                  <tr>
                    <td colSpan={6} className="p-0">
                      <div className="px-3 pb-3 pt-1">
                        <StepperWide stages={displayStages(r)} mode="full" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              ))}
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] text-[#777985]">
              Showing{" "}
              <span className="font-bold text-[#1f2547]">
                {(clampedPage - 1) * PAGE_SIZE + 1}–
                {Math.min(clampedPage * PAGE_SIZE, filtered.length)}
              </span>{" "}
              of <span className="font-bold text-[#1f2547]">{filtered.length}</span>
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage <= 1}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e2dfdc] bg-white px-2.5 text-[12px] font-bold text-[#1f2547] transition-colors hover:border-[#454595] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <span className="px-1 text-[12px] font-semibold text-[#57534e]">
                  Page {clampedPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={clampedPage >= totalPages}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e2dfdc] bg-white px-2.5 text-[12px] font-bold text-[#1f2547] transition-colors hover:border-[#454595] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
