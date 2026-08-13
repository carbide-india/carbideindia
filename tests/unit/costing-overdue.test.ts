import { describe, expect, it } from "vitest";
import { costingDaysToTarget, isCostingOverdue } from "@/lib/costing/buckets";

/**
 * The Overdue flag on the Costing register.
 *
 * Untested until now — the sidebar tile has been reading 0, and 0 is only
 * trustworthy if the rule is. `now` is injectable precisely so this can be
 * pinned without touching the clock.
 */

const NOW = new Date("2026-08-13T11:30:00+05:30");
const day = (s: string) => new Date(`${s}T00:00:00+05:30`);

describe("isCostingOverdue", () => {
  it("is overdue once the target date is in the past", () => {
    expect(isCostingOverdue(day("2026-08-12"), "not_done", NOW)).toBe(true);
    expect(isCostingOverdue(day("2026-07-01"), "draft", NOW)).toBe(true);
  });

  it("is NOT overdue on the target date itself", () => {
    // You have until the end of the day you promised — comparing whole days,
    // not timestamps, is what makes that true regardless of the time of day.
    expect(isCostingOverdue(day("2026-08-13"), "not_done", NOW)).toBe(false);
  });

  it("is not overdue while the target date is still ahead", () => {
    expect(isCostingOverdue(day("2026-08-30"), "not_done", NOW)).toBe(false);
  });

  it("ignores the time of day on both sides", () => {
    const lateInTheDay = new Date("2026-08-13T23:59:00+05:30");
    expect(isCostingOverdue(new Date("2026-08-13T00:01:00+05:30"), "draft", lateInTheDay)).toBe(
      false,
    );
  });

  it("never flags an un-dated costing", () => {
    // 12 of the 13 live cost sheets have no target date. If un-dated counted as
    // overdue the tile would scream about work nobody ever promised a date for.
    expect(isCostingOverdue(null, "not_done", NOW)).toBe(false);
    expect(isCostingOverdue(undefined, "draft", NOW)).toBe(false);
  });

  it("never flags an approved costing, however old the target", () => {
    // Approved is finished. A finished thing cannot be late.
    expect(isCostingOverdue(day("2020-01-01"), "costing_approved", NOW)).toBe(false);
  });

  it("DOES flag every unfinished bucket", () => {
    for (const b of ["not_done", "draft", "need_info", "pending_approval"] as const) {
      expect(isCostingOverdue(day("2026-08-01"), b, NOW), b).toBe(true);
    }
  });
});

describe("costingDaysToTarget", () => {
  it("counts days late as positive and days remaining as negative", () => {
    expect(costingDaysToTarget(day("2026-08-10"), NOW)).toBe(-3);
    expect(costingDaysToTarget(day("2026-08-16"), NOW)).toBe(3);
  });

  it("is zero on the day itself", () => {
    expect(costingDaysToTarget(day("2026-08-13"), NOW)).toBe(0);
  });

  it("is null when un-dated", () => {
    expect(costingDaysToTarget(null, NOW)).toBeNull();
  });

  it("survives a DST-free month boundary", () => {
    expect(costingDaysToTarget(day("2026-09-01"), NOW)).toBe(19);
  });
});
