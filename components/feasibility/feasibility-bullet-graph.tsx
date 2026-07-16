"use client";

import { FEAS_SCORE_BANDS } from "@/lib/feasibility/dimensions";
import type { FeasVerdict } from "@/lib/feasibility/score";

/**
 * Primary Feasibility v2 — a Stephen-Few bullet graph for one dimension score.
 *
 * Encodes a 0–100 score as a horizontal measure bar over three qualitative
 * bands (not-feasible / deviation / feasible) rendered as single-hue indigo
 * intensity — colour-blind-safe (intensity, not hue). The go/no-go threshold
 * (75 by default) is a vertical target marker, per Few's rule that a score
 * never stands alone. Brand RED appears only for the semantic not-feasible
 * measure state; every other state stays in the indigo family.
 *
 * Purely presentational — the editable controls live in the workspace row.
 */
export function FeasibilityBulletGraph({
  score,
  target = FEAS_SCORE_BANDS.feasible,
  verdict,
  height = 26,
}: {
  /** 0–100, or null when the dimension has not been scored yet. */
  score: number | null;
  /** Go/no-go threshold marker position (default 75). */
  target?: number;
  /** Derived band verdict — only `not_feasible` turns the measure red. */
  verdict: FeasVerdict;
  height?: number;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const pct = score == null ? 0 : clamp(score);
  const unscored = score == null;
  const notFeasible = verdict === "not_feasible";

  const measure = notFeasible
    ? "linear-gradient(90deg, #e0554f, #d32f2f)"
    : "linear-gradient(90deg, #6d6dcf, #3f3f94)";
  const measureH = Math.round(height * 0.44);

  return (
    <div
      className="relative w-full overflow-hidden rounded-[7px] border border-hairline"
      style={{ height }}
      role="img"
      aria-label={
        unscored
          ? "Not scored"
          : `Score ${pct} of 100, target ${target}, ${verdict.replace(/_/g, " ")}`
      }
    >
      {/* Qualitative bands — single-hue indigo, intensity rises toward the target zone. */}
      <div className="absolute inset-0 flex">
        <div style={{ width: `${FEAS_SCORE_BANDS.deviation}%`, background: "rgba(63,63,148,0.06)" }} />
        <div style={{ width: `${FEAS_SCORE_BANDS.feasible - FEAS_SCORE_BANDS.deviation}%`, background: "rgba(63,63,148,0.12)" }} />
        <div style={{ width: `${100 - FEAS_SCORE_BANDS.feasible}%`, background: "rgba(63,63,148,0.20)" }} />
      </div>

      {/* Measure bar — the score itself, vertically centred (Few's central measure). */}
      {!unscored && (
        <div
          className="absolute left-0 rounded-r-[4px] transition-[width] duration-300"
          style={{
            top: (height - measureH) / 2,
            height: measureH,
            width: `${pct}%`,
            background: measure,
            boxShadow: "0 1px 2px rgba(15,23,42,0.18)",
          }}
        />
      )}

      {/* Target marker — the go/no-go threshold. */}
      <div
        className="absolute top-[15%] h-[70%] w-[3px] rounded-full"
        style={{ left: `calc(${target}% - 1.5px)`, background: "#1f2430" }}
      />
    </div>
  );
}
