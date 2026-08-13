import Link from "next/link";
import type { Route } from "next";
import type { BucketTile } from "@/components/feasibility/bucket-strip";

/**
 * Status-wise distribution in the Costing sidebar.
 *
 * Fed the SAME `BucketTile[]` the dashboard strip renders, so the sidebar
 * counts can never drift from the tiles above the table — one derivation, two
 * presentations. Each row links to its own `?bucket=…` view, and the active
 * bucket is highlighted so the sidebar always says where you are.
 */
export function CostingSidebarBuckets({ tiles }: { tiles: BucketTile[] }) {
  return (
    <div className="w-full">
      <p className="mb-2 px-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-[#9aa0ab]">
        By Status
      </p>
      <nav className="flex flex-col gap-0.5" aria-label="Costing status distribution">
        {tiles.map((t) => (
          <Link
            key={t.key}
            href={t.href as Route}
            title={t.hint}
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
