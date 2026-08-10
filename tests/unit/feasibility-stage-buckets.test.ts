import { describe, it, expect } from "vitest";
import {
  FEASIBILITY_STATUSES,
  FEASIBILITY_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STAGE_BUCKETS,
  type SecondaryFeasibilityStatus,
} from "@/db/enums";
import {
  LEGACY_BUCKET,
  effectiveSecondaryBucket,
  feasibilityBucketOf,
  isSecondarySettableBucket,
  nextSecondaryBucket,
  resolveSecondaryFilter,
} from "@/lib/feasibility/stage-buckets";

/**
 * The dashboards are only trustworthy if bucketing is TOTAL — every possible
 * status lands in exactly one tile, so the tiles always sum to the queue total.
 */
describe("feasibilityBucketOf", () => {
  it("maps every enum value to exactly one bucket (nothing is dropped)", () => {
    for (const s of FEASIBILITY_STATUSES) {
      const b = feasibilityBucketOf(s);
      const known = [...FEASIBILITY_STAGE_BUCKETS, LEGACY_BUCKET] as readonly string[];
      expect(known).toContain(b);
    }
  });

  it("keeps a house status in its own bucket", () => {
    for (const b of FEASIBILITY_STAGE_BUCKETS) {
      expect(feasibilityBucketOf(b)).toBe(b);
    }
  });

  it("folds the deprecated spellings of Draft onto draft", () => {
    expect(feasibilityBucketOf("initiated")).toBe("draft");
    expect(feasibilityBucketOf("in_review")).toBe("draft");
  });

  it("parks statuses with no agreed supersession in the Legacy bucket", () => {
    expect(feasibilityBucketOf("need_help")).toBe(LEGACY_BUCKET);
    expect(feasibilityBucketOf("primary_feasibility_done")).toBe(LEGACY_BUCKET);
  });
});

describe("effectiveSecondaryBucket", () => {
  const base = {
    storedStatus: "not_started" as SecondaryFeasibilityStatus,
    secondaryDone: false,
    secVerdict: null as string | null,
    hasSecondaryData: false,
  };

  it("returns Not Started for an untouched line", () => {
    expect(effectiveSecondaryBucket(base)).toBe("not_started");
  });

  it("honours a stored bucket outright", () => {
    expect(
      effectiveSecondaryBucket({ ...base, storedStatus: "pending_approval", secondaryDone: true }),
    ).toBe("pending_approval");
  });

  it("folds a legacy done stamp onto Approved (migration 0072 had no backfill)", () => {
    expect(effectiveSecondaryBucket({ ...base, secondaryDone: true })).toBe(
      "secondary_feasibility_approved",
    );
  });

  it("folds a legacy done + not_feasible verdict onto Not Feasible", () => {
    expect(
      effectiveSecondaryBucket({ ...base, secondaryDone: true, secVerdict: "not_feasible" }),
    ).toBe("not_feasible");
  });

  it("reads an unfinished needs_info verdict as Need Info", () => {
    expect(effectiveSecondaryBucket({ ...base, secVerdict: "needs_info" })).toBe("need_info");
  });

  it("reads captured-but-unfinished technical data as Draft", () => {
    expect(effectiveSecondaryBucket({ ...base, hasSecondaryData: true })).toBe("draft");
  });

  it("only ever returns a real Secondary bucket", () => {
    const combos = [true, false].flatMap((done) =>
      [null, "feasible", "not_feasible", "needs_info"].flatMap((v) =>
        [true, false].map((data) => ({ ...base, secondaryDone: done, secVerdict: v, hasSecondaryData: data })),
      ),
    );
    for (const c of combos) {
      expect(SECONDARY_FEASIBILITY_STAGE_BUCKETS as readonly string[]).toContain(
        effectiveSecondaryBucket(c),
      );
    }
  });
});

describe("nextSecondaryBucket", () => {
  it("marking done with a feasible verdict lands on Approved", () => {
    expect(nextSecondaryBucket({ current: "draft", markDone: true, verdict: "feasible" })).toBe(
      "secondary_feasibility_approved",
    );
  });

  it("marking done with a not_feasible verdict lands on Not Feasible", () => {
    expect(nextSecondaryBucket({ current: "draft", markDone: true, verdict: "not_feasible" })).toBe(
      "not_feasible",
    );
  });

  it("a plain save on an untouched line lands on Draft", () => {
    expect(nextSecondaryBucket({ current: "not_started", markDone: false, verdict: null })).toBe(
      "draft",
    );
  });

  it("a needs_info verdict routes a plain save to Need Info", () => {
    expect(nextSecondaryBucket({ current: "draft", markDone: false, verdict: "needs_info" })).toBe(
      "need_info",
    );
  });

  it("never demotes a line already at or past Pending Approval", () => {
    for (const current of [
      "pending_approval",
      "secondary_feasibility_approved",
      "not_feasible",
    ] as const) {
      expect(nextSecondaryBucket({ current, markDone: false, verdict: null })).toBe(current);
    }
  });
});

describe("SECONDARY_SETTABLE_BUCKETS", () => {
  it("excludes the two end buckets (only Mark Done may reach those)", () => {
    expect(isSecondarySettableBucket("draft")).toBe(true);
    expect(isSecondarySettableBucket("pending_approval")).toBe(true);
    expect(isSecondarySettableBucket("secondary_feasibility_approved")).toBe(false);
    expect(isSecondarySettableBucket("not_feasible")).toBe(false);
    expect(isSecondarySettableBucket("banana")).toBe(false);
  });
});

describe("resolveSecondaryFilter", () => {
  it("resolves a bucket to itself", () => {
    expect(resolveSecondaryFilter("need_info")).toEqual(["need_info"]);
  });

  it("keeps the pre-house ?status=pending / done bookmarks working", () => {
    expect(resolveSecondaryFilter("done")).toEqual(["secondary_feasibility_approved"]);
    expect(resolveSecondaryFilter("pending")).toContain("not_started");
    expect(resolveSecondaryFilter("pending")).not.toContain("secondary_feasibility_approved");
  });

  it("returns null for nothing / garbage (the queue then shows everything)", () => {
    expect(resolveSecondaryFilter(undefined)).toBeNull();
    expect(resolveSecondaryFilter("banana")).toBeNull();
    expect(resolveSecondaryFilter("")).toBeNull();
  });

  it("does not resolve inherited object keys (hostile ?status=)", () => {
    expect(resolveSecondaryFilter("toString")).toBeNull();
    expect(resolveSecondaryFilter("constructor")).toBeNull();
  });
});
