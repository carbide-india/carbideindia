"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { GitCompareArrows, History, Loader2, Plus } from "lucide-react";
import {
  COSTING_DONE_STATUS_COLORS,
  COSTING_DONE_STATUS_LABELS,
  COSTING_ROUTE_LABELS,
  type CostingDoneStatus,
  type CostingRoute,
} from "@/db/enums";
import { Chip } from "@/components/inquiries/chip";
import { formatDate, formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { reviseCosting } from "@/app/(app)/costings/actions";
import { costingRevisionLabel } from "@/lib/costing/buckets";
import {
  computeCostingVariance,
  countCostingVarianceChanges,
  type CostingVarianceInput,
} from "@/lib/costing/costing-variance";

/**
 * Costing 1 / Costing 2 / Costing 3 for one product line, plus the difference
 * between any two of them.
 *
 * Manan, on revising a costing after a negotiation: "पहले वाला रहेगा सिस्टम में …
 * सेम वेरिएंस दिखेगा" — the earlier costing stays in the system and you see the
 * same variance view. So a revision INSERTS a new sheet (never edits the old
 * one) and the two are diffed here on the costing numbers themselves: block
 * weight, net weight, the rates that move them, and the money that falls out.
 *
 * Revisions are numbered by POSITION in the chain, not by the stored
 * `revision_no` — every sheet written before the revision columns existed
 * carries the default 1, and labelling three re-costings "Costing 1" three times
 * would be worse than useless.
 */

export interface CostingRevisionSheet extends CostingVarianceInput {
  id: string;
  route: CostingRoute;
  status: CostingDoneStatus;
  isChosen: boolean;
  isLatestRevision: boolean;
  isLocked: boolean;
  revisionReason: string | null;
  createdAt: Date;
}

interface Props {
  /** The sheet currently open — highlighted in the chain. */
  currentId: string;
  /** Every sheet on this line's route, OLDEST FIRST. */
  revisions: CostingRevisionSheet[];
}

function money(v: string | null | undefined): string {
  if (v == null || v === "") return "-";
  const n = Number(v);
  return Number.isFinite(n) ? formatInr(n) : "-";
}

export function CostingRevisionsPanel({ currentId, revisions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [reason, setReason] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = React.useState(false);

  const last = revisions.length - 1;
  // Default comparison: the previous revision against the newest one — the
  // question anyone opening this panel is actually asking.
  const [leftIdx, setLeftIdx] = React.useState(() => Math.max(0, last - 1));
  const [rightIdx, setRightIdx] = React.useState(() => Math.max(0, last));

  const left = revisions[leftIdx];
  const right = revisions[rightIdx];
  const rows = React.useMemo(
    () => (left && right ? computeCostingVariance(left, right) : []),
    [left, right],
  );
  const changed = countCostingVarianceChanges(rows);
  const visibleRows = showUnchanged ? rows : rows.filter((r) => r.changed);

  const current = revisions.find((r) => r.id === currentId) ?? null;
  const canRevise = current != null && !current.isLocked;

  function submitRevision() {
    setError(null);
    startTransition(async () => {
      const res = await reviseCosting({ costingId: currentId, reason });
      if (res.ok) {
        fireToast({ message: `Created ${costingRevisionLabel(revisions.length)}.` });
        setReason("");
        setShowForm(false);
        router.push(`/costings/${res.id}` as Route);
        router.refresh();
      } else {
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
        <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          <History size={14} strokeWidth={2.4} />
          Revisions
          {revisions[0] && (
            <span className="font-semibold normal-case tracking-normal">
              · {COSTING_ROUTE_LABELS[revisions[0].route]}
            </span>
          )}
        </h2>
        {canRevise && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            <Plus size={14} strokeWidth={2.6} />
            New revision
          </button>
        )}
      </div>

      {/* The chain */}
      <ol className="flex flex-col gap-1.5">
        {revisions.map((r, i) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]"
            style={
              r.id === currentId
                ? { background: "color-mix(in srgb, var(--color-brand) 7%, transparent)" }
                : undefined
            }
          >
            {r.id === currentId ? (
              <span className="font-black text-ink-strong">{costingRevisionLabel(i)}</span>
            ) : (
              <Link
                href={`/costings/${r.id}` as Route}
                className="font-bold text-brand hover:underline"
              >
                {costingRevisionLabel(i)}
              </Link>
            )}
            <Chip
              label={COSTING_DONE_STATUS_LABELS[r.status]}
              tone={COSTING_DONE_STATUS_COLORS[r.status]}
            />
            <span className="tabular-nums text-ink-soft">
              {money(r.finalCostPerPiece)} / pc
            </span>
            <span className="text-ink-subtle">{formatDate(r.createdAt)}</span>
            {r.isChosen && (
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                chosen
              </span>
            )}
            {r.isLatestRevision && revisions.length > 1 && (
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                latest
              </span>
            )}
            {r.revisionReason && (
              <span className="w-full text-[12.5px] text-ink-soft">{r.revisionReason}</span>
            )}
          </li>
        ))}
      </ol>

      {showForm && (
        <div className="mt-4 rounded-xl border border-hairline p-3">
          <label
            htmlFor="revision-reason"
            className="block text-[12px] font-bold text-ink-subtle"
          >
            Why is this costing being revised?
          </label>
          <textarea
            id="revision-reason"
            rows={2}
            maxLength={2000}
            value={reason}
            disabled={pending}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. customer pushed back on price after negotiation; RM rate revised"
            className="mt-2 w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[13px] text-ink-strong focus:border-brand focus:outline-none"
          />
          <p className="mt-1 text-[12px] text-ink-subtle">
            The current sheet is kept exactly as it is. The new revision starts as a Draft
            and must be approved again before a quotation can use it.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={pending || reason.trim().length < 3}
              onClick={submitRevision}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: "var(--color-brand)" }}
            >
              {pending && <Loader2 size={13} strokeWidth={2.6} className="animate-spin" />}
              Create revision
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="text-[12.5px] font-bold text-ink-subtle hover:text-ink-strong"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p
              className="mt-2 text-[13px] font-semibold"
              style={{ color: "var(--color-red-deep)" }}
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      )}

      {/* The diff */}
      {revisions.length < 2 ? (
        <p className="mt-4 text-[13px] text-ink-soft">
          Only one costing exists on this route, so there is nothing to compare yet.
        </p>
      ) : (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <GitCompareArrows size={14} strokeWidth={2.6} className="text-brand" />
            <label htmlFor="rev-left" className="font-bold text-ink-subtle">
              Compare
            </label>
            <select
              id="rev-left"
              value={leftIdx}
              onChange={(e) => setLeftIdx(Number(e.target.value))}
              className="rounded-lg border border-hairline bg-surface-card px-2 py-1 font-semibold text-ink-strong focus:border-brand focus:outline-none"
            >
              {revisions.map((r, i) => (
                <option key={r.id} value={i}>
                  {costingRevisionLabel(i)}
                </option>
              ))}
            </select>
            <span className="text-ink-subtle">with</span>
            <select
              id="rev-right"
              value={rightIdx}
              onChange={(e) => setRightIdx(Number(e.target.value))}
              className="rounded-lg border border-hairline bg-surface-card px-2 py-1 font-semibold text-ink-strong focus:border-brand focus:outline-none"
            >
              {revisions.map((r, i) => (
                <option key={r.id} value={i}>
                  {costingRevisionLabel(i)}
                </option>
              ))}
            </select>
            <label className="ml-auto flex items-center gap-1.5 font-semibold text-ink-subtle">
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(e) => setShowUnchanged(e.target.checked)}
              />
              Show unchanged
            </label>
          </div>

          <p className="mt-2 text-[13px] font-bold text-ink-soft">
            {leftIdx === rightIdx
              ? "Pick two different revisions to see the difference."
              : `${changed} field${changed === 1 ? "" : "s"} changed between ${costingRevisionLabel(leftIdx)} and ${costingRevisionLabel(rightIdx)}.`}
          </p>

          {leftIdx !== rightIdx && visibleRows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-hairline">
              <table className="w-full border-collapse text-left text-[13px]">
                <caption className="sr-only">
                  Difference between {costingRevisionLabel(leftIdx)} and{" "}
                  {costingRevisionLabel(rightIdx)}
                </caption>
                <thead>
                  <tr className="bg-surface-soft text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">
                    <th scope="col" className="px-3 py-2">
                      Field
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {costingRevisionLabel(leftIdx)}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {costingRevisionLabel(rightIdx)}
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {visibleRows.map((r) => (
                    <tr key={r.field}>
                      <td className="px-3 py-2 font-bold text-ink-strong">
                        {r.label}
                        <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                          {r.group}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-ink-soft">
                        {r.feasibilityValue}
                      </td>
                      <td
                        className="px-3 py-2 tabular-nums"
                        style={
                          r.changed
                            ? { color: "var(--color-amber-deep)", fontWeight: 800 }
                            : { color: "var(--color-ink-soft)" }
                        }
                      >
                        {r.costingValue}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-soft">
                        {r.delta == null || !r.changed
                          ? "—"
                          : `${r.delta > 0 ? "+" : ""}${Number(r.delta.toFixed(4))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {leftIdx !== rightIdx && visibleRows.length === 0 && (
            <p className="mt-2 text-[13px] text-ink-soft">
              Nothing differs between these two revisions.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
