import { describe, it, expect } from "vitest";
import { soLineRows } from "@/lib/sales-orders/line-rows";

describe("soLineRows", () => {
  it("uses lines[] when provided, ordered by insertion order with sortOrder", () => {
    const rows = soLineRows({
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
    const rows = soLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      custProductName: "Legacy Part",
      qty: 5,
      quotePrice: 99.9,
    } as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.custProductName).toBe("Legacy Part");
    expect(rows[0]!.sortOrder).toBe(0);
    // numeric field round-trips to a string
    expect(rows[0]!.quotePrice).toBe("99.9");
  });

  it("stores numeric qty as string", () => {
    const rows = soLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [{ custProductName: "TK20", qty: 50, quotePrice: 300 }],
    } as never);
    expect(rows[0]!.qty).toBe("50");
    expect(rows[0]!.quotePrice).toBe("300");
  });

  it("returns null for undefined/empty text fields", () => {
    const rows = soLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [{ custProductName: "  " }],
    } as never);
    expect(rows[0]!.custProductName).toBeNull();
    expect(rows[0]!.partNo).toBeNull();
    expect(rows[0]!.quotePrice).toBeNull();
  });

  it("does NOT include finalCost or negotiation fields (SO has no costing fields)", () => {
    const rows = soLineRows({
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [{ quotePrice: 98 }],
    } as never);
    expect(rows[0]!.quotePrice).toBe("98");
    // These keys must not exist on BuiltSoLine
    expect("finalCost" in rows[0]!).toBe(false);
    expect("negotiation" in rows[0]!).toBe(false);
  });
});
