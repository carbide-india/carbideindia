import { describe, it, expect } from "vitest";
import { CreateItemSchema } from "@/lib/validators/item";

describe("CreateItemSchema HSN/UoM fields", () => {
  it("accepts and trims hsnCode/uom/altUom and coerces altUomConversion", () => {
    const r = CreateItemSchema.parse({
      hsnCode: " 8209 ",
      uom: "Nos",
      altUom: "Kg",
      altUomConversion: "0.05",
    });
    expect(r.hsnCode).toBe("8209");
    expect(r.uom).toBe("Nos");
    expect(r.altUom).toBe("Kg");
    expect(r.altUomConversion).toBe(0.05);
  });

  it("folds empty strings to undefined", () => {
    const r = CreateItemSchema.parse({ hsnCode: "", uom: "" });
    expect(r.hsnCode).toBeUndefined();
    expect(r.uom).toBeUndefined();
  });
});
