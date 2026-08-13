import { describe, expect, it } from "vitest";
import {
  approvalRefusal,
  canApprove,
  forbiddenCheckStates,
  isApproverBucket,
  isApproverCheck,
  statusBucketOf,
} from "@/lib/approval/gate";
import {
  ACTIVE_RECHECK_STATES,
  COSTING_STAGE_BUCKETS,
  FEASIBILITY_STAGE_BUCKETS,
  NEGOTIATION_STAGE_BUCKETS,
  QUOTATION_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STAGE_BUCKETS,
} from "@/db/enums";

const APPROVER = { isAdmin: true };
const EMPLOYEE = { isAdmin: false };

describe("who may approve", () => {
  it("is the admins — Alok and Altus", () => {
    expect(canApprove(APPROVER)).toBe(true);
    expect(canApprove(EMPLOYEE)).toBe(false);
  });
});

describe("approver-only check states", () => {
  it("covers exactly Approved and Not Approved", () => {
    const gated = ACTIVE_RECHECK_STATES.filter(isApproverCheck);
    expect([...gated].sort()).toEqual(["approved", "not_approved"]);
  });

  it("leaves the working states open to everyone", () => {
    for (const s of ["not_done", "done", "need_info", "not_feasible", "assumed"]) {
      expect(isApproverCheck(s), s).toBe(false);
    }
  });
});

describe("forbiddenCheckStates", () => {
  it("lets an employee take every check to Done", () => {
    expect(
      forbiddenCheckStates(["done", "done", "done", "assumed", "need_info"], EMPLOYEE),
    ).toEqual([]);
  });

  it("stops an employee approving", () => {
    expect(forbiddenCheckStates(["done", "approved"], EMPLOYEE)).toEqual(["approved"]);
  });

  it("stops an employee rejecting", () => {
    expect(forbiddenCheckStates(["not_approved"], EMPLOYEE)).toEqual(["not_approved"]);
  });

  it("de-duplicates and reports every offending value", () => {
    expect(
      forbiddenCheckStates(["approved", "approved", "not_approved"], EMPLOYEE).sort(),
    ).toEqual(["approved", "not_approved"]);
  });

  it("ignores untouched checks — a partial save is not an approval", () => {
    expect(forbiddenCheckStates([undefined, null, "done"], EMPLOYEE)).toEqual([]);
  });

  it("allows an approver everything", () => {
    expect(forbiddenCheckStates(["approved", "not_approved"], APPROVER)).toEqual([]);
  });
});

describe("statusBucketOf", () => {
  it("recognises each stage's own approved value by suffix", () => {
    expect(statusBucketOf("costing_approved")).toBe("approved");
    expect(statusBucketOf("quotation_approved")).toBe("approved");
    expect(statusBucketOf("negotiation_approved")).toBe("approved");
    expect(statusBucketOf("secondary_feasibility_approved")).toBe("approved");
  });

  it("recognises feasibility's legacy name for approved", () => {
    // The enum value stayed `proceed_to_costing` (every gate reads it); only
    // the LABEL became "Feasibility Approved".
    expect(statusBucketOf("proceed_to_costing")).toBe("approved");
  });

  it("passes the working buckets through untouched", () => {
    for (const s of ["not_started", "not_done", "to_start", "draft", "need_info", "pending_approval"]) {
      expect(statusBucketOf(s), s).toBe(s);
    }
  });

  it("does not mistake Not Feasible for a rejection the gate owns", () => {
    // Not Feasible is a technical verdict anyone doing the review may record;
    // Not Approved is the approver sending it back. Different things.
    expect(statusBucketOf("not_feasible")).toBe("not_feasible");
    expect(isApproverBucket("not_feasible")).toBe(false);
    expect(isApproverBucket("not_approved")).toBe(true);
  });
});

describe("approvalRefusal", () => {
  it("permits an employee to submit for approval", () => {
    expect(
      approvalRefusal({ checks: ["done", "done"], status: "pending_approval" }, EMPLOYEE),
    ).toBeNull();
  });

  it("refuses an employee approving via the checks", () => {
    expect(approvalRefusal({ checks: ["approved"] }, EMPLOYEE)).toMatch(/only an approver/i);
  });

  it("refuses an employee approving via the record status", () => {
    expect(approvalRefusal({ status: "proceed_to_costing" }, EMPLOYEE)).toMatch(
      /only an approver/i,
    );
    expect(approvalRefusal({ status: "not_approved" }, EMPLOYEE)).toMatch(/only an approver/i);
  });

  it("never refuses an approver", () => {
    expect(
      approvalRefusal({ checks: ["approved", "not_approved"], status: "proceed_to_costing" }, APPROVER),
    ).toBeNull();
  });

  it("refuses nothing when there is nothing to save", () => {
    expect(approvalRefusal({}, EMPLOYEE)).toBeNull();
  });
});

describe("the gate covers every stage's approved bucket", () => {
  // The point of the suffix rule: adding a stage must not silently leave its
  // approval ungated. If a new stage names its approved value differently,
  // this fails and tells whoever added it to teach statusBucketOf about it.
  const STAGES: [string, readonly string[]][] = [
    ["primary feasibility", FEASIBILITY_STAGE_BUCKETS],
    ["secondary feasibility", SECONDARY_FEASIBILITY_STAGE_BUCKETS],
    ["costing", COSTING_STAGE_BUCKETS],
    ["quotation", QUOTATION_STAGE_BUCKETS],
    ["negotiation", NEGOTIATION_STAGE_BUCKETS],
  ];

  it.each(STAGES)("%s gates its approved and not-approved buckets", (_name, buckets) => {
    const gated = buckets.filter((b) => isApproverBucket(statusBucketOf(b)));
    expect(gated).toContain("not_approved");
    // Exactly one approval bucket per stage, plus not_approved.
    expect(gated).toHaveLength(2);
  });

  it.each(STAGES)("%s leaves its working buckets open", (_name, buckets) => {
    const open = buckets.filter((b) => !isApproverBucket(statusBucketOf(b)));
    // Not Started / Draft / Need Info / Pending Approval — and Not Feasible
    // where the stage has one.
    expect(open.length).toBeGreaterThanOrEqual(4);
    for (const b of open) {
      expect(approvalRefusal({ status: b }, EMPLOYEE), b).toBeNull();
    }
  });
});
