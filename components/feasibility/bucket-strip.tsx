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
}

export function BucketStrip({ tiles, ariaLabel }: { tiles: BucketTile[]; ariaLabel: string }) {
  if (tiles.length === 0) return null;
  return (
    <nav
      aria-label={ariaLabel}
      className="mb-5 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(156px,1fr))]"
    >
      {tiles.map((t) => (
        <Link
          key={t.key}
          href={t.href as Route}
          title={t.hint}
          aria-current={t.active ? "page" : undefined}
          className="group flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-card px-3 py-2 transition-all hover:-translate-y-[1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f94] focus-visible:ring-offset-1"
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
            className="font-mono text-[21px] font-black leading-none tabular-nums"
            style={{ color: `var(--color-${t.tone}-deep)` }}
          >
            {t.count}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[11px] font-bold uppercase tracking-[0.03em] text-ink-strong">
              {t.label}
            </span>
            {t.sub && <span className="block text-[10px] font-semibold text-ink-subtle">{t.sub}</span>}
          </span>
        </Link>
      ))}
    </nav>
  );
}
