import Link from "next/link";
import type { Route } from "next";
import type { BucketTile } from "@/components/feasibility/bucket-strip";
import { BUCKET_ICONS, normalizeBucketKey } from "@/components/layout/bucket-icon";
import { statusBucketOf } from "@/lib/approval/gate";
import { cn } from "@/lib/utils";

/**
 * Status-wise distribution in a module sidebar.
 *
 * Deliberately identical to the Secondary Feasibility sidebar, because the house
 * buckets ARE the same buckets and the rule is that no stage should make you
 * re-learn it. Three tiers, and the third is the point:
 *
 *   <Stage> Register            the destination, rendered by the shell
 *     │ Not Started              ── the working states, nested behind a rule:
 *     │ Draft                       where work still SITS
 *     │ Need Info
 *     │ Pending Approval
 *     │ Not Approved
 *     ────────────────────────
 *   Not Sent / …                cross-cutting views (they do NOT add into the
 *                               total, so they must not read as a bucket)
 *   <Stage> Approved            the EXIT — what has LEFT this stage for the next
 *                               module. Its own row, OUTSIDE the nested
 *                               sequence, exactly as Secondary Feasibility puts
 *                               "Confirmed Feasibility" at the end.
 *
 * The tiles are the SAME ones the register derives, so the sidebar counts can
 * never drift from the table.
 */
export function SidebarBuckets({
  tiles,
  ariaLabel,
  unit,
}: {
  tiles: BucketTile[];
  /** e.g. "Quotation status distribution". */
  ariaLabel: string;
  /**
   * What one count counts — "line", "quotation", … Stated once above the rows
   * because the module's numbers count DIFFERENT things (the register counts
   * product lines, a costing counts cost sheets), and a bare number invites
   * exactly the "why don't these add up?" confusion.
   */
  unit?: string;
}) {
  if (tiles.length === 0) return null;

  const parent = tiles.find((t) => t.group === "all" || t.key === "all") ?? null;
  const flags = tiles.filter((t) => t.group === "flag");
  const rest = tiles.filter((t) => t !== parent && !flags.includes(t));
  // Each stage names its approved value after itself, so the exit is matched by
  // MEANING rather than by listing every spelling here.
  const approved = rest.find((t) => statusBucketOf(t.key) === "approved") ?? null;
  const working = rest.filter((t) => t !== approved);
  const total = parent?.count ?? rest.reduce((n, t) => n + t.count, 0);

  return (
    <nav className="flex w-full flex-col gap-1.5" aria-label={ariaLabel}>
      {parent && <BucketRow tile={parent} />}

      <div className="ml-3 flex flex-col gap-1 border-l border-[#e5e7eb] pl-2">
        {unit && (
          <p className="px-3.5 pb-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#9aa0ab]">
            {total} {total === 1 ? unit : `${unit}s`} by status
          </p>
        )}
        {working.map((t) => (
          <BucketRow key={t.key} tile={t} nested />
        ))}
      </div>

      {(flags.length > 0 || approved) && (
        <div className="my-1 h-[1.5px] rounded-full bg-[#c2c7d6]" />
      )}
      {flags.map((t) => (
        <BucketRow key={t.key} tile={t} flag />
      ))}
      {approved && <BucketRow tile={approved} exit />}
    </nav>
  );
}

function BucketRow({
  tile,
  nested,
  flag,
  exit,
}: {
  tile: BucketTile;
  nested?: boolean;
  flag?: boolean;
  /** The stage's approved destination — what has left for the next module. */
  exit?: boolean;
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
            ? // A cross-cutting view, not a bucket of the queue.
              "border-[1.5px] border-[#f0d3a4] bg-[#fdf6e7] font-bold text-[#8a5a08] hover:border-[#b45309] hover:bg-[#f9ecd2]"
            : exit
              ? // The exit reads as finished work, in the same green the
                // approved chip wears everywhere else in the app.
                "border-[1.5px] border-[#b7e0c6] bg-[#eef8f2] font-bold text-[#1c7a44] hover:border-[#16a34a] hover:bg-[#e2f3ea]"
              : "font-semibold text-[#3a4152] hover:bg-[#efeffb] hover:text-[#3f3f94]",
      )}
    >
      <Icon className={cn("shrink-0", nested ? "h-[17px] w-[17px]" : "h-[18px] w-[18px]")} />
      <span className="min-w-0 flex-1 truncate">{tile.label}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums font-black",
          tile.active ? "" : flag ? "text-[#8a5a08]" : exit ? "text-[#1c7a44]" : "text-[#6b7280]",
        )}
      >
        {tile.count}
      </span>
    </Link>
  );
}
