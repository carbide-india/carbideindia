import { describe, it, expect } from "vitest";
import {
  normalizeShapeName,
  CANONICAL_SHAPE_NAMES,
} from "@/lib/masters/shape-normalize";

describe("normalizeShapeName", () => {
  it("passes through the six canonical names (any case)", () => {
    for (const name of CANONICAL_SHAPE_NAMES) {
      expect(normalizeShapeName(name)).toBe(name);
      expect(normalizeShapeName(name.toLowerCase())).toBe(name);
      expect(normalizeShapeName(name.toUpperCase())).toBe(name);
    }
  });

  it("maps bare families to the Reg variant by default", () => {
    expect(normalizeShapeName("flat")).toBe("Flat - Reg");
    expect(normalizeShapeName("cylinder")).toBe("Cylinder - Reg");
    expect(normalizeShapeName("h. cylinder")).toBe("H. Cylinder - Reg");
  });

  it("detects the Spl variant from special/spl synonyms", () => {
    expect(normalizeShapeName("Flat Special")).toBe("Flat - Spl");
    expect(normalizeShapeName("flat spl")).toBe("Flat - Spl");
    expect(normalizeShapeName("Cylinder - Special")).toBe("Cylinder - Spl");
    expect(normalizeShapeName("H Cylinder Spl")).toBe("H. Cylinder - Spl");
  });

  it("resolves cylinder synonyms (cyl/rod/bar/pin/round)", () => {
    expect(normalizeShapeName("cyl")).toBe("Cylinder - Reg");
    expect(normalizeShapeName("rod")).toBe("Cylinder - Reg");
    expect(normalizeShapeName("Round Bar")).toBe("Cylinder - Reg");
    expect(normalizeShapeName("pin")).toBe("Cylinder - Reg");
  });

  it("resolves hollow-cylinder synonyms (ring/bush/tube/hollow/hc)", () => {
    expect(normalizeShapeName("ring")).toBe("H. Cylinder - Reg");
    expect(normalizeShapeName("bush")).toBe("H. Cylinder - Reg");
    expect(normalizeShapeName("bushing")).toBe("H. Cylinder - Reg");
    expect(normalizeShapeName("tube")).toBe("H. Cylinder - Reg");
    expect(normalizeShapeName("hollow cylinder")).toBe("H. Cylinder - Reg");
    expect(normalizeShapeName("HC")).toBe("H. Cylinder - Reg");
  });

  it("resolves flat synonyms (plate/block/strip/sheet/slab)", () => {
    expect(normalizeShapeName("plate")).toBe("Flat - Reg");
    expect(normalizeShapeName("block")).toBe("Flat - Reg");
    expect(normalizeShapeName("strip")).toBe("Flat - Reg");
    expect(normalizeShapeName("sheet")).toBe("Flat - Reg");
  });

  it("prefers hollow over solid when both cues present", () => {
    expect(normalizeShapeName("hollow cylinder")).toBe("H. Cylinder - Reg");
    expect(normalizeShapeName("cylinder ring")).toBe("H. Cylinder - Reg");
  });

  it("normalizes punctuation & whitespace noise", () => {
    expect(normalizeShapeName("  Flat_-_Reg  ")).toBe("Flat - Reg");
    expect(normalizeShapeName("H.Cylinder/Spl")).toBe("H. Cylinder - Spl");
    expect(normalizeShapeName("cylinder---reg")).toBe("Cylinder - Reg");
  });

  it("returns null for unmappable / non-geometry strings", () => {
    expect(normalizeShapeName("Special")).toBeNull();
    expect(normalizeShapeName("Assembly")).toBeNull();
    expect(normalizeShapeName("")).toBeNull();
    expect(normalizeShapeName("   ")).toBeNull();
    expect(normalizeShapeName("???")).toBeNull();
    expect(normalizeShapeName("misc widget")).toBeNull();
  });
});
