import { describe, it, expect } from "vitest";
import { CreateCostingSchema } from "@/lib/validators/costing";

const BASE_IH = {
  inquiryItemId: "123e4567-e89b-12d3-a456-426614174000",
  inquiryId: "223e4567-e89b-12d3-a456-426614174001",
  costingType: "inhouse" as const,
  qty: 50,
  blockWt: 12.5,
  theoreticalWt: 11.0,
  pressingWt: 11.5,
  lossPct: 5,
  rmPricePerKg: 4200,
  vaPct: 30,
  vaFloorPerKg: 100,
  shapingRatePerMin: 2.5,
  shapingMins: 8,
  overheadPct: 15,
  negotiationPct: 10,
};

describe("CreateCostingSchema — in-house", () => {
  it("accepts a minimal in-house costing", () => {
    const r = CreateCostingSchema.safeParse(BASE_IH);
    expect(r.success).toBe(true);
  });

  it("coerces numeric strings for rate fields", () => {
    const r = CreateCostingSchema.safeParse({
      ...BASE_IH,
      rmPricePerKg: "4200",
      vaPct: "30",
      lossPct: "5",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rmPricePerKg).toBe(4200);
      expect(r.data.vaPct).toBe(30);
    }
  });

  it("accepts optional costingLogic", () => {
    const r = CreateCostingSchema.safeParse({ ...BASE_IH, costingLogic: "tooling_available" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.costingLogic).toBe("tooling_available");
  });

  it("accepts optional text fields (toolType, weightUsed)", () => {
    const r = CreateCostingSchema.safeParse({
      ...BASE_IH,
      toolType: "Press tool",
      weightUsed: "pressing",
    });
    expect(r.success).toBe(true);
  });
});

describe("CreateCostingSchema — bought-out", () => {
  it("accepts a minimal BO costing", () => {
    const r = CreateCostingSchema.safeParse({
      inquiryItemId: "123e4567-e89b-12d3-a456-426614174000",
      inquiryId: "223e4567-e89b-12d3-a456-426614174001",
      costingType: "bought_out",
      qty: 100,
      outsourcedVendorCost: 85,
      vendorOhPct: 10,
    });
    expect(r.success).toBe(true);
  });

  it("accepts optional BO text fields", () => {
    const r = CreateCostingSchema.safeParse({
      inquiryItemId: "123e4567-e89b-12d3-a456-426614174000",
      inquiryId: "223e4567-e89b-12d3-a456-426614174001",
      costingType: "bought_out",
      outsourcedVendorCost: 85,
      vendorNotes: "Vendor ABC",
      developmentNotes: "3 weeks",
      technicalNotes: "Standard spec",
    });
    expect(r.success).toBe(true);
  });
});

describe("CreateCostingSchema — validation", () => {
  it("rejects a bad costingType", () => {
    const r = CreateCostingSchema.safeParse({
      ...BASE_IH,
      costingType: "outsourced",
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing inquiryItemId", () => {
    const { inquiryItemId: _drop, ...rest } = BASE_IH;
    const r = CreateCostingSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid inquiryId", () => {
    const r = CreateCostingSchema.safeParse({ ...BASE_IH, inquiryId: "not-a-uuid" });
    expect(r.success).toBe(false);
  });

  it("rejects a bad costingLogic value", () => {
    const r = CreateCostingSchema.safeParse({ ...BASE_IH, costingLogic: "bad_value" });
    expect(r.success).toBe(false);
  });
});
