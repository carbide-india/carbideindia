import Link from "next/link";
import type { Route } from "next";
import type { BucketTile } from "@/components/feasibility/bucket-strip";
import { BUCKET_ICONS, normalizeBucketKey } from "@/components/layout/bucket-icon";
import { cn } from "@/lib/utils";

/**
 * Status-wise distribution in a module sidebar.
 *
 * Deliberately identical to the Primary/Secondary Feasibility status nav — same
 * row height, same icons, same active fill, same nesting under a parent
 * destination — because the house buckets ARE the same buckets. Manan's rule is
 * that no stage should make you re-learn it, which only holds if one component
 * draws them all.
 *
 * The tiles are the SAME ones the dashboard strip above the table renders, so
 * the sidebar counts can never drift from the tiles: one derivation, two
 * presentations.
 *
 * Three kinds of row, matching the feasibility sidebar's shape:
 *   · the "all" tile becomes the parent destination (full-size row),
 *   · the house buckets nest under it behind a left rule,
 *   · cross-cutting views (Overdue, Not Sent, Commercial Outcome) sit after a
 *     divider, tinted amber — they are not buckets of the queue and must never
 *     look like they add into the total.
 */
export function SidebarBuckets({
  tiles,
  ariaLabel,
}: {
  tiles: BucketTile[];
  /** e.g. "Quotation status distribution". */
  ariaLabel: string;
}) {
  if (tiles.length === 0) return null;

  const parent = tiles.find((t) => t.group === "all" || t.key === "all") ?? null;
  const flags = tiles.filter((t) => t.group === "flag");
  const buckets = tiles.filter((t) => t !== parent && !flags.includes(t));

  return (
    <nav className="flex w-full flex-col gap-1.5" aria-label={ariaLabel}>
      {parent && <BucketRow tile={parent} />}

      {buckets.length > 0 && (
        <div className="ml-3 flex flex-col gap-1 border-l border-[#e5e7eb] pl-2">
          {buckets.map((t) => (
            <BucketRow key={t.key} tile={t} nested />
          ))}
        </div>
      )}

      {flags.length > 0 && (
        <>
          <div className="my-1 h-[1.5px] rounded-full bg-[#e5e7eb]" />
          {flags.map((t) => (
            <BucketRow key={t.key} tile={t} flag />
          ))}
        </>
      )}
    </nav>
  );
}

function BucketRow({
  tile,
  nested,
  flag,
}: {
  tile: BucketTile;
  nested?: boolean;
  flag?: boolean;
}) {
  const Icon = BUCKET_ICONS[normalizeBucketKey(tile.key)];
  return (
    <Link
      href={tile.href as Route}
      title={tile.hint ?? tile.label}
      aria-current={tile.active ? "page" : undefined}
      className={cn(
        "flex h-[42px] items-center gap-3 rounded-lg px-3.5 text-[13.5px] transition",
        nested && "h-[38px] text-[13px]",
        tile.active
          ? "bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.30)]"
          : flag
            ? // Same treatment Spec Variance gets in the feasibility sidebar: a
              // standing cross-cutting view, not a bucket of the queue.
              "border-[1.5px] border-[#f0d3a4] bg-[#fdf6e7] font-bold text-[#8a5a08] hover:border-[#b45309] hover:bg-[#f9ecd2]"
            : "font-semibold text-[#3a4152] hover:bg-[#efeffb] hover:text-[#3f3f94]",
      )}
    >
      <Icon className={cn("shrink-0", nested ? "h-[17px] w-[17px]" : "h-[18px] w-[18px]")} />
      <span className="min-w-0 flex-1 truncate">{tile.label}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums font-black",
          tile.active ? "" : flag ? "text-[#8a5a08]" : "text-[#6b7280]",
        )}
      >
        {tile.count}
      </span>
    </Link>
  );
}
