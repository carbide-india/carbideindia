"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Lock, Loader2 } from "lucide-react";
import {
  COSTING_DONE_STATUS_COLORS,
  COSTING_DONE_STATUS_LABELS,
  type CostingDoneStatus,
} from "@/db/enums";
import { Chip } from "@/components/inquiries/chip";
import { fireToast } from "@/lib/toast";
import { setCostingStatus, setCostingTargetDate } from "@/app/(app)/costings/actions";
import { costingDaysToTarget, costingBucketOf } from "@/lib/costing/buckets";

/**
 * The costing's stage controls: which house bucket it sits in, the Need Info
 * note ("what else do we need before we can fix a price?"), and the target date
 * the register flags overdue against.
 *
 * `costing_approved` is never offered here — approval happens on the decision
 * panel, where the route and vendor are picked, the final unit cost is snapshot
 * and the row is locked. A locked row shows its state read-only and says how to
 * reopen it, rather than silently failing on the server.
 */

/** The statuses this panel offers, in house order. Mirrors the server allow-list. */
const SETTABLE = ["not_done", "draft", "need_info", "pending_approval"] as const satisfies
  readonly CostingDoneStatus[];
type SettableStatus = (typeof SETTABLE)[number];

interface Props {
  costingId: string;
  status: CostingDoneStatus;
  needInfoNote: string | null;
  targetDate: Date | null;
  isLocked: boolean;
}

/** A Date → the `YYYY-MM-DD` an <input type="date"> expects, in LOCAL time. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CostingStagePanel({
  costingId,
  status,
  needInfoNote,
  targetDate,
  isLocked,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [draftStatus, setDraftStatus] = React.useState<CostingDoneStatus>(status);
  const [note, setNote] = React.useState(needInfoNote ?? "");
  const [date, setDate] = React.useState(toDateInput(targetDate));
  const [error, setError] = React.useState<string | null>(null);

  const bucket = costingBucketOf(status);
  const days = costingDaysToTarget(targetDate);
  const overdue = targetDate != null && bucket !== "costing_approved" && days != null && days < 0;

  function saveStatus(next: SettableStatus) {
    setError(null);
    if (next === "need_info" && !note.trim()) {
      setDraftStatus(next);
      setError("Say what information is missing before setting Need Info.");
      return;
    }
    setDraftStatus(next);
    startTransition(async () => {
      const res = await setCostingStatus({
        costingId,
        status: next,
        needInfoNote: note.trim() || undefined,
      });
      if (res.ok) {
        fireToast({ message: `Costing moved to ${COSTING_DONE_STATUS_LABELS[next]}.` });
        router.refresh();
      } else {
        setDraftStatus(status);
        setError(res.error);
      }
    });
  }

  function saveDate(next: string) {
    setError(null);
    setDate(next);
    startTransition(async () => {
      const res = await setCostingTargetDate({
        costingId,
        targetDate: next === "" ? null : next,
      });
      if (res.ok) {
        fireToast({ message: next ? "Target date saved." : "Target date cleared." });
        router.refresh();
      } else {
        setDate(toDateInput(targetDate));
        setError(res.error);
      }
    });
  }

  return (
    <section
      className="rounded-section border border-hairline bg-surface-card p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          Costing Stage
        </h2>
        <span className="inline-flex items-center gap-2">
          <Chip
            label={COSTING_DONE_STATUS_LABELS[status]}
            tone={COSTING_DONE_STATUS_COLORS[status]}
          />
          {pending && (
            <Loader2 size={14} strokeWidth={2.6} className="animate-spin text-ink-subtle" />
          )}
        </span>
      </div>

      {isLocked ? (
        <p className="flex items-start gap-2 text-[13px] font-semibold text-ink-soft">
          <Lock size={15} strokeWidth={2.4} className="mt-px shrink-0" />
          This costing is approved and locked. Unlock the decision to change its status —
          the approved unit cost is what every quotation line is priced against.
        </p>
      ) : (
        <div
          role="group"
          aria-label="Costing status"
          className="flex flex-wrap gap-2"
        >
          {SETTABLE.map((s) => {
            const active = draftStatus === s;
            return (
              <button
                key={s}
                type="button"
                disabled={pending}
                aria-pressed={active}
                onClick={() => saveStatus(s)}
                className="rounded-pill border px-3 py-1.5 text-[12.5px] font-bold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f94]"
                style={
                  active
                    ? {
                        // Tone comes from the enum colour token, same treatment
                        // as the Chip — never a hardcoded hex.
                        borderColor: `color-mix(in srgb, var(--color-${COSTING_DONE_STATUS_COLORS[s]}) 55%, transparent)`,
                        background: `color-mix(in srgb, var(--color-${COSTING_DONE_STATUS_COLORS[s]}) 14%, transparent)`,
                        color: `var(--color-${COSTING_DONE_STATUS_COLORS[s]}-deep)`,
                      }
                    : { borderColor: "var(--color-hairline)", color: "var(--color-ink-soft)" }
                }
              >
                {COSTING_DONE_STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      )}

      {/* Need Info note — always visible once written, because the record of what
          was asked for outlives the bucket it was asked in. */}
      {(!isLocked || (needInfoNote ?? "") !== "") && (
        <div className="mt-5">
          <label
            htmlFor="costing-need-info"
            className="block text-[12px] font-bold text-ink-subtle"
          >
            Information needed to quote
          </label>
          <p className="mt-0.5 text-[12px] text-ink-subtle">
            What is still missing before a price can be fixed. Kept on the record after the
            costing moves on.
          </p>
          {isLocked ? (
            <p className="mt-2 text-[13px] text-ink-strong">{needInfoNote}</p>
          ) : (
            <>
              <textarea
                id="costing-need-info"
                value={note}
                rows={3}
                maxLength={2000}
                disabled={pending}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. drawing revision not shared; tolerance on the bore unconfirmed"
                className="mt-2 w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[13px] text-ink-strong focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                disabled={pending || !note.trim()}
                onClick={() => saveStatus("need_info")}
                className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
              >
                Save note &amp; set Need Info
              </button>
            </>
          )}
        </div>
      )}

      {/* Target date */}
      <div className="mt-5">
        <label
          htmlFor="costing-target-date"
          className="flex items-center gap-1.5 text-[12px] font-bold text-ink-subtle"
        >
          <CalendarClock size={14} strokeWidth={2.4} />
          Target date
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id="costing-target-date"
            type="date"
            value={date}
            disabled={pending}
            onChange={(e) => saveDate(e.target.value)}
            className="rounded-lg border border-hairline bg-surface-card px-3 py-1.5 text-[13px] tabular-nums text-ink-strong focus:border-brand focus:outline-none"
          />
          {date !== "" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => saveDate("")}
              className="text-[12.5px] font-bold text-ink-subtle hover:text-ink-strong disabled:opacity-50"
            >
              Clear
            </button>
          )}
          {overdue && days != null && (
            <span
              className="text-[12.5px] font-bold"
              style={{ color: "var(--color-red-deep)" }}
            >
              {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} overdue
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] text-ink-subtle">
          Optional. Un-dated costings are legal — they simply never show up in the
          register&apos;s Overdue tile.
        </p>
      </div>

      {error && (
        <p
          className="mt-4 text-[13px] font-semibold"
          style={{ color: "var(--color-red-deep)" }}
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
