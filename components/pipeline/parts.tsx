"use client";

import { Check, Pause, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineRow, PipelineStageCell, StageState } from "@/lib/queries/pipeline-tracker";

const STATE_STYLE: Record<StageState, string> = {
  done: "border-[#16a34a] bg-[#16a34a] text-white",
  active: "border-[#454595] bg-[#454595] text-white",
  pending: "border-[#d8d4cc] bg-white text-transparent",
  dead: "border-[#d03232] bg-[#d03232] text-white",
  hold: "border-[#e8830c] bg-[#e8830c] text-white",
};

export function StageDot({ state, title, size = 18 }: { state: StageState; title?: string; size?: number }) {
  return (
    <span
      title={title}
      className={cn(
        "relative z-10 grid shrink-0 place-items-center rounded-full border-[1.5px] transition-transform duration-200 hover:scale-110",
        STATE_STYLE[state],
        state === "active" && "ring-2 ring-[#454595]/25",
      )}
      style={{ width: size, height: size }}
    >
      {state === "done" ? (
        <Check size={Math.round(size * 0.6)} strokeWidth={3} />
      ) : state === "dead" ? (
        <X size={Math.round(size * 0.6)} strokeWidth={3} />
      ) : state === "hold" ? (
        <Pause size={Math.round(size * 0.55)} strokeWidth={3} fill="currentColor" />
      ) : state === "active" ? (
        <span className="rounded-full bg-white" style={{ width: size * 0.33, height: size * 0.33 }} />
      ) : null}
    </span>
  );
}

/** Horizontal stepper of the nine stage dots with connecting lines. */
export function Stepper({ stages, minWidth = 520 }: { stages: PipelineStageCell[]; minWidth?: number }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-center" style={{ minWidth }}>
        {stages.map((st, i) => (
          <span key={st.key} className="flex flex-1 items-center last:flex-none">
            <StageDot state={st.state} title={st.label} />
            {i < stages.length - 1 && (
              <span
                className={cn("h-[2px] flex-1", st.state === "done" ? "bg-[#16a34a]" : "bg-[#e2dfdc]")}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Full-width, LABELLED stepper for the row-hover preview panel — the nine stage
 * names above their dots with connecting lines. A stage counts as "reached"
 * (green line into it) once it is done / active / on-hold.
 */
/**
 * Edge-to-edge stepper. `mode`:
 *  - "full"   labels above dots + connectors (standalone use)
 *  - "labels" just the stage names, positioned exactly over where the dots sit
 *             (rendered once as a shared header so each row needn't repeat them)
 *  - "dots"   just dots + connectors (each enquiry row), aligned under the header
 * First dot is flush-left (under the SM No column), last flush-right.
 */
export function StepperWide({
  stages,
  mode = "full",
}: {
  stages: PipelineStageCell[];
  mode?: "full" | "labels" | "dots";
}) {
  const reached = (s: StageState) => s === "done" || s === "active" || s === "hold";
  const last = stages.length - 1;
  const showLabels = mode !== "dots";
  const showDots = mode !== "labels";
  return (
    <div className={cn("overflow-x-auto", showLabels && "pt-7")}>
      <div className="flex min-w-[720px] items-center">
        {stages.map((st, i) => (
          <span key={st.key} className="flex flex-1 items-center last:flex-none">
            <span className="relative shrink-0">
              {showLabels && (
                <span
                  className={cn(
                    "absolute -top-7 whitespace-nowrap text-[11px] font-bold normal-case text-[#57534e]",
                    i === 0 ? "left-0" : i === last ? "right-0" : "left-1/2 -translate-x-1/2",
                  )}
                >
                  {st.label}
                </span>
              )}
              {/* In "labels" mode the dot is kept (invisible) purely to reserve
                  the same width so labels line up with the dot rows below. */}
              <span className={cn(!showDots && "invisible")}>
                <StageDot state={st.state} title={st.label} size={24} />
              </span>
            </span>
            {i < last && (
              <span
                className={cn(
                  "h-[2px] flex-1",
                  !showDots
                    ? "invisible"
                    : reached(st.state)
                      ? "bg-[#16a34a]"
                      : "bg-[#e2dfdc]",
                )}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function OverallChip({ overall }: { overall: PipelineRow["overall"] }) {
  const map = {
    completed: { label: "Completed", cls: "border-[#16a34a]/30 bg-[#16a34a]/10 text-[#15803d]" },
    in_progress: { label: "In Progress", cls: "border-[#454595]/30 bg-[#454595]/10 text-[#454595]" },
    dead: { label: "Dropped", cls: "border-[#d03232]/30 bg-[#d03232]/10 text-[#d03232]" },
    on_hold: { label: "On Hold", cls: "border-[#e8830c]/30 bg-[#e8830c]/10 text-[#b45309]" },
  }[overall];
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded-[4px] border px-2 py-0.5 text-[11px] font-bold",
        map.cls,
      )}
    >
      {map.label}
    </span>
  );
}

export function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
