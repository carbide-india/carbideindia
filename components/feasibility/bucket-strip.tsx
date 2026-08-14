import Link from "next/link";
import type { Route } from "next";

/**
 * The house bucket strip shared by Primary and Secondary Feasibility.
 *
 * One dense tile per bucket — count + label — and every tile is a LINK that
 * filters the queue below it (`?status=…`). Manan's whole ask at every stage is
 * "show me what is LEFT", so the strip must (a) always sum to the queue total
 * and (b) always be clickable through to the rows behind a number.
 *
 * Colours come from the caller as status colour TOKENS (globals.css
 * `--color-*`), never as hex — the same treatment the shared `Chip` uses, so a
 * bucket reads identically on the strip, in the sidebar and in the table.
 */

export interface BucketTile {
  /** Stable key (also the `?status=` value where the tile filters a bucket). */
  key: string;
  label: string;
  /** Status colour token name — e.g. "slate" | "amber" | "green". */
  tone: string;
  count: number;
  href: string;
  active?: boolean;
  /** Optional second line (e.g. "of 40 comparable"). */
  sub?: string;
  /** Optional short title attribute explaining how the count is derived. */
  hint?: string;
  /**
   * How the sidebar groups this tile (the strip itself renders them all alike):
   *   "all"    the stage total — becomes the parent destination
   *   "bucket" a mutually-exclusive house bucket (the default)
   *   "flag"   a CROSS-CUTTING view (Overdue, Not Sent, Spec Variance, ageing).
   *            These do not add into the total, so they sit apart from the
   *            buckets and must never look like one.
   *   "exit"   where work LEAVES the stage. Most stages have exactly one and it
   *            is found by meaning (statusBucketOf === "approved"); mark tiles
   *            explicitly only where that fails — Negotiation exits three ways
   *            (Won / Lost / Abandoned) and approves none of them.
   */
  group?: "all" | "bucket" | "flag" | "exit";
}

export function BucketStrip({ tiles, ariaLabel }: { tiles: BucketTile[]; ariaLabel: string }) {
  if (tiles.length === 0) return null;
  return (
    // Flex, not a fixed-track grid: `auto-fill,minmax(156px,1fr)` sized the
    // tracks off the CONTAINER, so a ninth bucket dropped to a second row while
    // the eight above it sat half-empty.
    //
    // `grow basis-auto` rather than `flex-1` (which is `basis-0`, i.e. equal
    // widths): equal tracks starve the longest label — "Feasibility Approved"
    // truncated while "Draft" sat in twice the room it needed. Sizing from
    // content and sharing the slack gives every label the width it actually
    // wants. `min-w-0` keeps truncation as the fallback on a narrow window.
    <nav aria-label={ariaLabel} className="mb-5 flex flex-wrap gap-2">
      {tiles.map((t) => (
        <Link
          key={t.key}
          href={t.href as Route}
          title={t.hint ?? t.label}
          aria-current={t.active ? "page" : undefined}
          className="group flex min-w-0 grow basis-auto items-center gap-2 rounded-xl border border-hairline bg-surface-card px-2.5 py-1.5 transition-all hover:-translate-y-[1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f94] focus-visible:ring-offset-1"
          style={{
            boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
            // The active tile is tinted with its OWN bucket tone (same
            // color-mix treatment as the shared Chip) — never a hardcoded hex.
            ...(t.active
              ? {
                  borderColor: `color-mix(in srgb, var(--color-${t.tone}) 55%, transparent)`,
                  background: `color-mix(in srgb, var(--color-${t.tone}) 10%, transparent)`,
                }
              : null),
          }}
        >
          <span
            className="shrink-0 font-mono text-[18px] font-black leading-none tabular-nums"
            style={{ color: `var(--color-${t.tone}-deep)` }}
          >
            {t.count}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[10px] font-bold uppercase tracking-[0.02em] text-ink-strong">
              {t.label}
            </span>
            {t.sub && <span className="block truncate text-[9.5px] font-semibold text-ink-subtle">{t.sub}</span>}
          </span>
        </Link>
      ))}
    </nav>
  );
}
