import { describe, it, expect } from "vitest";
import {
  CreateInquirySchema,
  UpdateInquirySchema,
  SetEnquiryStatusSchema,
  SaveFeasibilitySchema,
  SetFeasibilityStatusSchema,
} from "@/lib/validators/inquiry";

const base = {
  clientMode: "new",
  companyName: "Bright Engg Works",
  productDescription: "VSI Flat",
  priority: "normal",
  currency: "INR",
  country: "India",
};

describe("CreateInquirySchema", () => {
  it("accepts a minimal new-client inquiry", () => {
    expect(CreateInquirySchema.safeParse(base).success).toBe(true);
  });
  it("old client mode requires clientId", () => {
    const r = CreateInquirySchema.safeParse({ ...base, clientMode: "old", clientId: undefined });
    expect(r.success).toBe(false);
  });
  it("rejects unknown docsGiven values", () => {
    expect(CreateInquirySchema.safeParse({ ...base, docsGiven: ["Carrier Pigeon"] }).success).toBe(false);
  });
  it("rejects negative quantity", () => {
    expect(CreateInquirySchema.safeParse({ ...base, quantityNos: -5 }).success).toBe(false);
  });
  it("accepts full checklist values", () => {
    const r = CreateInquirySchema.safeParse({
      ...base, quantityStatus: "given", shapeDimensionCheck: "assumed",
      gradeCheck: "not_given", toleranceCheck: "given", conditionCheck: "assumed",
      docsGiven: ["Email", "Drawing"], shape: "Flat - Reg", sampleReceived: true,
    });
    expect(r.success).toBe(true);
  });

  // --- edge cases ---
  it("folds empty optional text to undefined", () => {
    const r = CreateInquirySchema.safeParse({ ...base, city: "", dimensionNotes: "   " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.city).toBeUndefined();
      expect(r.data.dimensionNotes).toBeUndefined();
    }
  });
  it("trims optional text and keeps real content", () => {
    const r = CreateInquirySchema.safeParse({ ...base, city: "  Nashik  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.city).toBe("Nashik");
  });
  it("rejects whitespace-only companyName", () => {
    expect(CreateInquirySchema.safeParse({ ...base, companyName: "   " }).success).toBe(false);
  });
  it("rejects non-uuid gradeId", () => {
    expect(CreateInquirySchema.safeParse({ ...base, gradeId: "not-a-uuid" }).success).toBe(false);
    expect(
      CreateInquirySchema.safeParse({ ...base, gradeId: "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b" }).success,
    ).toBe(true);
  });
  it("defaults quantityUom to Nos", () => {
    const r = CreateInquirySchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quantityUom).toBe("Nos");
  });
  it("old client mode with clientId passes", () => {
    const r = CreateInquirySchema.safeParse({
      ...base, clientMode: "old", clientId: "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b",
    });
    expect(r.success).toBe(true);
  });
  it("rejects negative dimensions", () => {
    expect(CreateInquirySchema.safeParse({ ...base, outerDia: -1 }).success).toBe(false);
  });
});

describe("UpdateInquirySchema", () => {
  it("accepts a single-field patch", () => {
    expect(UpdateInquirySchema.safeParse({ priority: "urgent" }).success).toBe(true);
  });
  it("rejects an empty patch (quantityUom default must not leak in)", () => {
    expect(UpdateInquirySchema.safeParse({}).success).toBe(false);
  });
  it("rejects unknown keys", () => {
    expect(UpdateInquirySchema.safeParse({ smNumber: "SM-001" }).success).toBe(false);
  });
});

describe("SetEnquiryStatusSchema", () => {
  it("accepts a known status and rejects an unknown one", () => {
    expect(SetEnquiryStatusSchema.safeParse({ status: "proceed" }).success).toBe(true);
    expect(SetEnquiryStatusSchema.safeParse({ status: "done" }).success).toBe(false);
  });
});

describe("SaveFeasibilitySchema", () => {
  it("accepts recheck updates", () => {
    expect(SaveFeasibilitySchema.safeParse({ feasSizeDrawingCheck: "yes" }).success).toBe(true);
  });
  it("rejects empty payload", () => {
    expect(SaveFeasibilitySchema.safeParse({}).success).toBe(false);
  });
  it("rejects unknown keys", () => {
    expect(SaveFeasibilitySchema.safeParse({ feasMagic: true }).success).toBe(false);
  });
  it("folds empty notes to undefined", () => {
    const r = SaveFeasibilitySchema.safeParse({ feasGradeVerdict: "available", feasGradeAppNotes: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.feasGradeAppNotes).toBeUndefined();
  });
});

describe("SetFeasibilityStatusSchema", () => {
  it("accepts a known status and rejects an unknown one", () => {
    expect(SetFeasibilityStatusSchema.safeParse({ status: "proceed_to_costing" }).success).toBe(true);
    expect(SetFeasibilityStatusSchema.safeParse({ status: "finished" }).success).toBe(false);
  });
});
