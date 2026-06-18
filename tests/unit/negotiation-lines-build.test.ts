import { describe, it, expect } from "vitest";
import { negotiationLineRows } from "@/lib/negotiations/line-rows";

describe("negotiationLineRows", () => {
  it("uses lines[] when provided, ordered by insertion order with sortOrder", () => {
    const rows = negotiationLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [
        { custProductName: "Insert A", qty: 10, quotePrice: 200, finalCost: 180, negotiation: 190 },
        { custProductName: "Insert B", qty: 20, quotePrice: 150, finalCost: 140, negotiation: 145 },
      ],
    } as never);
    expect(rows.map((r) => r.custProductName)).toEqual(["Insert A", "Insert B"]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it("falls back to one synthesized line from the flat fields", () => {
    const rows = negotiationLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      custProductName: "Legacy Part",
      qty: 5,
      finalCost: 99.9,
      negotiation: 95,
    } as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.custProductName).toBe("Legacy Part");
    expect(rows[0]!.sortOrder).toBe(0);
    // numeric field round-trips to a string
    expect(rows[0]!.finalCost).toBe("99.9");
    expect(rows[0]!.negotiation).toBe("95");
  });

  it("stores numeric qty as string", () => {
    const rows = negotiationLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [{ custProductName: "TK20", qty: 50, quotePrice: 300, finalCost: 280, negotiation: 290 }],
    } as never);
    expect(rows[0]!.qty).toBe("50");
    expect(rows[0]!.quotePrice).toBe("300");
    expect(rows[0]!.finalCost).toBe("280");
  });

  it("returns null for undefined/empty text fields", () => {
    const rows = negotiationLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [{ custProductName: "  " }],
    } as never);
    expect(rows[0]!.custProductName).toBeNull();
    expect(rows[0]!.partNo).toBeNull();
    expect(rows[0]!.finalCost).toBeNull();
    expect(rows[0]!.negotiation).toBeNull();
  });

  it("includes negotiation-specific fields (finalCost, negotiation) not in SO lines", () => {
    const rows = negotiationLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [{ finalCost: 100, negotiation: 95, quotePrice: 98 }],
    } as never);
    expect(rows[0]!.finalCost).toBe("100");
    expect(rows[0]!.negotiation).toBe("95");
    expect(rows[0]!.quotePrice).toBe("98");
  });
});
