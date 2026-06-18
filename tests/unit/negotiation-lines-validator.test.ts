import { describe, it, expect } from "vitest";
import { NegotiationLineSchema, CreateNegotiationSchema } from "@/lib/validators/negotiation";

describe("NegotiationLineSchema", () => {
  it("accepts a line with custProductName + qty + finalCost", () => {
    const r = NegotiationLineSchema.safeParse({ custProductName: "Insert TK20", qty: 50, finalCost: 120.5 });
    expect(r.success).toBe(true);
  });
  it("folds blank optional text to undefined and coerces numeric strings", () => {
    const r = NegotiationLineSchema.parse({ custProductName: "  ", finalCost: "99.9" });
    expect(r.custProductName).toBeUndefined();
    expect(r.finalCost).toBe(99.9);
  });
  it("accepts optional uuid fields when provided", () => {
    const r = NegotiationLineSchema.safeParse({
      custProductName: "Part A",
      inquiryItemId: "123e4567-e89b-12d3-a456-426614174000",
      quotationItemId: "223e4567-e89b-12d3-a456-426614174001",
      itemId: "323e4567-e89b-12d3-a456-426614174002",
    });
    expect(r.success).toBe(true);
  });
});

describe("CreateNegotiationSchema with lines", () => {
  it("accepts an optional lines array", () => {
    const base = {
      inquiryId: "123e4567-e89b-12d3-a456-426614174000",
      lines: [
        { custProductName: "Insert A", qty: 10, finalCost: 200 },
        { custProductName: "Insert B", qty: 20, negotiation: 150 },
      ],
    };
    const r = CreateNegotiationSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lines?.length).toBe(2);
  });
  it("accepts create schema without lines (backward compat)", () => {
    const base = { inquiryId: "123e4567-e89b-12d3-a456-426614174000" };
    const r = CreateNegotiationSchema.safeParse(base);
    expect(r.success).toBe(true);
  });
});
