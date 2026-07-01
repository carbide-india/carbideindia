import * as React from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/flow/derive-stage";

/**
 * Stepper (ERP redesign — Phase 3).
 *
 * Presentational horizontal lifecycle stepper for the sales/production pipeline.
 * It renders the stages (Enquiry → Feasibility → Costing → Quotation →
 * Negotiation → Sales Order → Job Card → Production → Dispatch → Invoice) and
 * marks each done / current / upcoming / blocked.
 *
 * It is fed exclusively by `lib/flow/derive-stage.ts` (the `current` index comes
 * from `deriveItemStage` / `deriveSmStage`) — no stage logic lives here. The
 * default `steps` is the full pipeline; callers can pass a subset.
 *
 * Server-safe (no "use client") — purely visual. Node click is optional and only
 * enabled when `onSelect` is provided (then the caller must render it in a
 * client boundary).
 */

export type StepState = "done" | "current" | "upcoming" | "blocked";

export interface StepperStep {
  key: PipelineStage;
  label?: string;
}

interface StepperProps {
  /** Steps to render, in order. Defaults to the full pipeline. */
  steps?: ReadonlyArray<StepperStep>;
  /** Index (into `steps`) of the current stage — from derive-stage helpers. */
  current: number;
  /** Optional set of step keys that are blocked (guard failed). */
  blocked?: ReadonlySet<PipelineStage>;
  /** Optional click handler — makes nodes interactive (client boundary only). */
  onSelect?: (key: PipelineStage, index: number) => void;
  className?: string;
}

const DEFAULT_STEPS: ReadonlyArray<StepperStep> = PIPELINE_STAGES.map((key) => ({
  key,
}));

function stateFor(
  index: number,
  current: number,
  key: PipelineStage,
  blocked?: ReadonlySet<PipelineStage>,
): StepState {
  if (blocked?.has(key)) return "blocked";
  if (index < current) return "done";
  if (index === current) return "current";
  return "upcoming";
}

const NODE_STYLE: Record<StepState, React.CSSProperties> = {
  done: { background: "var(--color-brand)", color: "#fff", borderColor: "transparent" },
  current: {
    background: "#fff",
    color: "var(--color-brand-deep)",
    borderColor: "var(--color-brand)",
  },
  upcoming: {
    background: "var(--color-surface-track)",
    color: "var(--color-ink-subtle)",
    borderColor: "var(--color-hairline)",
  },
  blocked: {
    background: "var(--color-red-bg)",
    color: "var(--color-red-deep)",
    borderColor: "color-mix(in srgb, var(--color-red) 45%, transparent)",
  },
};

export function Stepper({
  steps = DEFAULT_STEPS,
  current,
  blocked,
  onSelect,
  className,
}: StepperProps) {
  return (
    <ol
      className={cn(
        "flex items-center gap-1 overflow-x-auto py-1",
        className,
      )}
      aria-label="Pipeline stage"
    >
      {steps.map((step, i) => {
        const state = stateFor(i, current, step.key, blocked);
        const label = step.label ?? PIPELINE_STAGE_LABELS[step.key];
        const isLast = i === steps.length - 1;
        const interactive = Boolean(onSelect);

        const node = (
          <span
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums transition-colors",
              state === "current" && "shadow-[0_0_0_3px_rgba(63,63,148,0.14)]",
            )}
            style={NODE_STYLE[state]}
          >
            {state === "done" ? (
              <Check size={13} strokeWidth={3} />
            ) : state === "blocked" ? (
              <Lock size={11} strokeWidth={2.6} />
            ) : (
              i + 1
            )}
          </span>
        );

        return (
          <li key={step.key} className="flex items-center">
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelect?.(step.key, i)}
                className="group inline-flex items-center gap-2 rounded-full px-1 py-0.5 hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                aria-current={state === "current" ? "step" : undefined}
              >
                {node}
                <span
                  className={cn(
                    "text-[12px] font-semibold whitespace-nowrap",
                    state === "upcoming" ? "text-ink-subtle" : "text-ink-strong",
                  )}
                >
                  {label}
                </span>
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-2 px-1"
                aria-current={state === "current" ? "step" : undefined}
              >
                {node}
                <span
                  className={cn(
                    "text-[12px] font-semibold whitespace-nowrap",
                    state === "upcoming" ? "text-ink-subtle" : "text-ink-strong",
                  )}
                >
                  {label}
                </span>
              </span>
            )}
            {!isLast && (
              <span
                className="mx-1.5 h-px w-6 shrink-0"
                style={{
                  background:
                    i < current
                      ? "var(--color-brand)"
                      : "var(--color-hairline-strong)",
                }}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
