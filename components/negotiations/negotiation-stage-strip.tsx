"use client";

import * as React from "react";
import { Check } from "lucide-react";
import {
  NEGOTIATION_STAGES,
  NEGOTIATION_STAGE_LABELS,
  NEGOTIATION_STAGE_COLORS,
  type NegotiationStage,
} from "@/db/enums";

/**
 * The 4-stage Proforma-Invoice progress strip:
 *   Quote Send → PI Issued → Negotiation Awarded → Customer PO Received
 *
 * Driven by `negotiationStage`; each segment reads DONE (behind the current
 * stage — filled + tick), CURRENT (the live stage — solid tone) or UPCOMING
 * (ahead — muted). Colours come from NEGOTIATION_STAGE_COLORS so the strip
 * stays in lockstep with the pills used everywhere else.
 */
export function NegotiationStageStrip({ stage }: { stage: NegotiationStage }) {
  const currentIdx = NEGOTIATION_STAGES.indexOf(stage);

  return (
    <ol className="flex w-full items-stretch gap-1.5" aria-label="Proforma invoice progress">
      {NEGOTIATION_STAGES.map((s, i) => {
        const tone = NEGOTIATION_STAGE_COLORS[s];
        const done = i < currentIdx;
        const current = i === currentIdx;
        const active = done || current;
        return (
          <li key={s} className="flex-1">
            <div
              className="flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 transition-colors"
              aria-current={current ? "step" : undefined}
              style={{
                background: active
                  ? `color-mix(in srgb, var(--color-${tone}) ${current ? 16 : 10}%, transparent)`
                  : "var(--color-surface-soft)",
                borderColor: active
                  ? `color-mix(in srgb, var(--color-${tone}) ${current ? 55 : 34}%, transparent)`
                  : "var(--color-hairline)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold tabular-nums"
                  style={{
                    background: active ? `var(--color-${tone})` : "var(--color-hairline)",
                    color: active ? "#fff" : "var(--color-ink-subtle)",
                  }}
                >
                  {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className="text-[10.5px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    color: active ? `var(--color-${tone}-deep)` : "var(--color-ink-subtle)",
                  }}
                >
                  {current ? "Now" : done ? "Done" : "Next"}
                </span>
              </div>
              <span
                className="text-[13px] font-bold leading-tight"
                style={{
                  color: active ? "var(--color-ink-strong)" : "var(--color-ink-muted)",
                }}
              >
                {NEGOTIATION_STAGE_LABELS[s]}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
