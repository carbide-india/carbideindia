"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { BadgeCheck, Check, ChevronDown, Loader2, Lock, SquarePen, Undo2 } from "lucide-react";
import {
  COSTING_DONE_STATUS_COLORS,
  COSTING_DONE_STATUS_LABELS,
  type CostingDoneStatus,
} from "@/db/enums";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fireToast } from "@/lib/toast";
import {
  approveCostingRecommended,
  setCostingStatus,
  unlockCostingDecision,
} from "@/app/(app)/costings/actions";

/**
 * The Costing register's Status cell, editable in place.
 *
 * Changing a bucket used to mean either opening the cost sheet or ticking rows
 * and using the bulk bar — discoverable only if you already knew. The chip is
 * now the control.
 *
 * Special cases:
 *   • `need_info` — it carries a note ("what else do we need before we can fix a
 *     price?"), and a note is per-costing by definition, so this routes to the
 *     sheet rather than writing a blank one. The server refuses it in bulk for
 *     the same reason.
 *   • `costing_approved` — this signs off the RECOMMENDED option in one click
 *     (snapshots the final unit cost + locks the row). Approving a
 *     non-recommended route or a different vendor still goes through the sheet,
 *     where the override reason is captured.
 *   • a locked (approved) row — its chip offers "Reopen (undo approval)", which
 *     reverses the approval back to Pending Approval so a mistaken sign-off can
 *     be corrected here. Both approve and reopen are open to any signed-in user
 *     (owner request, 2026-08-29).
 */

/** Buckets that can be set straight from the chip, in house order. */
const INLINE_SETTABLE = ["not_done", "draft", "pending_approval"] as const satisfies
  readonly CostingDoneStatus[];
/** Narrowed to what the server's allow-list accepts — never the full union. */
type InlineSettable = (typeof INLINE_SETTABLE)[number];

export function CostingStatusCell({
  costingId,
  inquiryItemId,
  status,
  bucket,
  isLocked,
}: {
  /** null when the line has no cost sheet yet — nothing to set a status on. */
  costingId: string | null;
  inquiryItemId: string;
  /** Raw stored status; a legacy value still renders under its bucket. */
  status: CostingDoneStatus | null;
  bucket: CostingDoneStatus;
  isLocked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const shown = status ?? bucket;
  const chip = (
    <Chip label={COSTING_DONE_STATUS_LABELS[shown]} tone={COSTING_DONE_STATUS_COLORS[shown]} />
  );

  // A line with no cost sheet is "Not Done" by absence — there is no row to
  // update, so the chip stays a label and says why.
  if (costingId == null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {chip}
        <span className="text-[11px] font-semibold text-ink-subtle">no sheet</span>
      </span>
    );
  }

  // A locked (approved) row is not directly re-bucketed — but a mistaken
  // approval must be fixable, so the chip opens a small menu whose only action
  // reopens it (undoes the approval → Pending Approval). Once reopened the row
  // is unlocked and the full status menu below applies.
  if (isLocked) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={`Status ${COSTING_DONE_STATUS_LABELS[shown]} — approved and locked; reopen to change`}
            className="group inline-flex items-center gap-1 rounded-pill outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-[#3f3f94] disabled:opacity-60"
            onClick={(e) => e.stopPropagation()}
          >
            {chip}
            {pending ? (
              <Loader2 size={12} style={{ animation: "spinFast 0.8s linear infinite" }} />
            ) : (
              <>
                <Lock
                  size={12}
                  strokeWidth={2.6}
                  className="shrink-0 text-ink-subtle transition-colors group-hover:text-ink-strong"
                />
                {/* The dropdown arrow signals the locked chip is clickable —
                    without it the lock reads as "no action here". */}
                <ChevronDown
                  size={12}
                  strokeWidth={2.8}
                  className="shrink-0 text-ink-subtle opacity-50 transition-opacity group-hover:opacity-100"
                />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-[236px] p-1">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold leading-snug text-ink-subtle">
            Approved &amp; locked. Reopen it if it was approved by mistake.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void reopen()}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-bold text-[#b45309] transition-colors hover:bg-[#fdf6e7] disabled:opacity-60"
          >
            <Undo2 size={14} strokeWidth={2.6} className="shrink-0" />
            Reopen (undo approval)
            <span className="ml-auto text-[11px] font-bold text-ink-subtle">→ Pending</span>
          </button>
        </PopoverContent>
      </Popover>
    );
  }

  async function apply(next: InlineSettable) {
    if (next === shown) {
      setOpen(false);
      return;
    }
    setPending(true);
    try {
      const res = await setCostingStatus({ costingId: costingId!, status: next });
      if (res.ok) {
        fireToast({ message: `Moved to ${COSTING_DONE_STATUS_LABELS[next]}.` });
        setOpen(false);
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setPending(false);
    }
  }

  // Reverse a mistaken approval: unlock the row back to Pending Approval, from
  // where the normal status menu can move it anywhere again.
  async function reopen() {
    setPending(true);
    try {
      const res = await unlockCostingDecision(inquiryItemId);
      if (res.ok) {
        fireToast({ message: "Reopened — now Pending Approval. You can change the status." });
        setOpen(false);
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setPending(false);
    }
  }

  // One-click approval of the RECOMMENDED option (cheapest valid route). The
  // server re-checks the approver flag + feasibility gate and snapshots/locks;
  // choosing a non-recommended route or a different vendor still goes via the
  // sheet, where the override reason is captured.
  async function approveNow() {
    setPending(true);
    try {
      const res = await approveCostingRecommended(inquiryItemId);
      if (res.ok) {
        fireToast({ message: "Costing approved and locked." });
        setOpen(false);
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={`Status ${COSTING_DONE_STATUS_LABELS[shown]} — change it`}
          className="group inline-flex items-center gap-1 rounded-pill outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-[#3f3f94] disabled:opacity-60"
          // The cell sits inside a row that navigates on click — keep this local.
          onClick={(e) => e.stopPropagation()}
        >
          {chip}
          {pending ? (
            <Loader2 size={12} style={{ animation: "spinFast 0.8s linear infinite" }} />
          ) : (
            <ChevronDown
              size={12}
              strokeWidth={2.8}
              className="shrink-0 text-ink-subtle opacity-50 transition-opacity group-hover:opacity-100"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[212px] p-1">
        {INLINE_SETTABLE.map((s) => {
          const active = s === shown;
          return (
            <button
              key={s}
              type="button"
              onClick={() => void apply(s)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              <Check
                size={14}
                strokeWidth={3}
                className={active ? "text-[#3f3f94]" : "invisible"}
              />
              {COSTING_DONE_STATUS_LABELS[s]}
            </button>
          );
        })}

        <div className="my-1 h-px bg-hairline" />

        {/* Need Info needs its note, so this opens the sheet instead of
            silently writing an empty one. */}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            router.push(`/costings/${costingId}` as Route);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft"
        >
          <SquarePen size={14} strokeWidth={2.6} className="shrink-0" />
          {COSTING_DONE_STATUS_LABELS.need_info}
          <span className="ml-auto text-[11px] font-bold text-ink-subtle">needs a note</span>
        </button>

        {/* Costing Approved — signs off the recommended option in one click
            (snapshots the final cost + locks the row). Open to any signed-in
            user (owner request, 2026-08-29). To approve a NON-recommended route
            or pin a different vendor, open the sheet — that path needs a reason.
            A checkmark shows when the line is already approved. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => void approveNow()}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-bold text-[#1c7a44] transition-colors hover:bg-[#eef8f2] disabled:opacity-60"
        >
          {shown === "costing_approved" ? (
            <Check size={14} strokeWidth={3} className="shrink-0 text-[#1c7a44]" />
          ) : (
            <BadgeCheck size={14} strokeWidth={2.6} className="shrink-0 text-[#1c7a44]" />
          )}
          {COSTING_DONE_STATUS_LABELS.costing_approved}
          <span className="ml-auto text-[11px] font-bold text-[#1c7a44]/70">approve now</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** Local copy of the register's chip so the trigger can wrap it in a button. */
function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-1 text-[12px] font-bold"
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
        color: `var(--color-${tone}-deep)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
