/**
 * Quotation stage buckets - the pure model behind the register dashboard.
 *
 * The house vocabulary (Manan, 2026-08 pipeline review) is the SAME five
 * buckets at every sales stage: Not Started → Draft → Need Info → Pending
 * Approval → <Stage> Approved. For Quotation those live on
 * `quotations.quotation_status` (QUOTATION_STAGE_BUCKETS) and are mutually
 * exclusive: their counts always sum to the register total.
 *
 * "Not Sent" is the ONE extra thing Manan named for this stage. It is NOT a
 * sixth bucket - it is the `quote_sent = false` flag, which cuts ACROSS the
 * five buckets (a Draft is also unsent). It is therefore modelled as a
 * cross-cutting tile that combines with a bucket instead of replacing it, and
 * is rendered after a divider so the strip never implies the six numbers add up.
 *
 * No colours are hardcoded here: every tone comes from QUOTATION_STATUS_COLORS
 * (which agrees with HOUSE_BUCKET_TONES in db/enums.ts).
 */
import {
  QUOTATION_STAGE_BUCKETS,
  QUOTATION_STATUS_COLORS,
  QUOTATION_STATUS_LABELS,
  type QuotationStatus,
} from "@/db/enums";

/** One `GROUP BY quotation_status, quote_sent` row, as read from the DB. */
export interface QuotationBucketTally {
  status: QuotationStatus;
  quoteSent: boolean;
  n: number;
}

/** Live counts behind the register dashboard. Every field is derived from the
 *  SAME group-by, so the parts can never drift from the total. */
export interface QuotationBucketCounts {
  /** Every quotation row. Quotations have no soft-delete, so this is the whole
   *  register - the unfiltered list length. */
  total: number;
  /** Rows per house bucket. Mutually exclusive; sums exactly to `total`. */
  byBucket: Record<QuotationStatus, number>;
  /** Rows with `quote_sent = false`, in ANY bucket (cross-cutting). */
  notSent: number;
  /** Rows that are Quotation Approved but still unsent - the actionable slice
   *  of `notSent` ("approved, nothing stopping us, still not out"). */
  approvedNotSent: number;
}

/** All-zero counts - what a fresh install renders. */
export function emptyQuotationBucketCounts(): QuotationBucketCounts {
  const byBucket = {} as Record<QuotationStatus, number>;
  for (const b of QUOTATION_STAGE_BUCKETS) byBucket[b] = 0;
  return { total: 0, byBucket, notSent: 0, approvedNotSent: 0 };
}

/**
 * Fold raw `(status, quote_sent, n)` tallies into the dashboard counts. Unknown
 * status values (a row written by a newer enum member than this build knows)
 * are still counted into `total` / `notSent` so a tile never silently hides a
 * row - they just have no bucket of their own to land in.
 */
export function foldQuotationBucketCounts(
  rows: readonly QuotationBucketTally[],
): QuotationBucketCounts {
  const out = emptyQuotationBucketCounts();
  for (const r of rows) {
    const n = Number.isFinite(r.n) ? r.n : 0;
    out.total += n;
    if (r.status in out.byBucket) out.byBucket[r.status] += n;
    if (!r.quoteSent) {
      out.notSent += n;
      if (r.status === "quotation_approved") out.approvedNotSent += n;
    }
  }
  return out;
}

/** The register's current URL-driven selection. */
export interface QuotationBucketSelection {
  bucket: QuotationStatus | null;
  /** `true` = only unsent quotes (`?sent=no`). */
  notSentOnly: boolean;
}

/** A dashboard tile: a count, a tone token and the href that filters the
 *  register to it. Clicking the ACTIVE tile clears that part of the filter. */
export interface QuotationBucketTile {
  key: string;
  label: string;
  count: number;
  /** Status colour token (globals.css `--color-*`) - never a hex. */
  tone: string;
  href: string;
  active: boolean;
  /** Secondary line under the label (e.g. "12 approved & unsent"). */
  sub?: string;
  /** True for the `Not Sent` tile: a flag that combines with a bucket rather
   *  than a mutually-exclusive bucket of its own. */
  crossCutting?: boolean;
  /** How the sidebar groups this tile — see `BucketTile` in bucket-strip. */
  group?: "all" | "bucket" | "flag";
}

/** `/quotations` with the given filter parts, omitting empty ones. */
function href(bucket: QuotationStatus | null, notSentOnly: boolean): string {
  const qs = new URLSearchParams();
  if (bucket) qs.set("bucket", bucket);
  if (notSentOnly) qs.set("sent", "no");
  const s = qs.toString();
  return s ? `/quotations?${s}` : "/quotations";
}

/**
 * Build the dashboard strip: an "All" tile, the five mutually-exclusive house
 * buckets in order, then the cross-cutting "Not Sent" tile. Tiles toggle - the
 * href of an active tile drops its own filter and keeps the other one.
 */
export function buildQuotationBucketTiles(
  counts: QuotationBucketCounts,
  selection: QuotationBucketSelection,
): QuotationBucketTile[] {
  const { bucket, notSentOnly } = selection;

  const tiles: QuotationBucketTile[] = [
    {
      key: "all",
      group: "all",
      label: "All Quotations",
      count: counts.total,
      // Not a status: the "All" tile wears the brand indigo, which follows the
      // same `--color-X` / `--color-X-deep` token shape as the status tones.
      tone: "brand",
      href: href(null, notSentOnly),
      active: bucket === null,
    },
  ];

  for (const b of QUOTATION_STAGE_BUCKETS) {
    const active = bucket === b;
    tiles.push({
      key: b,
      label: QUOTATION_STATUS_LABELS[b],
      count: counts.byBucket[b],
      tone: QUOTATION_STATUS_COLORS[b],
      href: href(active ? null : b, notSentOnly),
      active,
    });
  }

  // "Not Sent" USED TO BE A TILE HERE, removed 2026-08-13. It was the third
  // place to answer one question: the register table already carries a
  // "Quote sent" Yes/No column filter AND a bulk setter, so a sidebar row for
  // it was a filter competing with a filter. `?sent=no` still resolves, so the
  // links that used it are unbroken.
  return tiles;
}

/** Parse `?bucket=` / `?sent=` into a selection, ignoring anything unknown. */
export function parseQuotationSelection(sp: {
  bucket?: string;
  sent?: string;
}): QuotationBucketSelection {
  const bucket = (QUOTATION_STAGE_BUCKETS as readonly string[]).includes(
    sp.bucket ?? "",
  )
    ? (sp.bucket as QuotationStatus)
    : null;
  return { bucket, notSentOnly: sp.sent === "no" };
}
