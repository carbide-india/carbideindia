import { describe, it, expect } from "vitest";
import { quoteLineRows } from "@/lib/quotations/line-rows";

describe("quoteLineRows", () => {
  it("uses lines[] when provided, ordered by insertion order with sortOrder", () => {
    const rows = quoteLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [
        { custProductName: "Insert A", qty: 10, quotePrice: 200 },
        { custProductName: "Insert B", qty: 20, quotePrice: 150 },
      ],
    } as never);
    expect(rows.map((r) => r.custProductName)).toEqual(["Insert A", "Insert B"]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it("falls back to one synthesized line from the flat fields", () => {
    const rows = quoteLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      custProductName: "Legacy Part",
      qty: 5,
      finalCost: 99.9,
    } as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.custProductName).toBe("Legacy Part");
    expect(rows[0]!.sortOrder).toBe(0);
    // numeric field round-trips to a string
    expect(rows[0]!.finalCost).toBe("99.9");
  });

  it("stores numeric qty as string", () => {
    const rows = quoteLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [{ custProductName: "TK20", qty: 50, quotePrice: 300 }],
    } as never);
    expect(rows[0]!.qty).toBe("50");
    expect(rows[0]!.quotePrice).toBe("300");
  });

  it("returns null for undefined/empty text fields", () => {
    const rows = quoteLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [{ custProductName: "  " }],
    } as never);
    expect(rows[0]!.custProductName).toBeNull();
    expect(rows[0]!.custDrawingNo).toBeNull();
  });
});
