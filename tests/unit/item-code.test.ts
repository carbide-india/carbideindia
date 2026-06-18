import { describe, it, expect } from "vitest";
import { buildItemCode, deriveSizeCode } from "@/lib/item-master/item-code";

describe("deriveSizeCode", () => {
  it("any dimension below 25mm → Small (S)", () => {
    expect(deriveSizeCode([100, 90.8, 89, 4.5, 2.25])).toBe("S"); // 2.25 < 25
  });
  it("all dims 25.01–100 → Medium (M)", () => {
    expect(deriveSizeCode([90, 40, 60])).toBe("M");
  });
  it("a dim above 100 (and none below 25) → Large (L)", () => {
    expect(deriveSizeCode([150, 30, 40])).toBe("L");
  });
});

describe("buildItemCode", () => {
  it("assembles Size-Seq-Shape-Grade-Condition-Tolerance-Dims, dims at 2dp joined by x", () => {
    const code = buildItemCode({
      sizeCode: "S", seq: 10001, shapeCode: "C", gradeCode: "CIF06",
      conditionCode: "S", toleranceCode: "XXX", dims: [100, 90.8, 89, 4.5, 2.25],
    });
    expect(code).toBe("S-10001-C-CIF06-S-XXX-100.00x90.80x89.00x4.50x2.25");
  });
  it("defaults a missing tolerance to XXX and pads seq to 5 digits", () => {
    const code = buildItemCode({
      sizeCode: "M", seq: 7, shapeCode: "F", gradeCode: "CIW10",
      conditionCode: "Fi", dims: [50, 30, 10],
    });
    expect(code).toBe("M-00007-F-CIW10-Fi-XXX-50.00x30.00x10.00");
  });
});
