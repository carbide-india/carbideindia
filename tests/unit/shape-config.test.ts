import { describe, it, expect } from "vitest";
import {
  presetForShapeName,
  resolveShapeConfig,
  requiredDims,
  visibleDims,
  defaultShapeConfig,
} from "@/lib/masters/shape-config";

describe("presetForShapeName", () => {
  it("solid cylinder → OD + Length required, ID/W/T hidden", () => {
    const c = presetForShapeName("Cylinder - Reg")!;
    expect(c.dims).toEqual({
      outerDia: "required", innerDia: "hidden", length: "required",
      width: "hidden", thickness: "hidden",
    });
  });
  it("hollow cylinder → OD + ID + Length required", () => {
    const c = presetForShapeName("H. Cylinder - Spl")!;
    expect(requiredDims(c).sort()).toEqual(["innerDia", "length", "outerDia"]);
    expect(c.dims.width).toBe("hidden");
  });
  it("flat → L + W + T required, diameters hidden", () => {
    const c = presetForShapeName("Flat - Reg")!;
    expect(requiredDims(c).sort()).toEqual(["length", "thickness", "width"]);
    expect(c.dims.outerDia).toBe("hidden");
    expect(c.dims.innerDia).toBe("hidden");
  });
  it("unknown family → null (keeps all-optional default)", () => {
    expect(presetForShapeName("Special")).toBeNull();
    expect(presetForShapeName("Assembly")).toBeNull();
  });
});

describe("resolveShapeConfig", () => {
  it("null/garbage → all-optional default", () => {
    expect(resolveShapeConfig(null)).toEqual(defaultShapeConfig());
    expect(resolveShapeConfig({ nope: 1 })).toEqual(defaultShapeConfig());
    expect(resolveShapeConfig("x")).toEqual(defaultShapeConfig());
  });
  it("partial config fills missing dims as optional", () => {
    const c = resolveShapeConfig({ dims: { outerDia: "required" } });
    expect(c.dims.outerDia).toBe("required");
    expect(c.dims.width).toBe("optional");
  });
  it("visibleDims excludes hidden", () => {
    const c = presetForShapeName("Cylinder - Reg")!;
    expect(visibleDims(c).sort()).toEqual(["length", "outerDia"]);
  });
});
