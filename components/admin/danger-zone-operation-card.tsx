"use client";

import type { ReactNode } from "react";
import type { DangerZoneOperationMeta } from "@/lib/danger-zone/operations";

const MONO = "var(--font-mono-display)";

export interface OperationStat {
  label: string;
  value: number;
  /** "danger" = rows this run destroys; "safe" = rows it protects. */
  tone?: "danger" | "safe" | "neutral";
  hint?: string;
}

interface Props {
  meta: DangerZoneOperationMeta;
  /** Pre-rendered lucide icon (RSC can't serialise the component itself). */
  icon: ReactNode;
  /** Mono uppercase strip above the title, e.g. "IRREVERSIBLE · ALL USERS". */
  eyebrow: string;
  stats: OperationStat[];
  /** Retention-window control, rendered left of the run button. */
  control?: ReactNode;
  /** Extra line under the stats (oldest row, cutoff date, breakdown). */
  footnote?: ReactNode;
  actionDisabled?: boolean;
  /** Why the run button is disabled - rendered next to it, and as its title. */
  actionHint?: string;
  onOpen: () => void;
}

/**
 * One Danger Zone operation, rendered as a dense card: what it is, what it will
 * hit RIGHT NOW (real counts, never estimates), the window control, and the
 * button that opens the confirmation dialog. The card itself never mutates
 * anything - it only opens the dialog.
 */
export function DangerZoneOperationCard({
  meta,
  icon,
  eyebrow,
  stats,
  control,
  footnote,
  actionDisabled = false,
  actionHint,
  onOpen,
}: Props) {
  const accent = `var(--color-${meta.tone})`;
  const accentDeep = `var(--color-${meta.tone}-deep)`;
  const accentBg = `var(--color-${meta.tone}-bg)`;

  return (
    <article
      className="rounded-2xl border border-[#e6e8ec] bg-white p-5"
      style={{
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{
            background: accentBg,
            color: accentDeep,
            border: `1px solid color-mix(in srgb, ${accent} 22%, transparent)`,
          }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className="block text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ fontFamily: MONO, color: accentDeep }}
          >
            {eyebrow}
          </span>
          <h3 className="mt-1 text-[16px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
            {meta.title}
          </h3>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[#6b7280]">
            {meta.summary}
          </p>
        </div>
      </div>

      {stats.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
          {stats.map((s) => (
            <div key={s.label} className="min-w-[110px]">
              <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#8b91a0]">
                {s.label}
              </dt>
              <dd
                className="mt-0.5 text-[24px] font-extrabold leading-none tabular-nums"
                style={{
                  color:
                    s.tone === "danger" && s.value > 0
                      ? accentDeep
                      : s.tone === "safe"
                        ? "#0f9d58"
                        : "#3a4152",
                }}
              >
                {s.value.toLocaleString("en-IN")}
                {s.hint && (
                  <span className="ml-1.5 align-middle text-[11.5px] font-semibold text-[#8b91a0]">
                    {s.hint}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {footnote && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#8b91a0]">{footnote}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f3] pt-4">
        <div className="flex flex-wrap items-center gap-2">{control}</div>
        <div className="flex items-center gap-3">
          {actionDisabled && actionHint && (
            <span className="text-[12px] font-semibold text-[#8b91a0]">
              {actionHint}
            </span>
          )}
          <button
            type="button"
            onClick={onOpen}
            disabled={actionDisabled}
            title={actionDisabled ? actionHint : undefined}
            className="rounded-lg px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
          >
            {meta.runLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
