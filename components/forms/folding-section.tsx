"use client";

import * as React from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";

/**
 * Progressive "Google-Forms style" multi-section form chrome (forms/masters
 * redesign — Phase C). A form declares N sections; one is open at a time, a
 * completed section folds into an inline summary with an Edit affordance, and
 * "Continue" validates just that section's fields before advancing.
 *
 * Form-agnostic on purpose: the caller passes a `validate(fields)` that runs
 * react-hook-form's `trigger` for the given field names, so this file has no
 * dependency on any specific form's schema.
 */

export interface FoldingController {
  active: number;
  count: number;
  isOpen: (i: number) => boolean;
  isDone: (i: number) => boolean;
  /** Open section i for editing (jump back / forward to a reached section). */
  open: (i: number) => void;
  /** Validate section i's fields; on success mark it done and open the next. */
  next: (i: number, fields: string[]) => Promise<void>;
}

/**
 * Drives a folding form. `validate` should call RHF's trigger, e.g.
 * `(fields) => trigger(fields as never)`.
 */
export function useFoldingForm(
  count: number,
  validate: (fields: string[]) => Promise<boolean>,
): FoldingController {
  const [active, setActive] = React.useState(0);
  const [done, setDone] = React.useState<Set<number>>(() => new Set());

  const open = React.useCallback((i: number) => setActive(i), []);

  const next = React.useCallback(
    async (i: number, fields: string[]) => {
      const ok = fields.length === 0 ? true : await validate(fields);
      if (!ok) return;
      setDone((prev) => new Set(prev).add(i));
      if (i + 1 < count) setActive(i + 1);
      else setActive(-1); // all sections complete → collapse the last
    },
    [count, validate],
  );

  return {
    active,
    count,
    isOpen: (i) => active === i,
    isDone: (i) => done.has(i),
    open,
    next,
  };
}

interface SectionProps {
  ctl: FoldingController;
  index: number;
  title: string;
  /** RHF field names validated when this section's Continue is pressed. */
  fields: string[];
  /** Helper text shown under the header when the section is open. */
  hint?: React.ReactNode;
  /** Inline summary shown when the section is collapsed + done. */
  summary?: React.ReactNode;
  /** Hide the Continue button (e.g. the final section uses the form submit). */
  hideContinue?: boolean;
  children: React.ReactNode;
}

export function FoldingSection({
  ctl,
  index,
  title,
  fields,
  hint,
  summary,
  hideContinue,
  children,
}: SectionProps) {
  const open = ctl.isOpen(index);
  const done = ctl.isDone(index);
  const [advancing, setAdvancing] = React.useState(false);

  return (
    <section
      className={`rounded-section border bg-surface-card transition-colors ${
        open ? "border-brand/40" : "border-hairline"
      }`}
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <button
        type="button"
        onClick={() => ctl.open(index)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
            done
              ? "bg-[var(--color-green,#16a34a)] text-white"
              : open
                ? "bg-brand text-white"
                : "bg-surface-soft text-ink-subtle"
          }`}
        >
          {done ? <Check size={14} strokeWidth={3} /> : index + 1}
        </span>
        <span className="flex-1">
          <span className="block text-[10px] uppercase tracking-[0.16em] font-bold text-ink-subtle">
            Step {index + 1} of {ctl.count}
          </span>
          <span className="block text-[15px] font-semibold text-ink-strong">
            {title}
          </span>
        </span>
        {!open && done && (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand">
            <Pencil size={13} strokeWidth={2.4} />
            Edit
          </span>
        )}
        {open && (
          <ChevronDown size={18} strokeWidth={2.2} className="text-ink-subtle" />
        )}
      </button>

      {open ? (
        <div className="border-t border-hairline px-5 py-5">
          {hint && (
            <p className="mb-4 text-[13px] text-ink-subtle">{hint}</p>
          )}
          <div className="flex flex-col gap-5">{children}</div>
          {!hideContinue && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={advancing}
                onClick={async () => {
                  setAdvancing(true);
                  try {
                    await ctl.next(index, fields);
                  } finally {
                    setAdvancing(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-chip bg-brand px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      ) : (
        done &&
        summary && (
          <div className="border-t border-hairline px-5 py-3 text-[13px] text-ink-soft">
            {summary}
          </div>
        )
      )}
    </section>
  );
}
