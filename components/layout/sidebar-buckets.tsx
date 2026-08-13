import Link from "next/link";
import type { Route } from "next";
import type { BucketTile } from "@/components/feasibility/bucket-strip";

/**
 * Status-wise distribution in a module sidebar.
 *
 * Fed the SAME tiles the dashboard strip above the table renders, so the
 * sidebar counts can never drift from the tiles — one derivation, two
 * presentations. Each row links to its own filtered view and the active bucket
 * is highlighted, so the sidebar always says where you are.
 *
 * Shared by Costing, Quotation and Negotiation (and anything else with house
 * buckets): Manan's ask is that no stage make you re-learn it, which only holds
 * if one component draws them all.
 */
export function SidebarBuckets({
  tiles,
  ariaLabel,
  heading = "By Status",
}: {
  tiles: BucketTile[];
  /** e.g. "Quotation status distribution". */
  ariaLabel: string;
  heading?: string;
}) {
  if (tiles.length === 0) return null;
  return (
    <div className="w-full">
      <p className="mb-2 px-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-[#9aa0ab]">
        {heading}
      </p>
      <nav className="flex flex-col gap-0.5" aria-label={ariaLabel}>
        {tiles.map((t) => (
          <Link
            key={t.key}
            href={t.href as Route}
            title={t.hint ?? t.label}
            aria-current={t.active ? "page" : undefined}
            className={
              t.active
                ? "flex items-center gap-2 rounded-lg bg-[#3f3f94] px-2.5 py-1.5 text-[12.5px] font-bold text-white"
                : "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
            }
          >
            {/* Channel dot — the bucket's own tone, so the sidebar reads in the
                same colour language as the chips and the strip. */}
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{
                background: t.active
                  ? "rgba(255,255,255,0.9)"
                  : `var(--color-${t.tone}-deep, var(--color-ink-subtle))`,
              }}
            />
            <span className="min-w-0 flex-1 truncate">{t.label}</span>
            <span
              className={
                t.active
                  ? "shrink-0 tabular-nums font-black"
                  : "shrink-0 tabular-nums font-black text-[#6b7280]"
              }
            >
              {t.count}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
