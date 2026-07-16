import { describe, it, expect } from "vitest";
import {
  SaveFeasibilityChecklistSchema,
  SetFeasibilityStatusSchema,
} from "@/lib/validators/feasibility";

const PERSON = "11111111-1111-4111-8111-111111111111";

describe("SaveFeasibilityChecklistSchema", () => {
  it("accepts a full checklist review (5 checks + notes + sign-off)", () => {
    const r = SaveFeasibilityChecklistSchema.safeParse({
      sizeDrawingCheck: "yes",
      toleranceCheck: "assumed",
      toleranceNotes: "assumed H6",
      gradeAppCheck: "not_done",
      quantityCheck: "yes",
      conditionCheck: "assumed",
      conditionNotes: "assumed as-sintered",
      priority: "p1",
      export: true,
      actionsList: "raise RM enquiry",
      feasibilityCheckedById: PERSON,
      assignedSalesPersonId: PERSON,
      status: "in_review",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty patch (partial save)", () => {
    expect(SaveFeasibilityChecklistSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an invalid check value", () => {
    expect(SaveFeasibilityChecklistSchema.safeParse({ sizeDrawingCheck: "maybe" }).success).toBe(false);
  });

  it("rejects an unknown key (strict)", () => {
    expect(SaveFeasibilityChecklistSchema.safeParse({ bogus: 1 }).success).toBe(false);
  });

  it("rejects a non-uuid checked-by id", () => {
    expect(SaveFeasibilityChecklistSchema.safeParse({ feasibilityCheckedById: "nope" }).success).toBe(false);
  });
});

describe("SetFeasibilityStatusSchema", () => {
  it("accepts a valid status", () => {
    expect(SetFeasibilityStatusSchema.safeParse({ status: "proceed_to_costing" }).success).toBe(true);
  });
  it("rejects an invalid status", () => {
    expect(SetFeasibilityStatusSchema.safeParse({ status: "banana" }).success).toBe(false);
  });
});
