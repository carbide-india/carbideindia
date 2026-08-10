import Link from "next/link";
import type { Route } from "next";
import { FileClock } from "lucide-react";
import type {
  QuotationBucketCounts,
  QuotationBucketSelection,
  QuotationBucketTile,
} from "@/components/quotations/quotation-buckets";
import { buildQuotationBucketTiles } from "@/components/quotations/quotation-buckets";

interface Props {
  counts: QuotationBucketCounts;
  selection: QuotationBucketSelection;
  /** Approved+locked product lines with no quotation line yet - the stage's
   *  inflow. Rendered as a separate note, NOT as a bucket: these rows are not
   *  in the register, so no tile could filter to them. */
  readyToQuote: number;
}

/**
 * Quotation dashboard strip - "what is left" at this stage.
 *
 * Five mutually-exclusive house buckets (they sum to All) plus the cross-cutting
 * "Not Sent" tile after a divider. Every tile is a Link that filters the
 * register server-side; the ACTIVE tile's href clears its own filter, so tiles
 * toggle and Not Sent combines with a bucket instead of replacing it.
 *
 * Tones come from QUOTATION_STATUS_COLORS via the tile model - no colour is
 * decided here.
 */
export function QuotationBucketStrip({ counts, selection, readyToQuote }: Props) {
  const tiles = buildQuotationBucketTiles(counts, selection);
  const buckets = tiles.filter((t) => !t.crossCutting);
  const flags = tiles.filter((t) => t.crossCutting);

  return (
    <section aria-label="Quotation buckets" className="mb-5 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-stretch gap-2.5">
        {buckets.map((t) => (
          <BucketTile key={t.key} tile={t} />
        ))}
        {flags.length > 0 && (
          <>
            <span
              aria-hidden
              className="mx-0.5 w-px shrink-0 self-stretch bg-hairline"
            />
            {flags.map((t) => (
              <BucketTile key={t.key} tile={t} />
            ))}
          </>
        )}
      </div>

      {readyToQuote > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
          <FileClock size={13} strokeWidth={2.4} className="text-brand" />
          <span className="tabular-nums text-ink-strong">{readyToQuote}</span>
          {readyToQuote === 1 ? "product line has" : "product lines have"} an
          approved &amp; locked costing but no quotation yet
          <Link
            href={"/quotations/new" as Route}
            className="font-bold text-brand hover:underline"
          >
            - start one
          </Link>
        </p>
      )}
    </section>
  );
}

/** One dashboard tile: big count + label, tinted by the bucket's tone token.
 *  The active tile fills in its tone so the current filter is unmistakable. */
function BucketTile({ tile }: { tile: QuotationBucketTile }) {
  const { tone, active, count, label, sub } = tile;
  return (
    <Link
      href={tile.href as Route}
      aria-current={active ? "true" : undefined}
      title={
        tile.crossCutting
          ? `${label} - combines with the selected bucket`
          : `Show only ${label}`
      }
      className={`group flex min-w-[124px] flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        active
          ? ""
          : "border-hairline bg-surface-card hover:border-hairline-strong"
      }`}
      style={{
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        ...(active
          ? {
              borderColor: `color-mix(in srgb, var(--color-${tone}) 55%, transparent)`,
              background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
            }
          : null),
      }}
    >
      <span
        className="font-mono text-[21px] font-black leading-none tabular-nums"
        style={{ color: `var(--color-${tone}-deep)` }}
      >
        {count}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[11px] font-bold uppercase tracking-[0.03em] text-ink-strong">
          {label}
        </span>
        {sub && (
          <span className="block truncate text-[10px] font-semibold text-ink-subtle">
            {sub}
          </span>
        )}
      </span>
    </Link>
  );
}
