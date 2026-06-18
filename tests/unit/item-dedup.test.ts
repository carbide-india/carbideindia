import { describe, it, expect } from "vitest";
import { itemDedupKey } from "@/lib/item-master/dedup";

describe("itemDedupKey", () => {
  it("is identical for the same shape/grade/condition/tolerance + dimensions", () => {
    const a = itemDedupKey({ shapeId: "S1", internalGradeId: "G1", conditionId: "C1", toleranceId: null, outerDia: 100, innerDia: 90.8, length: 89, width: null, thickness: 2.25 });
    const b = itemDedupKey({ shapeId: "S1", internalGradeId: "G1", conditionId: "C1", toleranceId: undefined, outerDia: 100.0, innerDia: 90.80, length: 89.0, width: null, thickness: 2.25 });
    expect(a).toBe(b);
  });
  it("differs when any dimension or ref differs", () => {
    const base = { shapeId: "S1", internalGradeId: "G1", conditionId: "C1", outerDia: 100, length: 50 };
    expect(itemDedupKey(base)).not.toBe(itemDedupKey({ ...base, length: 51 }));
    expect(itemDedupKey(base)).not.toBe(itemDedupKey({ ...base, shapeId: "S2" }));
  });
  it("rounds dimensions to 2 decimals", () => {
    expect(itemDedupKey({ length: 50.001 })).toBe(itemDedupKey({ length: 50.004 }));
  });
});
