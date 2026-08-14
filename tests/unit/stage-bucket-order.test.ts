import { describe, expect, it } from "vitest";
import {
  COSTING_STAGE_BUCKETS,
  ENQUIRY_STAGE_BUCKETS,
  FEASIBILITY_STAGE_BUCKETS,
  HOUSE_BUCKETS,
  NEGOTIATION_STAGE_BUCKETS,
  QUOTATION_STAGE_BUCKETS,
  SALES_ORDER_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STAGE_BUCKETS,
} from "@/db/enums";
import { statusBucketOf } from "@/lib/approval/gate";

/**
 * One bucket ORDER at every stage (Hetesh, 2026-08-13).
 *
 * The approved bucket is the stage's exit — the handover to the next module —
 * so it reads last, after the working states and the negative ones. Primary and
 * Secondary Feasibility had drifted apart on this, which is what made the two
 * sidebars feel different; this pins every stage to the same shape so they
 * cannot drift again.
 */

/**
 * NEGOTIATION IS DELIBERATELY ABSENT from this list (Hetesh, 2026-08-13).
 *
 * Every stage here ends in a SIGN-OFF: someone approves the work and it hands
 * over. Negotiation ends in an OUTCOME — the deal is Won, Lost or Abandoned,
 * and no amount of internal approval decides which. Forcing it into the ladder
 * would put an "approved" bucket on a screen where nothing is ever approved.
 *
 * Its own shape is asserted at the bottom of this file, so the exception is
 * pinned rather than merely unstated.
 */
const STAGES: [string, readonly string[]][] = [
  ["enquiry", ENQUIRY_STAGE_BUCKETS],
  ["primary feasibility", FEASIBILITY_STAGE_BUCKETS],
  ["secondary feasibility", SECONDARY_FEASIBILITY_STAGE_BUCKETS],
  ["costing", COSTING_STAGE_BUCKETS],
  ["quotation", QUOTATION_STAGE_BUCKETS],
  ["sales order", SALES_ORDER_STAGE_BUCKETS],
];

describe("stage bucket order", () => {
  it.each(STAGES)("%s ends on its approved bucket", (_name, buckets) => {
    expect(statusBucketOf(buckets.at(-1)!)).toBe("approved");
  });

  it.each(STAGES)("%s has exactly one approved bucket", (_name, buckets) => {
    const approved = buckets.filter((b) => statusBucketOf(b) === "approved");
    expect(approved).toHaveLength(1);
  });

  it.each(STAGES)("%s starts on its not-started bucket", (_name, buckets) => {
    // Costing calls it "not_done" and Negotiation "to_start" — same bucket.
    expect(["not_started", "not_done", "to_start"]).toContain(buckets[0]);
  });

  it.each(STAGES)("%s runs Draft then Need Info then Pending Approval", (_name, buckets) => {
    const at = (b: string) => buckets.indexOf(b);
    expect(at("draft")).toBeGreaterThan(0);
    expect(at("need_info")).toBeGreaterThan(at("draft"));
    expect(at("pending_approval")).toBeGreaterThan(at("need_info"));
  });

  it.each(STAGES)("%s puts Not Approved after Pending Approval, before Approved", (_name, buckets) => {
    const i = buckets.indexOf("not_approved");
    if (i === -1) return; // Enquiry and Sales Order have no rejection bucket
    expect(i).toBeGreaterThan(buckets.indexOf("pending_approval"));
    expect(i).toBeLessThan(buckets.length - 1);
  });

  it("HOUSE_BUCKETS documents that same order", () => {
    expect([...HOUSE_BUCKETS]).toEqual([
      "not_started",
      "draft",
      "need_info",
      "pending_approval",
      "not_approved",
      "not_feasible",
      "approved",
    ]);
  });

  it("only the feasibility stages carry Not Feasible", () => {
    // Only feasibility can genuinely reject on technical grounds; a quotation
    // or a costing cannot declare a part unmakeable.
    for (const [name, buckets] of STAGES) {
      const has = buckets.includes("not_feasible");
      expect(has, name).toBe(name.endsWith("feasibility"));
    }
  });

  it("no stage lists the same bucket twice", () => {
    for (const [name, buckets] of STAGES) {
      expect(new Set(buckets).size, name).toBe(buckets.length);
    }
  });
});

describe("negotiation is the stated exception", () => {
  const buckets = NEGOTIATION_STAGE_BUCKETS as readonly string[];

  it("still starts on its not-started bucket", () => {
    expect(buckets[0]).toBe("to_start");
  });

  it("carries no approval bucket at all", () => {
    // Not "approved last" — approved NOWHERE. A deal is not signed off.
    expect(buckets.filter((b) => statusBucketOf(b) === "approved")).toEqual([]);
    expect(buckets).not.toContain("pending_approval");
    expect(buckets).not.toContain("not_approved");
  });

  it("ends on the three commercial outcomes, in that order", () => {
    expect(buckets.slice(-3)).toEqual(["order_won", "order_lost", "order_abandoned"]);
  });

  it("lists the working states before the outcomes", () => {
    expect(buckets.slice(0, -3)).toEqual([
      "to_start",
      "need_info",
      "follow_up",
      "revision",
    ]);
  });

  it("lists no bucket twice", () => {
    expect(new Set(buckets).size).toBe(buckets.length);
  });
});
