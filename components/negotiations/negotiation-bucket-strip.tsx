import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  NEGOTIATION_AGEING_BUCKETS,
  NEGOTIATION_STAGES,
  NEGOTIATION_STAGE_BUCKETS,
  NEGOTIATION_STAGE_COLORS,
  NEGOTIATION_STAGE_LABELS,
  NEGOTIATION_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
  type NegotiationAgeingKey,
  type NegotiationStage,
  type NegotiationStatus,
} from "@/db/enums";
import {
  NEGOTIATION_CLOSED_STATUSES,
  NEGOTIATION_OFF_BOARD_STATUSES,
  type NegotiationDashboard,
} from "@/lib/negotiations/buckets";
import { formatInr } from "@/lib/format";

/**
 * The /negotiations dashboard header — "what is left" at the negotiation stage.
 *
 * Three bands, each answering a different question Manan asked:
 *  1. VOLUME  "इतना तो मैंने भेज दिया, इतना नेगोशिएशन स्टेज में है" — how much has
 *     actually gone out (PI issued) against how much is still open, in ₹.
 *  2. AXES  the PI pipeline stage counts and the individual outcome counts, as
 *     dense chips.
 *
 * The house buckets used to lead this strip; they were the sidebar list a second
 * time and were dropped on 2026-08-13. What is left is exactly what the sidebar
 * CANNOT show: money, and the two secondary axes.
 *
 * Every tile and chip is a link into the same register filtered to exactly the
 * rows it counted, and clicking the active one clears the filter. Colours come
 * only from NEGOTIATION_STATUS_COLORS / NEGOTIATION_STAGE_COLORS — no hardcoded
 * status colour anywhere.
 */

export interface NegotiationStripFilters {
  status: NegotiationStatus | null;
  stage: NegotiationStage | null;
  /** A whole axis rather than one status: the commercial-outcome set, or every
   *  still-open status ("in negotiation"). */
  axis: "outcome" | "open" | null;
  /** true = only rows with a PI issued. */
  sent: boolean | null;
  /** An ageing view — open deals untouched for 15 / 30 / 60 days. */
  ageing: NegotiationAgeingKey | null;
}

/** Won / Lost / Abandoned, for O(1) "is this an exit column?" checks. */
const NEGOTIATION_CLOSED_SET: ReadonlySet<string> = new Set(NEGOTIATION_CLOSED_STATUSES);

interface Props {
  dashboard: NegotiationDashboard;
  active: NegotiationStripFilters;
  /** Rows currently listed under the active filter (for the sub-line). */
  shownCount: number;
}

/** ₹ in Indian units — lakh / crore past the point where digits stop reading. */
function compactInr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return formatInr(Math.round(n));
}

/** Build a /negotiations href from an exact filter set (omitting empty keys). */
function hrefFor(f: Partial<NegotiationStripFilters>): Route {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.stage) p.set("stage", f.stage);
  if (f.axis) p.set("axis", f.axis);
  if (f.sent !== null && f.sent !== undefined) p.set("sent", f.sent ? "1" : "0");
  if (f.ageing) p.set("ageing", f.ageing);
  const qs = p.toString();
  return (qs ? `/negotiations?${qs}` : "/negotiations") as Route;
}

/**
 * The house buckets as plain sidebar tiles — the same rows band 1 renders, in
 * the shape `SidebarBuckets` takes. Exported so the register sidebar and the
 * header strip read from one derivation and can never show different counts.
 */
export function buildNegotiationSidebarTiles(
  dashboard: NegotiationDashboard,
  active: NegotiationStripFilters,
  /** Open deals per ageing view — see getNegotiationAgeingCounts(). */
  ageing: Record<NegotiationAgeingKey, number>,
): {
  key: string;
  label: string;
  tone: string;
  count: number;
  href: string;
  active: boolean;
  hint?: string;
  group?: "all" | "bucket" | "flag" | "exit";
}[] {
  const anyFilter =
    active.status !== null ||
    active.stage !== null ||
    active.axis !== null ||
    active.sent !== null ||
    active.ageing !== null;
  return [
    {
      key: "all",
      group: "all" as const,
      label: "All Negotiations",
      tone: "brand",
      count: dashboard.total,
      href: hrefFor({}),
      active: !anyFilter,
    },
    ...NEGOTIATION_STAGE_BUCKETS.map((s) => ({
      key: s as string,
      label: NEGOTIATION_STATUS_LABELS[s],
      tone: NEGOTIATION_STATUS_COLORS[s],
      count: dashboard.counts[s],
      href: active.status === s ? hrefFor({}) : hrefFor({ status: s }),
      active: active.status === s,
      // Won / Lost / Abandoned are where a deal LEAVES negotiation. They sit
      // below the divider, apart from the states you still work in.
      ...(NEGOTIATION_CLOSED_SET.has(s) ? { group: "exit" as const } : {}),
    })),
    // Ageing narrows whatever else is set, so these keep the current status.
    ...NEGOTIATION_AGEING_BUCKETS.map((b) => ({
      key: b.key as string,
      group: "flag" as const,
      label: b.label,
      tone: "amber",
      count: ageing[b.key],
      hint: `Open deals untouched for ${b.days} days or more`,
      href:
        active.ageing === b.key
          ? hrefFor({ ...active, ageing: null })
          : hrefFor({ ...active, ageing: b.key }),
      active: active.ageing === b.key,
    })),
    {
      key: "outcome",
      // A second AXIS, not a bucket — legacy rows on a retired status sit here
      // instead of on a column, so it must not read as one of them.
      group: "flag" as const,
      label: "Not on the board",
      tone: "stone",
      count: dashboard.offBoardTotal.count,
      hint: "Rows on a retired status, with no column of their own",
      href: active.axis === "outcome" ? hrefFor({}) : hrefFor({ axis: "outcome" }),
      active: active.axis === "outcome",
    },
  ];
}

export function NegotiationBucketStrip({ dashboard, active, shownCount }: Props) {
  const d = dashboard;
  const anyFilter =
    active.status !== null || active.stage !== null || active.axis !== null || active.sent !== null;

  return (
    <section aria-label="Negotiation pipeline" className="mb-5 flex flex-col gap-2.5">
      {/* ── Band 2: volume — sent vs still in negotiation vs won ───────── */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <ValueTile
          label="Sent (PI issued)"
          count={d.sent.count}
          value={d.sent.value}
          tone="blue"
          href={active.sent === true ? hrefFor({}) : hrefFor({ sent: true })}
          activeNow={active.sent === true}
        />
        <ValueTile
          label="In Negotiation"
          count={d.open.count}
          value={d.open.value}
          tone="purple"
          hint="Every status except Order Won / Lost / Abandoned"
          href={active.axis === "open" ? hrefFor({}) : hrefFor({ axis: "open" })}
          activeNow={active.axis === "open"}
        />
        <ValueTile
          label="Order Won"
          count={d.won.count}
          value={d.won.value}
          tone="green"
          href={
            active.status === "order_won" ? hrefFor({}) : hrefFor({ status: "order_won" })
          }
          activeNow={active.status === "order_won"}
        />
      </div>

      {/* ── Band 3: the two secondary axes, as dense chips ─────────────── */}
      {/* Stacked, not side by side — see ChipGroup: each axis gets the full
          card width so its chips stay on a single line. */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-hairline bg-surface-card px-3 py-2">
        <ChipGroup title="PI Pipeline">
          {NEGOTIATION_STAGES.map((s) => (
            <CountChip
              key={s}
              label={NEGOTIATION_STAGE_LABELS[s]}
              value={d.stages[s]}
              tone={NEGOTIATION_STAGE_COLORS[s]}
              href={active.stage === s ? hrefFor({}) : hrefFor({ stage: s })}
              activeNow={active.stage === s}
            />
          ))}
        </ChipGroup>
        {/* Off-board statuses are LEGACY: enum values with no column on the
            board, left by earlier versions of this module. They are shown so
            the arithmetic stays honest (Total = board columns + off-board) —
            but only when at least one deal is actually sitting in one. With
            none, this was seven chips all reading 0, a whole line spent
            saying "nothing is in any of these dead states". */}
        {NEGOTIATION_OFF_BOARD_STATUSES.some((s) => (d.counts[s] ?? 0) > 0) && (
          <ChipGroup
            title="Legacy status"
            hint="Deals still stamped with a status that has no column on the board — from earlier versions of this module. Open one and move it onto the board."
          >
            {NEGOTIATION_OFF_BOARD_STATUSES.filter((s) => (d.counts[s] ?? 0) > 0).map(
              (s) => (
                <CountChip
                  key={s}
                  label={NEGOTIATION_STATUS_LABELS[s]}
                  value={d.counts[s]}
                  tone={NEGOTIATION_STATUS_COLORS[s]}
                  href={active.status === s ? hrefFor({}) : hrefFor({ status: s })}
                  activeNow={active.status === s}
                />
              ),
            )}
          </ChipGroup>
        )}
      </div>
    </section>
  );
}

/** A KPI tile: accent count + label, linking to the slice it counted. */
function Tile({
  label,
  value,
  tone,
  sub,
  href,
  activeNow,
}: {
  label: string;
  value: number;
  tone: string;
  sub?: string;
  href: Route;
  activeNow: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={activeNow ? "true" : undefined}
      className="flex items-center gap-2.5 rounded-xl border bg-surface-card px-3 py-2 transition-colors hover:border-hairline-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        borderColor: activeNow
          ? `color-mix(in srgb, var(--color-${tone}) 60%, transparent)`
          : "var(--color-hairline)",
        background: activeNow
          ? `color-mix(in srgb, var(--color-${tone}) 9%, var(--color-surface-card))`
          : "var(--color-surface-card)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        outlineColor: `var(--color-${tone})`,
      }}
    >
      <span
        className="font-mono text-[21px] font-black leading-none tabular-nums"
        style={{ color: `var(--color-${tone}-deep)` }}
      >
        {value}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[11px] font-bold uppercase tracking-[0.03em] text-ink-strong">
          {label}
        </span>
        {sub && (
          <span className="block truncate text-[10px] font-semibold tabular-nums text-ink-subtle">
            {sub}
          </span>
        )}
      </span>
    </Link>
  );
}

/** A volume tile: count + ₹ value. Renders inert (a <div>) when not drillable. */
function ValueTile({
  label,
  count,
  value,
  tone,
  hint,
  href,
  activeNow,
}: {
  label: string;
  count: number;
  value: number;
  tone: string;
  hint?: string;
  href?: Route;
  activeNow?: boolean;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
          {label}
        </span>
        <span
          className="text-[19px] font-black tabular-nums"
          style={{ color: `var(--color-${tone}-deep)` }}
        >
          {compactInr(value)}
        </span>
      </span>
      <span className="shrink-0 text-right leading-tight">
        <span className="block font-mono text-[17px] font-black tabular-nums text-ink-strong">
          {count}
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-subtle">
          {count === 1 ? "record" : "records"}
        </span>
      </span>
    </>
  );
  const style = {
    borderColor:
      activeNow === true
        ? `color-mix(in srgb, var(--color-${tone}) 60%, transparent)`
        : "var(--color-hairline)",
    background: `color-mix(in srgb, var(--color-${tone}) ${activeNow === true ? 10 : 5}%, var(--color-surface-card))`,
  } as const;

  if (!href) {
    return (
      <div
        title={hint}
        className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
        style={style}
      >
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      title={hint}
      aria-current={activeNow ? "true" : undefined}
      className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors hover:border-hairline-strong"
      style={style}
    >
      {body}
    </Link>
  );
}

/**
 * One axis of chips on ONE line: its name in a fixed-width gutter, the chips
 * beside it.
 *
 * The two groups used to sit side by side, each with its title stacked above
 * its chips — which gave every group only half the width, so "Not on the
 * board" (seven states) always wrapped to a second row and the strip ate four
 * lines. Stacked full-width rows with an inline title give each axis the whole
 * card, and the fixed gutter keeps both rows' chips left-aligned with each
 * other.
 */
function ChipGroup({
  title,
  hint,
  children,
}: {
  title: string;
  /** Explains the axis on hover — "Legacy status" needs one. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        title={hint}
        className={`w-[108px] shrink-0 text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-ink-subtle${
          hint ? " cursor-help" : ""
        }`}
      >
        {title}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

/** A label + count pill that links to its own slice. Zero counts stay visible
 *  (muted) — an absent chip would read as "no such state", not "none today". */
function CountChip({
  label,
  value,
  tone,
  href,
  activeNow,
}: {
  label: string;
  value: number;
  tone: string;
  href: Route;
  activeNow: boolean;
}) {
  const empty = value === 0;
  return (
    <Link
      href={href}
      aria-current={activeNow ? "true" : undefined}
      className="inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap transition-colors"
      style={{
        background: activeNow
          ? `color-mix(in srgb, var(--color-${tone}) 18%, transparent)`
          : `color-mix(in srgb, var(--color-${tone}) ${empty ? 4 : 9}%, transparent)`,
        color: empty && !activeNow ? "var(--color-ink-subtle)" : `var(--color-${tone}-deep)`,
        borderColor: `color-mix(in srgb, var(--color-${tone}) ${activeNow ? 55 : empty ? 14 : 28}%, transparent)`,
      }}
    >
      {label}
      <span className="font-mono tabular-nums">{value}</span>
    </Link>
  );
}
