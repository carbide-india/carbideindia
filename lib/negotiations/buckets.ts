import {
  NEGOTIATION_STAGES,
  NEGOTIATION_STAGE_BUCKETS,
  NEGOTIATION_STATUSES,
  type NegotiationStage,
  type NegotiationStatus,
} from "@/db/enums";

/**
 * Negotiation stage buckets — the pure half of the /negotiations dashboard.
 *
 * Negotiation's buckets are the SEVEN board columns (Hetesh, 2026-08-13): Not
 * Started → Need Info → Follow Up → Revise Quote → Won / Lost / Abandoned. It is
 * the one stage that does not run the house approval ladder, because a deal is
 * never "approved" — it ends in an outcome the customer decides.
 *
 * Everything else in the enum is OFF THE BOARD: statuses no new deal can reach,
 * left behind by earlier versions of this module (draft, pending_approval,
 * negotiation_approved, verbal_yes, on_hold, need_help). They share one physical
 * column with the columns above, so a row is in exactly one of the two sets.
 *
 * That matters for honesty: the seven columns do NOT sum to the register total on
 * a live database, because legacy rows still sit off-board. The dashboard shows
 * that side too, and Total = Σ columns + Σ off-board, with no row unaccounted for.
 */

/** The seven board columns, as a Set, for O(1) membership. */
const BUCKET_SET: ReadonlySet<string> = new Set(NEGOTIATION_STAGE_BUCKETS);

/** Is this status one of the seven board columns? */
export function isNegotiationBucket(s: NegotiationStatus): boolean {
  return BUCKET_SET.has(s);
}

/**
 * Statuses with NO column on the board = every enum value that is not a bucket,
 * kept in enum order (pipeline order, matching the register's status sort).
 * Derived rather than hand-listed so an appended enum value can never silently
 * fall out of both sets.
 *
 * These are legacy rows awaiting a move, not a second workflow — the register
 * lists them so they are visible; the board deliberately does not.
 */
export const NEGOTIATION_OFF_BOARD_STATUSES: readonly NegotiationStatus[] =
  NEGOTIATION_STATUSES.filter((s) => !BUCKET_SET.has(s));

/**
 * Deals that are over — no further negotiation work is expected on them. Used
 * only to split "open value" from "closed value" on the volume tiles; it is NOT
 * a status transition rule.
 */
export const NEGOTIATION_CLOSED_STATUSES = [
  "order_won",
  "order_lost",
  "order_abandoned",
] as const satisfies readonly NegotiationStatus[];

const CLOSED_SET: ReadonlySet<string> = new Set(NEGOTIATION_CLOSED_STATUSES);

/** Still live in the negotiation stage (not won / lost / abandoned). */
export function isNegotiationOpen(s: NegotiationStatus): boolean {
  return !CLOSED_SET.has(s);
}

/** Every open status, for the "In Negotiation" tile's drill-through. */
export const NEGOTIATION_OPEN_STATUSES: readonly NegotiationStatus[] =
  NEGOTIATION_STATUSES.filter(isNegotiationOpen);

/**
 * Statuses that count as "this negotiation is approved" for the Issue-Sales-Order
 * gate. `order_won` is accepted as a LEGACY SYNONYM of `negotiation_approved` —
 * same posture the costing stage takes with `done` vs `costing_approved` — because
 * every negotiation converted before 2026-08 was stamped `order_won` and no data
 * backfill was written. Whether `negotiation_approved` ultimately REPLACES
 * `order_won` or PRECEDES it is an open question for Manan; accepting both is the
 * conservative reading that breaks nothing either way.
 */
export const NEGOTIATION_SO_READY_STATUSES = [
  "negotiation_approved",
  "order_won",
] as const satisfies readonly NegotiationStatus[];

const SO_READY_SET: ReadonlySet<string> = new Set(NEGOTIATION_SO_READY_STATUSES);

/** Approved enough to issue a sales order (see NEGOTIATION_SO_READY_STATUSES). */
export function isNegotiationApprovedForSo(s: NegotiationStatus): boolean {
  return SO_READY_SET.has(s);
}

/** One grouped row straight out of the dashboard SQL. */
export interface NegotiationGroupRow {
  status: NegotiationStatus;
  stage: NegotiationStage;
  /** At least one proforma invoice has gone out (pi_iteration_count > 0). */
  piSent: boolean;
  count: number;
  /** Quoted value of those negotiations, in ₹ (see the query for derivation). */
  value: number;
}

/** A count + ₹ value pair. */
export interface CountValue {
  count: number;
  value: number;
}

export interface NegotiationDashboard {
  total: number;
  totalValue: number;
  /** Count per status — every enum value present, zero-filled. */
  counts: Record<NegotiationStatus, number>;
  /** Quoted value per status, same key set. */
  values: Record<NegotiationStatus, number>;
  /** Count per PI-pipeline stage, zero-filled. */
  stages: Record<NegotiationStage, number>;
  /** Rows sitting on the seven board columns (Σ of the column counts). */
  bucketTotal: number;
  /** Rows on a legacy status with no column — visible, but not on the board. */
  offBoardTotal: CountValue;
  /** "इतना तो मैंने भेज दिया" — at least one PI actually issued. */
  sent: CountValue;
  /** "इतना नेगोशिएशन स्टेज में है" — still open (not won/lost/abandoned). */
  open: CountValue;
  won: CountValue;
}

function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/**
 * Fold the grouped SQL rows into the dashboard shape. Pure so the derivation of
 * every number on the register header is unit-testable: no row may be dropped,
 * and `total` must always equal `bucketTotal + offBoardTotal.count`.
 */
export function buildNegotiationDashboard(
  groups: readonly NegotiationGroupRow[],
): NegotiationDashboard {
  const counts = zeroed(NEGOTIATION_STATUSES);
  const values = zeroed(NEGOTIATION_STATUSES);
  const stages = zeroed(NEGOTIATION_STAGES);

  let total = 0;
  let totalValue = 0;
  let bucketTotal = 0;
  const offBoardTotal: CountValue = { count: 0, value: 0 };
  const sent: CountValue = { count: 0, value: 0 };
  const open: CountValue = { count: 0, value: 0 };
  const won: CountValue = { count: 0, value: 0 };

  for (const g of groups) {
    const n = Number.isFinite(g.count) ? g.count : 0;
    const v = Number.isFinite(g.value) ? g.value : 0;

    total += n;
    totalValue += v;
    counts[g.status] += n;
    values[g.status] += v;
    stages[g.stage] += n;

    if (isNegotiationBucket(g.status)) {
      bucketTotal += n;
    } else {
      offBoardTotal.count += n;
      offBoardTotal.value += v;
    }
    if (g.piSent) {
      sent.count += n;
      sent.value += v;
    }
    if (isNegotiationOpen(g.status)) {
      open.count += n;
      open.value += v;
    }
    if (g.status === "order_won") {
      won.count += n;
      won.value += v;
    }
  }

  return { total, totalValue, counts, values, stages, bucketTotal, offBoardTotal, sent, open, won };
}

/** An empty dashboard — what a fresh install renders before the first row. */
export function emptyNegotiationDashboard(): NegotiationDashboard {
  return buildNegotiationDashboard([]);
}
