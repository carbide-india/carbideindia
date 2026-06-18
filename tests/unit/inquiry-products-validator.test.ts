import { describe, it, expect } from "vitest";
import { ProductItemSchema, CreateInquirySchema } from "@/lib/validators/inquiry";

describe("ProductItemSchema", () => {
  it("accepts a product with name + dims + qty", () => {
    const r = ProductItemSchema.safeParse({ custProductName: "Insert", shape: "Cylinder - Reg", outerDia: 12, quantityNos: 100 });
    expect(r.success).toBe(true);
  });
  it("folds blank optional text to undefined and coerces numbers", () => {
    const r = ProductItemSchema.parse({ custProductName: "  ", outerDia: "12.5" });
    expect(r.custProductName).toBeUndefined();
    expect(r.outerDia).toBe(12.5);
  });
});

describe("CreateInquirySchema with products", () => {
  it("accepts an optional products array", () => {
    const base = { clientMode: "new", priority: "normal", currency: "INR", country: "India", companyName: "Acme", productDescription: "x",
      products: [{ custProductName: "A", quantityNos: 5 }, { custProductName: "B" }] };
    const r = CreateInquirySchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.products?.length).toBe(2);
  });
});
