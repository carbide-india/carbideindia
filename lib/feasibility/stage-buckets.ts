/**
 * Feasibility stage buckets (pure, no I/O).
 *
 * Both feasibility stages expose the SAME house vocabulary — Not Started →
 * Draft → Need Info → Pending Approval → <Stage> Approved (+ Not Feasible,
 * which only feasibility may use). The canonical bucket arrays live in
 * `db/enums.ts` (`FEASIBILITY_STAGE_BUCKETS`, `SECONDARY_FEASIBILITY_STAGE_BUCKETS`);
 * this module answers the two questions those arrays cannot:
 *
 *   1. Which bucket does a row that still carries a LEGACY value belong to?
 *      Neither stage was backfilled (migration 0072 is additive only), so the
 *      dashboards must fold legacy values onto a bucket at READ time or the
 *      counts would silently drop rows.
 *   2. Which bucket should a save WRITE? (Secondary only — Primary already has
 *      an explicit status picker.)
 *
 * Kept free of `server-only` / db imports so both the Server Components and the
 * unit tests can use it.
 */

import {
  FEASIBILITY_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STAGE_BUCKETS,
  type FeasibilityStatus,
  type SecondaryFeasibilityStatus,
} from "@/db/enums";

/* ── Primary Feasibility ────────────────────────────────────────────────── */

/**
 * Legacy `feasibility_status` values folded onto the house bucket that
 * superseded them. `initiated` and `in_review` both became Draft (see
 * DEPRECATED_FEASIBILITY_STATUSES). `need_help` and `primary_feasibility_done`
 * have NO agreed supersession — they fall through to the Legacy tile rather
 * than being guessed into a bucket (or dropped from the counts).
 */
export const FEASIBILITY_LEGACY_FOLD: Partial<Record<FeasibilityStatus, FeasibilityStatus>> = {
  initiated: "draft",
  in_review: "draft",
};

/** The synthetic bucket id for statuses with no house home (shown only when > 0). */
export const LEGACY_BUCKET = "legacy";

export type FeasibilityBucket = FeasibilityStatus | typeof LEGACY_BUCKET;

/**
 * The bucket a Primary-Feasibility row counts in. Every possible status maps to
 * exactly one bucket, so the tiles always sum to the queue total.
 */
export function feasibilityBucketOf(status: FeasibilityStatus): FeasibilityBucket {
  const folded = FEASIBILITY_LEGACY_FOLD[status] ?? status;
  return (FEASIBILITY_STAGE_BUCKETS as readonly FeasibilityStatus[]).includes(folded)
    ? folded
    : LEGACY_BUCKET;
}

/* ── Secondary Feasibility ──────────────────────────────────────────────── */

/** The legacy per-line stamps the effective bucket is derived from. */
export interface SecondaryLegacyStamps {
  /** The value stored in `inquiry_items.secondary_feasibility_status`. */
  storedStatus: SecondaryFeasibilityStatus;
  /** Legacy completion flag (`secondary_feasibility_done`). */
  secondaryDone: boolean;
  /** Free-text technical verdict: feasible | not_feasible | needs_info. */
  secVerdict: string | null;
  /** True when ANY secondary technical field on the line carries a value. */
  hasSecondaryData: boolean;
}

/**
 * The bucket a Secondary line ACTUALLY sits in.
 *
 * The status column landed in migration 0072 with `DEFAULT 'not_started'` and
 * no backfill, so every pre-existing line — including finished ones — reads
 * `not_started`. Whenever the stored value is still that default we fall back
 * to the legacy stamps (done flag → verdict → any captured data). Once anything
 * writes a real bucket, the stored value wins outright.
 */
export function effectiveSecondaryBucket(r: SecondaryLegacyStamps): SecondaryFeasibilityStatus {
  if (r.storedStatus !== "not_started") return r.storedStatus;
  if (r.secondaryDone) {
    return r.secVerdict === "not_feasible" ? "not_feasible" : "secondary_feasibility_approved";
  }
  if (r.secVerdict === "not_feasible") return "not_feasible";
  if (r.secVerdict === "needs_info") return "need_info";
  if (r.hasSecondaryData) return "draft";
  return "not_started";
}

/**
 * The bucket a Secondary SAVE should write.
 *
 * Marking done is the only path to an end bucket: verdict `not_feasible` →
 * Not Feasible, anything else → Secondary Feasibility Approved (which is also
 * what locks + confirms the line — see `saveSecondaryFeasibility`). A plain
 * save moves an untouched line to Draft, or to Need Info when the reviewer set
 * that verdict, and NEVER demotes a line that has already reached Pending
 * Approval or an end bucket.
 *
 * @param current The line's EFFECTIVE bucket before the save.
 */
export function nextSecondaryBucket(args: {
  current: SecondaryFeasibilityStatus;
  markDone: boolean;
  verdict: string | null;
}): SecondaryFeasibilityStatus {
  const { current, markDone, verdict } = args;
  if (markDone) {
    return verdict === "not_feasible" ? "not_feasible" : "secondary_feasibility_approved";
  }
  if (verdict === "needs_info") return "need_info";
  if (
    current === "secondary_feasibility_approved" ||
    current === "not_feasible" ||
    current === "pending_approval"
  ) {
    return current;
  }
  return "draft";
}

/**
 * The buckets a user may move a Secondary line into by hand (queue quick-set /
 * bulk action). The two END buckets are deliberately excluded: reaching them
 * also locks + confirms the line for Costing, which only the Mark-Done flow
 * does. Letting the register flip a line to "Approved" without that would put
 * an approved-but-uncostable line on the dashboard.
 */
export const SECONDARY_SETTABLE_BUCKETS = [
  "not_started",
  "draft",
  "need_info",
  "pending_approval",
] as const satisfies readonly SecondaryFeasibilityStatus[];
export type SecondarySettableBucket = (typeof SECONDARY_SETTABLE_BUCKETS)[number];

export function isSecondarySettableBucket(v: string): v is SecondarySettableBucket {
  return (SECONDARY_SETTABLE_BUCKETS as readonly string[]).includes(v);
}

/**
 * Back-compat for the queue's two pre-house filter values. `?status=pending`
 * and `?status=done` were the only Secondary filters before the buckets
 * existed; bookmarks and the old sidebar still carry them.
 */
export const SECONDARY_FILTER_ALIASES: Record<string, readonly SecondaryFeasibilityStatus[]> = {
  pending: ["not_started", "draft", "need_info", "pending_approval"],
  done: ["secondary_feasibility_approved"],
};

/** Resolve a `?status=` value to the set of Secondary buckets it selects. */
export function resolveSecondaryFilter(
  value: string | undefined,
): readonly SecondaryFeasibilityStatus[] | null {
  if (!value) return null;
  if ((SECONDARY_FEASIBILITY_STAGE_BUCKETS as readonly string[]).includes(value)) {
    return [value as SecondaryFeasibilityStatus];
  }
  // `Object.hasOwn`, not a bare lookup — an inherited key ("toString") must not
  // resolve to a function and blow up the caller's `.includes()`.
  return Object.hasOwn(SECONDARY_FILTER_ALIASES, value)
    ? (SECONDARY_FILTER_ALIASES[value] ?? null)
    : null;
}
