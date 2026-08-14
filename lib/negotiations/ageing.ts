import {
  NEGOTIATION_AGEING_BUCKETS,
  type NegotiationAgeingKey,
  type NegotiationStatus,
} from "@/db/enums";
import { NEGOTIATION_CLOSED_STATUSES } from "@/lib/negotiations/buckets";

/**
 * "After 15 Days / 1 Month / 2 Months" — how long a deal has sat untouched.
 *
 * COMPUTED, never stored (Hetesh, 2026-08-13: "automatic"). Storing it would
 * mean a nightly job and a column that is wrong between runs; derived, it is
 * right the moment you look at it.
 *
 * Cross-cutting by nature: a deal in Follow Up for 40 days is in BOTH Follow Up
 * and After 1 Month, so these never sum with the status columns and must not be
 * drawn as if they did.
 *
 * Pure, so the thresholds are testable without a clock or a database.
 */

/** Whole days between two instants, floored — 23h is not yet a day. */
export function daysSince(since: Date, now: Date): number {
  return Math.floor((now.getTime() - since.getTime()) / 86_400_000);
}

/**
 * Every ageing bucket a deal currently falls into, oldest threshold last.
 *
 * A 70-day-old deal is in all three: it IS after 15 days, and after 1 month, and
 * after 2 months. Reporting only the largest would make the "After 15 Days"
 * count lie about how much is stale.
 *
 * CLOSED deals (Won / Lost / Abandoned) are never aged: nobody needs chasing
 * about a deal that is finished, and including them would bury the live ones.
 */
export function ageingKeysFor(
  status: NegotiationStatus,
  lastActivityAt: Date,
  now: Date = new Date(),
): NegotiationAgeingKey[] {
  if ((NEGOTIATION_CLOSED_STATUSES as readonly string[]).includes(status)) return [];
  const age = daysSince(lastActivityAt, now);
  return NEGOTIATION_AGEING_BUCKETS.filter((b) => age >= b.days).map((b) => b.key);
}

/** True when the deal is in that specific ageing view. */
export function isInAgeingBucket(
  key: NegotiationAgeingKey,
  status: NegotiationStatus,
  lastActivityAt: Date,
  now: Date = new Date(),
): boolean {
  return ageingKeysFor(status, lastActivityAt, now).includes(key);
}

/** Counts per ageing view over a set of deals — every key present, zero-filled
 *  so a missing key can never read as "no data". */
export function countAgeing(
  rows: readonly { negotiationStatus: NegotiationStatus; lastActivityAt: Date }[],
  now: Date = new Date(),
): Record<NegotiationAgeingKey, number> {
  const out = Object.fromEntries(
    NEGOTIATION_AGEING_BUCKETS.map((b) => [b.key, 0]),
  ) as Record<NegotiationAgeingKey, number>;
  for (const r of rows) {
    for (const k of ageingKeysFor(r.negotiationStatus, r.lastActivityAt, now)) {
      out[k] += 1;
    }
  }
  return out;
}

/** A short "untouched for N days" label for a card. Null when it is fresh. */
export function stalenessLabel(
  status: NegotiationStatus,
  lastActivityAt: Date,
  now: Date = new Date(),
): string | null {
  if ((NEGOTIATION_CLOSED_STATUSES as readonly string[]).includes(status)) return null;
  const age = daysSince(lastActivityAt, now);
  if (age < NEGOTIATION_AGEING_BUCKETS[0].days) return null;
  return `${age} days untouched`;
}
