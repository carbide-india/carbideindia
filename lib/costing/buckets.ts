/**
 * Costing stage buckets (pure, no I/O).
 *
 * Manan's review, 2026-08: "40 enquiries came in today. I did Primary on all 40.
 * I did Secondary on 20. So Costing shows 20. But I only costed 3 — 17 costings
 * are NOT DONE. I need to see the Not Done."
 *
 * The Costing register therefore counts PRODUCT LINES (the unit of costing work),
 * not `costings` rows: one line can carry an in-house row AND a bought-out row
 * AND several revisions, but it is still ONE costing job. A line with no costing
 * row at all lands in the Not Started bucket — that is the whole point, and the
 * only way "17 not done" can ever appear on screen.
 *
 * The bucket vocabulary itself is the house one and lives in `db/enums.ts`
 * (COSTING_STAGE_BUCKETS / _LABELS / _COLORS). Nothing here hardcodes a colour.
 */

import {
  COSTING_DONE_STATUS_LABELS,
  COSTING_STAGE_BUCKETS,
  type CostingDoneStatus,
} from "@/db/enums";

/** One of the five house buckets of the Costing stage. */
export type CostingBucket = (typeof COSTING_STAGE_BUCKETS)[number];

/**
 * Legacy statuses fold into the house buckets so no row is ever silently
 * dropped from a count: `in_process` was the old "someone is working on it"
 * (= Draft) and `done` was the old approval (= Costing Approved). Both remain
 * legal values in the pgEnum — see DEPRECATED_COSTING_DONE_STATUSES.
 */
const LEGACY_FOLD: Partial<Record<CostingDoneStatus, CostingBucket>> = {
  in_process: "draft",
  done: "costing_approved",
};

const BUCKET_SET: ReadonlySet<string> = new Set<string>(COSTING_STAGE_BUCKETS);

/**
 * The bucket a costing status belongs to. `null` (a costable product line that
 * has NO costing row yet) is the Not Started / "Not Done" bucket.
 */
export function costingBucketOf(
  status: CostingDoneStatus | null | undefined,
): CostingBucket {
  if (status == null) return "not_done";
  const folded = LEGACY_FOLD[status];
  if (folded) return folded;
  return BUCKET_SET.has(status) ? (status as CostingBucket) : "not_done";
}

/** Bucket label — always the enum's label, never a locally invented string. */
export function costingBucketLabel(bucket: CostingBucket): string {
  return COSTING_DONE_STATUS_LABELS[bucket];
}

/** Narrow an untrusted `?bucket=` search param to a real bucket (else null). */
export function parseCostingBucket(
  value: string | string[] | undefined,
): CostingBucket | null {
  const v = typeof value === "string" ? value : null;
  if (!v) return null;
  return BUCKET_SET.has(v) ? (v as CostingBucket) : null;
}

/** Start-of-day in the runtime's local zone — overdue is a CALENDAR question. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Is this costing overdue? A target date strictly BEFORE today is overdue —
 * "due today" is not late. Approved work is never overdue (it is finished), and
 * a line with no target date can never be overdue (an un-dated costing is legal).
 */
export function isCostingOverdue(
  targetDate: Date | null | undefined,
  bucket: CostingBucket,
  now: Date = new Date(),
): boolean {
  if (!targetDate) return false;
  if (bucket === "costing_approved") return false;
  return startOfDay(targetDate) < startOfDay(now);
}

/** Days late (positive) / days remaining (negative). Null when un-dated. */
export function costingDaysToTarget(
  targetDate: Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!targetDate) return null;
  const ms = startOfDay(targetDate) - startOfDay(now);
  return Math.round(ms / 86_400_000);
}

/** Counts per bucket, every bucket present (a missing key would read as "no data"). */
export function countCostingBuckets(
  buckets: readonly CostingBucket[],
): Record<CostingBucket, number> {
  const out = Object.fromEntries(
    COSTING_STAGE_BUCKETS.map((b) => [b, 0]),
  ) as Record<CostingBucket, number>;
  for (const b of buckets) out[b] += 1;
  return out;
}

/**
 * Display label for a revision at position `index` (0-based) in the revision
 * list ordered oldest-first: "Costing 1", "Costing 2", "Costing 3".
 *
 * Deliberately POSITIONAL rather than `revisionNo`: every row created before
 * migration 0072 carries the column default `revision_no = 1`, so trusting the
 * stored number would label a legacy line's three re-costings "Costing 1"
 * three times. For rows created by `reviseCosting` the two agree exactly.
 */
export function costingRevisionLabel(index: number): string {
  return `Costing ${index + 1}`;
}
