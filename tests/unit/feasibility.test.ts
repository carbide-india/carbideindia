import { describe, it, expect } from "vitest";
import { SaveFeasibilityFullSchema } from "@/lib/validators/inquiry";

describe("SaveFeasibilityFullSchema", () => {
  it("accepts a full per-product payload", () => {
    const r = SaveFeasibilityFullSchema.safeParse({
      sm: { feasPriority: "p1", feasExport: true },
      status: "proceed_to_costing",
      products: [
        { inquiryItemId: "11111111-1111-4111-8111-111111111111", shapeDimVerdict: "feasible", gradeVerdict: "need_info", gradeNote: "confirm grade" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bad verdict value", () => {
    const r = SaveFeasibilityFullSchema.safeParse({
      sm: {}, products: [{ inquiryItemId: "11111111-1111-4111-8111-111111111111", shapeDimVerdict: "maybe" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid inquiryItemId", () => {
    const r = SaveFeasibilityFullSchema.safeParse({ sm: {}, products: [{ inquiryItemId: "nope" }] });
    expect(r.success).toBe(false);
  });
});
