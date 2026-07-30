import { describe, it, expect } from "vitest";
import { vendorLandedCost, compareVendors } from "@/lib/costing/compare";

const r = (n: number) => Math.round(n * 1e4) / 1e4;

describe("vendorLandedCost", () => {
  it("applies the confirmed formula: unit + unit*oh + dev + freight/qty", () => {
    // 100 + 100*0.1 + 50 + 200/10 = 100 + 10 + 50 + 20 = 180
    expect(
      r(
        vendorLandedCost(
          { unitPrice: 100, vendorOhPct: 0.1, developmentCost: 50, freightCost: 200 },
          10,
        ),
      ),
    ).toBe(180);
  });

  it("treats missing OH/dev/freight as 0", () => {
    expect(vendorLandedCost({ unitPrice: 100 }, 10)).toBe(100);
  });

  it("drops the freight term when qty <= 0 (guard)", () => {
    // freight/qty would divide by 0; guard forces freight contribution to 0.
    expect(vendorLandedCost({ unitPrice: 100, freightCost: 999 }, 0)).toBe(100);
  });

  it("coerces numeric strings (DB numeric columns)", () => {
    expect(
      r(vendorLandedCost({ unitPrice: "100", vendorOhPct: "0.1", freightCost: "200" }, 10)),
    ).toBe(130);
  });
});

describe("compareVendors", () => {
  const quotes = [
    // landed = 100 + 0 + 0 + 100/10 = 110 ; lead 7 ; credit 30
    { id: "a", unitPrice: 100, freightCost: 100, leadTimeDays: 7, creditPeriodDays: 30 },
    // landed = 90 + 90*0.1 + 0 + 0 = 99 ; lead 14 ; credit 60
    { id: "b", unitPrice: 90, vendorOhPct: 0.1, leadTimeDays: 14, creditPeriodDays: 60 },
    // landed = 95 ; lead null (ignored) ; credit null (ignored)
    { id: "c", unitPrice: 95, leadTimeDays: null, creditPeriodDays: null },
  ];

  it("picks cheapest by landed cost, fastest by lead, best credit by max credit", () => {
    const cmp = compareVendors(quotes, 10);
    expect(cmp.cheapestId).toBe("c"); // 95 < 99 < 110
    expect(cmp.fastestId).toBe("a"); // 7 < 14, c ignored (null)
    expect(cmp.bestCreditId).toBe("b"); // 60 > 30, c ignored (null)
    expect(r(cmp.byId.a!)).toBe(110);
    expect(r(cmp.byId.b!)).toBe(99);
    expect(r(cmp.byId.c!)).toBe(95);
  });

  it("excludes rows with no unitPrice from cheapest, keeps them in byId", () => {
    const cmp = compareVendors(
      [
        { id: "x", unitPrice: null, leadTimeDays: 5 },
        { id: "y", unitPrice: 50 },
      ],
      10,
    );
    expect(cmp.cheapestId).toBe("y");
    expect(cmp.fastestId).toBe("x");
    expect(cmp.byId.x!).toBe(0);
  });

  it("returns all-null tags for an empty set", () => {
    const cmp = compareVendors([], 10);
    expect(cmp).toEqual({ cheapestId: null, fastestId: null, bestCreditId: null, byId: {} });
  });

  it("keeps the first row on ties (lowest sort index wins)", () => {
    const cmp = compareVendors(
      [
        { id: "first", unitPrice: 100, leadTimeDays: 10, creditPeriodDays: 30 },
        { id: "second", unitPrice: 100, leadTimeDays: 10, creditPeriodDays: 30 },
      ],
      10,
    );
    expect(cmp.cheapestId).toBe("first");
    expect(cmp.fastestId).toBe("first");
    expect(cmp.bestCreditId).toBe("first");
  });
});
