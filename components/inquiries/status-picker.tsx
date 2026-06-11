"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";

interface Props<T extends string> {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  tones: Record<T, string>;
  /** Server action call; the picker handles optimistic flip + rollback. */
  onPick: (next: T) => Promise<{ ok: boolean } | { ok: false; error: string }>;
  /** Fired after the server confirms (e.g. "proceed_to_costing" toast). */
  onConfirmed?: (next: T) => void;
  ariaLabel: string;
}

/**
 * Optimistic status chip-picker for the inquiry sidebar + feasibility panel —
 * same interaction grammar as the tasks table's InlineStatusCell (flip
 * immediately, roll back on error, popover via Radix portal).
 */
export function StatusPicker<T extends string>({
  value,
  options,
  labels,
  tones,
  onPick,
  onConfirmed,
  ariaLabel,
}: Props<T>) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [shown, setShown] = React.useState<T>(value);
  React.useEffect(() => setShown(value), [value]);

  const tone = tones[shown] ?? "slate";

  async function pick(next: T) {
    setOpen(false);
    if (next === shown) return;
    const prev = shown;
    setShown(next);
    setPending(true);
    try {
      const res = await onPick(next);
      if (!res.ok) {
        setShown(prev);
        fireToast({
          message: "error" in res ? res.error : "Could not update status.",
          type: "error",
        });
      } else {
        fireToast({ message: `Status set to ${labels[next]}.` });
        onConfirmed?.(next);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={`${ariaLabel}: ${labels[shown] ?? shown}. Click to change.`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[13px] font-bold transition-colors"
          style={{
            background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
            color: `var(--color-${tone}-deep)`,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
            border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
          }}
        >
          {labels[shown] ?? shown}
          {pending ? (
            <Loader2
              size={12}
              strokeWidth={2.4}
              style={{ animation: "spinFast 0.8s linear infinite" }}
            />
          ) : (
            <ChevronDown size={12} strokeWidth={2.6} />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-[80] min-w-[220px] rounded-xl border border-hairline bg-white p-1.5 shadow-lg"
        >
          {options.map((s) => {
            const optTone = tones[s] ?? "slate";
            const active = s === shown;
            return (
              <button
                key={s}
                type="button"
                onClick={() => void pick(s)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: `var(--color-${optTone})` }}
                  />
                  {labels[s] ?? s}
                </span>
                {active && <Check size={14} strokeWidth={2.6} />}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
