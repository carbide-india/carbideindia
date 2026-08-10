"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, RotateCcw } from "lucide-react";
import {
  COSTING_DONE_STATUS_COLORS,
  COSTING_DONE_STATUS_LABELS,
  COSTING_ROUTE_LABELS,
} from "@/db/enums";
import type { RevisableCosting } from "@/lib/queries/negotiations";
import { requestCostingRevision } from "@/app/(app)/negotiations/actions";
import { Chip } from "@/components/inquiries/chip";
import { SectionCard } from "@/components/inquiries/form-field";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";

/** Product label per enquiry line, resolved server-side from the negotiation. */
export interface RevisableProductLabels {
  [inquiryItemId: string]: string | undefined;
}

interface Props {
  negotiationId: string;
  costings: RevisableCosting[];
  /** inquiryItemId → the product name shown on the negotiation line. */
  productLabels: RevisableProductLabels;
  /** True when the negotiation has no product lines carrying an enquiry item. */
  hasLines: boolean;
}

function money(value: string | null): string {
  if (value == null || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "-";
}

/**
 * "Not approved → the costing gets revised" — the loop Manan described:
 * वो नया कॉस्टिंग बनेगा उसका. Pick the cost sheets that have to be re-done, say
 * why, and each one forks a NEW costing revision (Costing 2, Costing 3 …) while
 * the previous revision stays in the system untouched.
 *
 * Only the CURRENT revision of each chain is offered — a superseded sheet is
 * history and cannot be revised again. Nothing here changes the negotiation's
 * own status: whether "not approved" should also move the negotiation to a
 * particular bucket is Manan's call, not this screen's.
 */
export function ReviseCostingCard({
  negotiationId,
  costings,
  productLabels,
  hasLines,
}: Props) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const toggle = React.useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const trimmedReason = reason.trim();
  const canSubmit = picked.size > 0 && trimmedReason.length >= 3 && !busy;

  async function onSubmit(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await requestCostingRevision({
        negotiationId,
        costingIds: [...picked],
        reason: trimmedReason,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // Report the real split — a partial run must not read as a clean success.
      fireToast({
        message:
          res.failed > 0
            ? `${res.created} new costing ${res.created === 1 ? "revision" : "revisions"} created, ${res.failed} skipped${res.firstError ? ` - ${res.firstError}` : "."}`
            : `${res.created} new costing ${res.created === 1 ? "revision" : "revisions"} created - waiting in the Costing register as Draft.`,
        type: res.failed > 0 ? "error" : "success",
      });
      setPicked(new Set());
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!hasLines) {
    return (
      <SectionCard title="Revise Costing">
        <p className="text-[13.5px] text-ink-muted">
          This negotiation has no product lines linked to the enquiry yet, so there is
          no cost sheet to revise. Add the products first.
        </p>
      </SectionCard>
    );
  }
  if (costings.length === 0) {
    return (
      <SectionCard title="Revise Costing">
        <p className="text-[13.5px] text-ink-muted">
          No cost sheets exist for this negotiation&rsquo;s products yet - nothing to
          revise.{" "}
          <Link
            href={"/costings" as Route}
            className="font-semibold text-brand hover:underline"
          >
            Open the Costing Register
          </Link>
          .
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Revise Costing"
      hint="Not approved? Send the cost sheet back - a new revision is created and the previous one is kept."
    >
      <ul className="flex flex-col gap-2" aria-label="Cost sheets that can be revised">
        {costings.map((c) => {
          const checked = picked.has(c.id);
          const label = productLabels[c.inquiryItemId] ?? "Product line";
          return (
            <li key={c.id}>
              <label
                className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 transition-colors"
                style={{
                  borderColor: checked
                    ? "color-mix(in srgb, var(--color-brand) 45%, transparent)"
                    : "var(--color-hairline)",
                  background: checked
                    ? "color-mix(in srgb, var(--color-brand) 6%, var(--color-surface-card))"
                    : "var(--color-surface-soft)",
                }}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[#3f3f94]"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  aria-label={`Revise ${label} (${COSTING_ROUTE_LABELS[c.costingType]}, revision ${c.revisionNo})`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink-strong">
                    {label}
                  </span>
                  <span className="block text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-subtle">
                    {COSTING_ROUTE_LABELS[c.costingType]} · Costing {c.revisionNo}
                    {c.isChosen ? " · chosen" : ""}
                    {c.isLocked ? " · locked" : ""}
                  </span>
                </span>
                <span className="tabular-nums text-[13.5px] font-bold text-ink-strong">
                  {money(c.finalUnitCost)}
                </span>
                <Chip
                  label={COSTING_DONE_STATUS_LABELS[c.costingDoneStatus]}
                  tone={COSTING_DONE_STATUS_COLORS[c.costingDoneStatus]}
                />
                <Link
                  href={`/costings/${c.id}` as Route}
                  className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-muted hover:text-ink-strong"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open
                  <ArrowUpRight size={12} strokeWidth={2.4} />
                </Link>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="revise-reason"
          className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-subtle"
        >
          Reason for the revision
        </label>
        <textarea
          id="revise-reason"
          rows={3}
          className="nt-input resize-y"
          placeholder="What the customer pushed back on, the target price, what has to change"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
        />
        <p className="text-[11.5px] text-ink-subtle">
          Stored on the new revision as its reason, alongside a back-link to this
          negotiation.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        <p className="text-[12.5px] text-ink-subtle">
          {picked.size === 0
            ? "Pick at least one cost sheet."
            : `${picked.size} cost ${picked.size === 1 ? "sheet" : "sheets"} selected.`}
        </p>
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
          }}
        >
          {busy ? (
            <Loader2 size={15} style={{ animation: "spinFast 0.8s linear infinite" }} />
          ) : (
            <RotateCcw size={15} strokeWidth={2.4} />
          )}
          Send Back for New Costing
        </button>
      </div>
    </SectionCard>
  );
}
