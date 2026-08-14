import { describe, expect, it } from "vitest";
import {
  ageingKeysFor,
  countAgeing,
  daysSince,
  isInAgeingBucket,
  stalenessLabel,
} from "@/lib/negotiations/ageing";
import { NEGOTIATION_AGEING_BUCKETS } from "@/db/enums";

/**
 * The ageing views are computed on every read, so their thresholds are pinned
 * here rather than trusted. `now` is injectable precisely so this needs no clock.
 */

const NOW = new Date("2026-08-14T10:00:00+05:30");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("daysSince", () => {
  it("floors — 23 hours is not yet a day", () => {
    expect(daysSince(new Date(NOW.getTime() - 23 * 3_600_000), NOW)).toBe(0);
    expect(daysSince(new Date(NOW.getTime() - 25 * 3_600_000), NOW)).toBe(1);
  });
});

describe("ageingKeysFor", () => {
  it("is empty while the deal is fresh", () => {
    expect(ageingKeysFor("follow_up", daysAgo(0), NOW)).toEqual([]);
    expect(ageingKeysFor("follow_up", daysAgo(14), NOW)).toEqual([]);
  });

  it("enters a bucket exactly ON the threshold", () => {
    expect(ageingKeysFor("follow_up", daysAgo(15), NOW)).toEqual(["after_15_days"]);
    expect(ageingKeysFor("follow_up", daysAgo(30), NOW)).toEqual([
      "after_15_days",
      "after_1_month",
    ]);
  });

  it("an old deal is in EVERY bucket it has passed, not just the largest", () => {
    // Reporting only the biggest would make "After 15 Days" understate how much
    // is actually stale, which is the number the follow-up call is made from.
    expect(ageingKeysFor("to_start", daysAgo(70), NOW)).toEqual([
      "after_15_days",
      "after_1_month",
      "after_2_months",
    ]);
  });

  it("never ages a closed deal", () => {
    // Nobody needs chasing about a deal that is finished, and including them
    // would bury the live ones in the count.
    for (const s of ["order_won", "order_lost", "order_abandoned"] as const) {
      expect(ageingKeysFor(s, daysAgo(400), NOW), s).toEqual([]);
    }
  });

  it("ages every OPEN status", () => {
    for (const s of ["to_start", "need_info", "follow_up", "revision"] as const) {
      expect(ageingKeysFor(s, daysAgo(20), NOW), s).toContain("after_15_days");
    }
  });
});

describe("isInAgeingBucket", () => {
  it("answers per bucket", () => {
    expect(isInAgeingBucket("after_1_month", "follow_up", daysAgo(31), NOW)).toBe(true);
    expect(isInAgeingBucket("after_2_months", "follow_up", daysAgo(31), NOW)).toBe(false);
  });
});

describe("countAgeing", () => {
  it("zero-fills every bucket so a gap never reads as no data", () => {
    expect(countAgeing([], NOW)).toEqual({
      after_15_days: 0,
      after_1_month: 0,
      after_2_months: 0,
    });
  });

  it("counts a deal into every bucket it qualifies for", () => {
    const counts = countAgeing(
      [
        { negotiationStatus: "follow_up", lastActivityAt: daysAgo(70) },
        { negotiationStatus: "to_start", lastActivityAt: daysAgo(20) },
        { negotiationStatus: "revision", lastActivityAt: daysAgo(2) },
        { negotiationStatus: "order_won", lastActivityAt: daysAgo(365) },
      ],
      NOW,
    );
    expect(counts).toEqual({
      after_15_days: 2, // the 70-day and the 20-day
      after_1_month: 1, // only the 70-day
      after_2_months: 1,
    });
  });
});

describe("stalenessLabel", () => {
  it("says nothing while the deal is fresh", () => {
    expect(stalenessLabel("follow_up", daysAgo(3), NOW)).toBeNull();
  });

  it("reports the real age once past the first threshold", () => {
    expect(stalenessLabel("follow_up", daysAgo(41), NOW)).toBe("41 days untouched");
  });

  it("says nothing about a closed deal", () => {
    expect(stalenessLabel("order_lost", daysAgo(300), NOW)).toBeNull();
  });
});

describe("the buckets themselves", () => {
  it("are ordered smallest threshold first", () => {
    const days = NEGOTIATION_AGEING_BUCKETS.map((b) => b.days);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("are the three Manan named", () => {
    expect(NEGOTIATION_AGEING_BUCKETS.map((b) => b.label)).toEqual([
      "After 15 Days",
      "After 1 Month",
      "After 2 Months",
    ]);
  });
});
