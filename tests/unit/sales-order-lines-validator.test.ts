import { describe, it, expect } from "vitest";
import { SoLineSchema, CreateSalesOrderSchema } from "@/lib/validators/sales-order";

describe("SoLineSchema", () => {
  it("accepts a line with custProductName + qty + quotePrice", () => {
    const r = SoLineSchema.safeParse({ custProductName: "Insert TK20", qty: 50, quotePrice: 120.5 });
    expect(r.success).toBe(true);
  });
  it("folds blank optional text to undefined and coerces numeric strings", () => {
    const r = SoLineSchema.parse({ custProductName: "  ", quotePrice: "99.9" });
    expect(r.custProductName).toBeUndefined();
    expect(r.quotePrice).toBe(99.9);
  });
  it("accepts optional uuid fields when provided", () => {
    const r = SoLineSchema.safeParse({
      custProductName: "Part A",
      inquiryItemId: "123e4567-e89b-12d3-a456-426614174000",
      quotationItemId: "223e4567-e89b-12d3-a456-426614174001",
      itemId: "323e4567-e89b-12d3-a456-426614174002",
    });
    expect(r.success).toBe(true);
  });
});

describe("CreateSalesOrderSchema with lines", () => {
  it("accepts an optional lines array", () => {
    const base = {
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [
        { custProductName: "Insert A", qty: 10, quotePrice: 200 },
        { custProductName: "Insert B", qty: 20, quotePrice: 150 },
      ],
    };
    const r = CreateSalesOrderSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lines?.length).toBe(2);
  });
  it("accepts create schema without lines (backward compat)", () => {
    const base = { inquiryId: "123e4567-e89b-12d3-a456-426614174000" };
    const r = CreateSalesOrderSchema.safeParse(base);
    expect(r.success).toBe(true);
  });
});
