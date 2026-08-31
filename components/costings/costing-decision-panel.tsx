"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock, ShieldCheck, TriangleAlert, Unlock } from "lucide-react";
import { COSTING_ROUTE_LABELS, type CostingRoute } from "@/db/enums";
import type { CostingDecision } from "@/lib/queries/costings";
import {
  approveCostingDecision,
  unlockCostingDecision,
} from "@/app/(app)/costings/actions";
import { fireToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { StatusPill } from "@/components/erp/status-pill";
import { cn } from "@/lib/utils";

/**
 * Costing Decision panel (per inquiry_item) — the approver's final call.
 *
 * Reads a `getCostingDecision(inquiryItemId)` bundle and lets an ADMIN confirm or
 * override the system recommendation (cheaper of in-house unit cost vs BO
 * cheapest-landed) and LOCK the final unit cost that feeds the quotation. An
 * override (picking the pricier path, or a BO vendor other than the cheapest)
 * requires a reason before Approve is enabled. Once locked, it shows the frozen
 * decision + who approved it, with an admin-only reversible Unlock. Non-admins
 * see a read-only summary and no controls.
 */

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return formatDateTime(date);
}

/** A titled band — indigo accent, matches the feasibility enquiry snapshot. */
function Band({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-y border-[#d6d9ea] bg-[#e7e9f6] px-4 py-2">
      <span className="h-3.5 w-1.5 shrink-0 rounded-full bg-[#3f3f94]" />
      <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">
        {title}
      </span>
      {children && <span className="ml-auto">{children}</span>}
    </div>
  );
}

/** One candidate-path cell in the recommendation comparison. */
function PathCell({
  label,
  cost,
  recommended,
  disabled,
}: {
  label: string;
  cost: number | null;
  recommended: boolean;
  disabled: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 px-4 py-3", recommended && "bg-[#eef7f0]")}>
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">
          {label}
        </span>
        {recommended && (
          <StatusPill tone="green" size="sm">
            Recommended
          </StatusPill>
        )}
      </div>
      <span
        className={cn(
          "font-mono text-[18px] font-bold tabular-nums leading-snug",
          disabled ? "text-ink-subtle" : "text-[#14151a]",
        )}
      >
        {disabled ? "Not costed" : `${money(cost)}/pc`}
      </span>
    </div>
  );
}

export function CostingDecisionPanel({
  decision,
  isAdmin,
  productName,
}: {
  decision: CostingDecision;
  isAdmin: boolean;
  productName?: string | null;
}) {
  const router = useRouter();
  const { inhouse, boughtOut, recommendation, state } = decision;

  const inCost = num(inhouse?.finalCostPerPiece);
  const boCost = num(boughtOut?.finalCostPerPiece);
  const boRecommendedVendorId = boughtOut?.recommendedVendorQuoteId ?? null;

  // Form state (only meaningful while unlocked + admin).
  const [option, setOption] = React.useState<CostingRoute>(
    recommendation?.recommendedOption ?? (inhouse ? "inhouse" : "bought_out"),
  );
  const [vendorId, setVendorId] = React.useState<string>(
    boRecommendedVendorId ?? boughtOut?.vendorQuotes[0]?.id ?? "",
  );
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const vendorOptions = React.useMemo(
    () =>
      (boughtOut?.vendorQuotes ?? []).map((q) => {
        const landed = boughtOut?.vendorComparison?.byId[q.id];
        const name = q.vendorNameSnapshot || "Vendor";
        return {
          value: q.id,
          label: landed != null ? `${name} · ${money(landed)}/pc` : name,
        };
      }),
    [boughtOut],
  );

  // ── Locked view — the frozen decision (read-only for everyone; admins unlock)
  if (state.isLocked) {
    const finalUnit = num(state.finalUnitCost);
    const lockedOption = state.approvedOption;
    const lockedVendorName = state.chosenVendorQuoteId
      ? boughtOut?.vendorQuotes.find((q) => q.id === state.chosenVendorQuoteId)?.vendorNameSnapshot
      : null;

    async function onUnlock() {
      setPending(true);
      const res = await unlockCostingDecision(decision.inquiryItemId);
      setPending(false);
      if (res.ok) {
        fireToast({ message: "Costing unlocked — it can be re-costed." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    }

    return (
      <div className="overflow-hidden rounded-section border border-hairline-strong bg-surface-card">
        <Band title="Costing Decision">
          <StatusPill tone="green" size="sm">
            <Lock size={11} strokeWidth={2.6} className="mr-0.5" /> Approved &amp; Locked
          </StatusPill>
        </Band>
        {productName && (
          <div className="border-b border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong">
            {productName}
          </div>
        )}
        <div className="grid grid-cols-2 divide-x divide-hairline sm:grid-cols-4">
          <div className="flex flex-col gap-1 px-4 py-3">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">
              Final Unit Cost
            </span>
            <span className="font-mono text-[18px] font-bold tabular-nums text-[#14151a]">
              {money(finalUnit)}/pc
            </span>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">
              Route
            </span>
            <span className="text-[15px] font-bold text-ink-strong">
              {lockedOption ? COSTING_ROUTE_LABELS[lockedOption] : "—"}
              {lockedVendorName ? ` · ${lockedVendorName}` : ""}
            </span>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">
              Approved By
            </span>
            <span className="text-[15px] font-bold text-ink-strong">
              {state.approverName ?? "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">
              Approved At
            </span>
            <span className="text-[13px] font-semibold text-ink-strong">
              {fmtDateTime(state.approvedAt)}
            </span>
          </div>
        </div>

        {state.isOverridden && (
          <div className="flex items-start gap-2.5 border-t border-hairline bg-[#fff8ec] px-4 py-3">
            <TriangleAlert size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: "var(--color-amber-deep)" }} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] font-bold uppercase tracking-[0.04em]" style={{ color: "var(--color-amber-deep)" }}>
                Overridden — not the system recommendation
              </span>
              {state.overrideReason && (
                <span className="text-[13px] text-ink-muted">{state.overrideReason}</span>
              )}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="flex items-center justify-end border-t border-hairline px-4 py-3">
            <button
              type="button"
              onClick={onUnlock}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94] disabled:opacity-50"
            >
              {pending ? (
                <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
              ) : (
                <Unlock size={14} strokeWidth={2.3} />
              )}
              Unlock
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Not costed yet — nothing to decide.
  if (!recommendation) {
    return (
      <div className="overflow-hidden rounded-section border border-hairline-strong bg-surface-card">
        <Band title="Costing Decision" />
        <div className="px-4 py-4 text-[13px] text-ink-subtle">
          Cost this product (in-house and/or bought-out) before a final route can be approved.
        </div>
      </div>
    );
  }

  // ── Unlocked. Recommendation + (admin) the decision controls.
  const recOption = recommendation.recommendedOption;
  const diff = inCost != null && boCost != null ? Math.abs(inCost - boCost) : null;
  const cheaperLabel = COSTING_ROUTE_LABELS[recOption];

  // Override detection — mirrors the server: pricier path, or a BO vendor other
  // than the cheapest-landed one the recommendation points at.
  let willOverride = option !== recOption;
  if (option === "bought_out" && (vendorId || null) !== boRecommendedVendorId) {
    willOverride = true;
  }
  const reasonMissing = willOverride && reason.trim() === "";
  const targetMissing = option === "inhouse" ? !inhouse : !boughtOut;

  async function onApprove() {
    setPending(true);
    const res = await approveCostingDecision({
      inquiryItemId: decision.inquiryItemId,
      approvedOption: option,
      chosenVendorQuoteId: option === "bought_out" ? vendorId || null : null,
      overrideReason: willOverride ? reason.trim() : null,
    });
    setPending(false);
    if (res.ok) {
      fireToast({
        message: res.isOverridden
          ? `Overridden & locked at ${money(res.finalUnitCost)}/pc.`
          : `Approved & locked at ${money(res.finalUnitCost)}/pc.`,
      });
      router.refresh();
    } else {
      fireToast({ type: "error", message: res.error });
    }
  }

  return (
    <div className="overflow-hidden rounded-section border border-hairline-strong bg-surface-card">
      <Band title="Costing Decision">
        <StatusPill tone="amber" size="sm">
          Awaiting approval
        </StatusPill>
      </Band>
      {productName && (
        <div className="border-b border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong">
          {productName}
        </div>
      )}

      {/* System recommendation — in-house vs BO cheapest-landed. */}
      <div className="grid grid-cols-2 divide-x divide-hairline">
        <PathCell
          label="In-House"
          cost={inCost}
          recommended={recOption === "inhouse"}
          disabled={!inhouse}
        />
        <PathCell
          label="Bought-Out (cheapest landed)"
          cost={boCost}
          recommended={recOption === "bought_out"}
          disabled={!boughtOut}
        />
      </div>
      <div className="flex items-center gap-2 border-t border-hairline bg-surface-soft px-4 py-2.5">
        <ShieldCheck size={15} strokeWidth={2.2} className="shrink-0 text-brand" />
        <span className="text-[13px] text-ink-muted">
          <strong className="text-ink-strong">{cheaperLabel}</strong> recommended
          {diff != null && diff > 0
            ? ` — cheaper by ${money(diff)}/pc`
            : inCost == null || boCost == null
              ? " — only one path is costed"
              : ""}
          .
        </span>
      </div>

      {!isAdmin ? (
        <div className="border-t border-hairline px-4 py-3 text-[12px] text-ink-subtle">
          Awaiting an approver to confirm and lock the final cost.
        </div>
      ) : (
        <div className="flex flex-col gap-4 border-t border-hairline px-4 py-4">
          {/* Route radio */}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
              Final route
            </legend>
            <div className="flex flex-wrap gap-2.5">
              {(["inhouse", "bought_out"] as const).map((opt) => {
                const optDisabled = opt === "inhouse" ? !inhouse : !boughtOut;
                const active = option === opt;
                return (
                  <label
                    key={opt}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition-colors",
                      active
                        ? "border-[#3f3f94] bg-[#efeffb] text-[#3f3f94]"
                        : "border-hairline-strong bg-surface-card text-ink-strong hover:border-[#3f3f94]",
                      optDisabled && "cursor-not-allowed opacity-40 hover:border-hairline-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name={`route-${decision.inquiryItemId}`}
                      value={opt}
                      checked={active}
                      disabled={optDisabled}
                      onChange={() => setOption(opt)}
                      className="accent-[#3f3f94]"
                    />
                    {COSTING_ROUTE_LABELS[opt]}
                    {recOption === opt && (
                      <span className="text-[11px] font-bold text-[#2e7d46]">· rec</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* BO vendor pick */}
          {option === "bought_out" && vendorOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                Vendor
              </span>
              <Select
                value={vendorId}
                onValueChange={setVendorId}
                options={vendorOptions}
                placeholder="Select vendor"
                ariaLabel="Bought-out vendor"
              />
            </div>
          )}

          {/* Override reason — appears + required when the pick diverges */}
          {willOverride && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--color-amber-deep)" }}>
                Override reason (required)
              </span>
              <NotesField
                value={reason}
                onChange={setReason}
                rows={2}
                placeholder="Why depart from the recommended route/vendor?"
                ariaLabel="Override reason"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {targetMissing && (
              <span className="text-[12px] font-semibold" style={{ color: "var(--color-amber-deep)" }}>
                No {COSTING_ROUTE_LABELS[option].toLowerCase()} costing exists to approve.
              </span>
            )}
            <button
              type="button"
              onClick={onApprove}
              disabled={pending || reasonMissing || targetMissing}
              className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] text-white transition-opacity disabled:opacity-50"
              style={{
                background: "#454595",
                fontWeight: 800,
              }}
            >
              {pending ? (
                <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
              ) : (
                <CheckCircle2 size={15} strokeWidth={2.3} />
              )}
              Approve &amp; Lock
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
