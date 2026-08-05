import { describe, it, expect } from "vitest";
import {
  CreateTaxRateSchema,
  HsnFieldsSchema,
  deriveSplit,
} from "@/lib/validators/tax";

function rate(over: Partial<Record<string, unknown>> = {}) {
  return {
    label: "GST 18%",
    ratePercent: 18,
    cgstPercent: 9,
    sgstPercent: 9,
    igstPercent: 18,
    sortOrder: 100,
    ...over,
  };
}

describe("deriveSplit", () => {
  it("halves an even rate", () => {
    expect(deriveSplit(18)).toEqual({ cgstPercent: 9, sgstPercent: 9, igstPercent: 18 });
  });

  it("keeps the two halves summing to the total for an odd rate", () => {
    const s = deriveSplit(5);
    expect(s.cgstPercent + s.sgstPercent).toBeCloseTo(5, 6);
    expect(s.igstPercent).toBe(5);
  });

  it("handles a zero-rated slab", () => {
    expect(deriveSplit(0)).toEqual({ cgstPercent: 0, sgstPercent: 0, igstPercent: 0 });
  });
});

describe("CreateTaxRateSchema", () => {
  it("accepts a well-formed slab", () => {
    expect(CreateTaxRateSchema.safeParse(rate()).success).toBe(true);
  });

  it("rejects a CGST + SGST that does not add up to the total", () => {
    const res = CreateTaxRateSchema.safeParse(rate({ sgstPercent: 8 }));
    expect(res.success).toBe(false);
    expect(res.success === false && res.error.issues[0]?.message).toMatch(/add up/i);
  });

  it("rejects an IGST that is not the full rate", () => {
    const res = CreateTaxRateSchema.safeParse(rate({ igstPercent: 9 }));
    expect(res.success).toBe(false);
    expect(res.success === false && res.error.issues[0]?.message).toMatch(/IGST/i);
  });

  it("rejects a blank label and an out-of-range percentage", () => {
    expect(CreateTaxRateSchema.safeParse(rate({ label: "   " })).success).toBe(false);
    expect(
      CreateTaxRateSchema.safeParse(
        rate({ ratePercent: 120, cgstPercent: 60, sgstPercent: 60, igstPercent: 120 }),
      ).success,
    ).toBe(false);
  });
});

describe("HsnFieldsSchema", () => {
  it("normalizes separators and case", () => {
    const res = HsnFieldsSchema.safeParse({ code: " 82-09 " });
    expect(res.success).toBe(true);
    expect(res.success && res.data.code).toBe("8209");
  });

  it("rejects codes that are not 4 to 8 digits", () => {
    expect(HsnFieldsSchema.safeParse({ code: "82" }).success).toBe(false);
    expect(HsnFieldsSchema.safeParse({ code: "123456789" }).success).toBe(false);
    expect(HsnFieldsSchema.safeParse({ code: "ABCD" }).success).toBe(false);
  });

  it("allows a deliberately unmapped rate", () => {
    const res = HsnFieldsSchema.safeParse({ code: "8207", taxRateId: null });
    expect(res.success).toBe(true);
    expect(res.success && res.data.taxRateId).toBeNull();
  });

  it("rejects a non-uuid tax rate id", () => {
    expect(HsnFieldsSchema.safeParse({ code: "8207", taxRateId: "nope" }).success).toBe(
      false,
    );
  });
});
