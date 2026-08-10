import { describe, expect, it } from "vitest";
import {
  costingBucketOf,
  costingBucketLabel,
  costingDaysToTarget,
  countCostingBuckets,
  costingRevisionLabel,
  isCostingOverdue,
  parseCostingBucket,
  type CostingBucket,
} from "@/lib/costing/buckets";
import { COSTING_DONE_STATUSES, COSTING_STAGE_BUCKETS } from "@/db/enums";

describe("costingBucketOf", () => {
  it("puts a line with NO costing row in the 'Not Done' bucket", () => {
    // Manan's 17: costable lines that were never costed at all.
    expect(costingBucketOf(null)).toBe("not_done");
    expect(costingBucketOf(undefined)).toBe("not_done");
  });

  it("maps every house bucket to itself", () => {
    for (const b of COSTING_STAGE_BUCKETS) {
      expect(costingBucketOf(b)).toBe(b);
    }
  });

  it("folds the deprecated statuses onto the buckets that superseded them", () => {
    expect(costingBucketOf("in_process")).toBe("draft");
    expect(costingBucketOf("done")).toBe("costing_approved");
  });

  it("buckets EVERY legal enum value — no status can fall out of the counts", () => {
    for (const s of COSTING_DONE_STATUSES) {
      expect(COSTING_STAGE_BUCKETS).toContain(costingBucketOf(s));
    }
  });

  it("takes labels from the enum, never a local string", () => {
    // Manan named this bucket twice in the 2026-08 review ("इसको तू नॉट डन लिख"):
    // costing's pending bucket reads "Not Done" because it answers how much
    // costing is LEFT, not whether a sheet was opened.
    expect(costingBucketLabel("not_done")).toBe("Not Done");
    expect(costingBucketLabel("costing_approved")).toBe("Costing Approved");
  });
});

describe("parseCostingBucket", () => {
  it("accepts a real bucket and rejects anything else", () => {
    expect(parseCostingBucket("need_info")).toBe("need_info");
    expect(parseCostingBucket("done")).toBeNull(); // legal status, not a bucket
    expect(parseCostingBucket("' OR 1=1")).toBeNull();
    expect(parseCostingBucket(undefined)).toBeNull();
    expect(parseCostingBucket(["need_info"])).toBeNull();
  });
});

describe("isCostingOverdue", () => {
  const now = new Date(2026, 7, 10, 9, 0, 0); // 2026-08-10, morning

  it("is false without a target date — an un-dated costing is legal", () => {
    expect(isCostingOverdue(null, "draft", now)).toBe(false);
  });

  it("is false on the due day itself", () => {
    expect(isCostingOverdue(new Date(2026, 7, 10, 23, 0, 0), "draft", now)).toBe(false);
  });

  it("is true the day after", () => {
    expect(isCostingOverdue(new Date(2026, 7, 9, 12, 0, 0), "draft", now)).toBe(true);
  });

  it("is never true for approved work — it is finished, not late", () => {
    expect(isCostingOverdue(new Date(2026, 6, 1), "costing_approved", now)).toBe(false);
  });

  it("counts a late Not Started line, which is the point of the tile", () => {
    expect(isCostingOverdue(new Date(2026, 6, 1), "not_done", now)).toBe(true);
  });
});

describe("costingDaysToTarget", () => {
  const now = new Date(2026, 7, 10, 9, 0, 0);

  it("is null when un-dated", () => {
    expect(costingDaysToTarget(null, now)).toBeNull();
  });

  it("is negative when late and positive when still ahead", () => {
    expect(costingDaysToTarget(new Date(2026, 7, 7, 18, 0, 0), now)).toBe(-3);
    expect(costingDaysToTarget(new Date(2026, 7, 14, 1, 0, 0), now)).toBe(4);
    expect(costingDaysToTarget(new Date(2026, 7, 10, 23, 30, 0), now)).toBe(0);
  });
});

describe("countCostingBuckets", () => {
  it("reports every bucket, including the empty ones", () => {
    const counts = countCostingBuckets([]);
    for (const b of COSTING_STAGE_BUCKETS) expect(counts[b]).toBe(0);
  });

  it("counts add up to the input length — nothing is silently dropped", () => {
    const buckets: CostingBucket[] = [
      "not_done",
      "not_done",
      "draft",
      "need_info",
      "pending_approval",
      "costing_approved",
      "not_done",
    ];
    const counts = countCostingBuckets(buckets);
    expect(counts.not_done).toBe(3);
    expect(counts.draft).toBe(1);
    const total = COSTING_STAGE_BUCKETS.reduce((n, b) => n + counts[b], 0);
    expect(total).toBe(buckets.length);
  });

  it("reproduces Manan's example: 20 costable, 3 costed ⇒ 17 Not Done", () => {
    const buckets: CostingBucket[] = [
      ...Array.from({ length: 17 }, () => "not_done" as const),
      "draft",
      "pending_approval",
      "costing_approved",
    ];
    const counts = countCostingBuckets(buckets);
    expect(counts.not_done).toBe(17);
    expect(buckets.length - counts.not_done).toBe(3);
  });
});

describe("costingRevisionLabel", () => {
  it("labels by POSITION, so legacy re-costings are not all 'Costing 1'", () => {
    expect(costingRevisionLabel(0)).toBe("Costing 1");
    expect(costingRevisionLabel(2)).toBe("Costing 3");
  });
});
