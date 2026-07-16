import { describe, it, expect } from "vitest";
import {
  SaveFeasibilityReviewSchema,
  ApproveFeasibilitySchema,
  SetFeasibilityStatusSchema,
} from "@/lib/validators/feasibility";

const ITEM = "11111111-1111-4111-8111-111111111111";

describe("SaveFeasibilityReviewSchema", () => {
  it("accepts a full DFM review payload (SM + expanded per-product checks)", () => {
    const r = SaveFeasibilityReviewSchema.safeParse({
      sm: {
        priority: "p1",
        export: true,
        overallVerdict: "feasible_with_deviation",
        riskRating: "medium",
        exportRegulatoryVerdict: "feasible",
        leadTimeVerdict: "need_info",
        leadTimeNote: "confirm delivery window",
        assumptions: "assumed H6 tolerance",
        customerClarifications: "need drawing rev",
        actionItems: "raise RM enquiry",
      },
      status: "in_review",
      products: [
        {
          inquiryItemId: ITEM,
          shapeDimVerdict: "feasible",
          drawingCompletenessVerdict: "need_info",
          drawingCompletenessNote: "missing GD&T",
          toolingProcessVerdict: "feasible_with_deviation",
          materialSupplyVerdict: "feasible",
          itemVerdict: "feasible_with_deviation",
          itemRiskRating: "high",
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid risk rating", () => {
    const r = SaveFeasibilityReviewSchema.safeParse({
      sm: { riskRating: "extreme" },
      products: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a bad verdict value on a product check", () => {
    const r = SaveFeasibilityReviewSchema.safeParse({
      sm: {},
      products: [{ inquiryItemId: ITEM, toolingProcessVerdict: "perhaps" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid inquiryItemId", () => {
    const r = SaveFeasibilityReviewSchema.safeParse({ sm: {}, products: [{ inquiryItemId: "nope" }] });
    expect(r.success).toBe(false);
  });
});

describe("ApproveFeasibilitySchema", () => {
  it("accepts approve with a note", () => {
    expect(ApproveFeasibilitySchema.safeParse({ decision: "approve", note: "cleared" }).success).toBe(true);
  });
  it("accepts reject without a note", () => {
    expect(ApproveFeasibilitySchema.safeParse({ decision: "reject" }).success).toBe(true);
  });
  it("rejects an unknown decision", () => {
    expect(ApproveFeasibilitySchema.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});

describe("SetFeasibilityStatusSchema", () => {
  it("accepts a valid status", () => {
    expect(SetFeasibilityStatusSchema.safeParse({ status: "pending_approval" }).success).toBe(true);
  });
  it("rejects an invalid status", () => {
    expect(SetFeasibilityStatusSchema.safeParse({ status: "banana" }).success).toBe(false);
  });
});
