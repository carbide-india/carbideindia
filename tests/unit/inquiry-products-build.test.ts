import { describe, it, expect } from "vitest";
import { productRowsForInquiry } from "@/lib/inquiries/product-rows";

describe("productRowsForInquiry", () => {
  it("uses the products[] when provided, ordered", () => {
    const rows = productRowsForInquiry({ products: [{ custProductName: "A", quantityNos: 5 }, { custProductName: "B" }] } as never);
    expect(rows.map((r) => r.custProductName)).toEqual(["A", "B"]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
  });
  it("falls back to one product from the legacy flat fields", () => {
    const rows = productRowsForInquiry({ productDescription: "Legacy", shape: "cylinder", outerDia: 12, quantityNos: 7 } as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.custProductName).toBe("Legacy");
    expect(rows[0]!.outerDia).toBe("12");
  });
});
