import { describe, it, expect } from "vitest";
import { CreateMasterSchema, UpdateMasterSchema } from "@/lib/validators/master";

describe("CreateMasterSchema", () => {
  it("accepts a valid create", () => {
    const r = CreateMasterSchema.safeParse({ kind: "tolerance", name: "±0.05" });
    expect(r.success).toBe(true);
  });
  it("rejects unknown kind", () => {
    expect(CreateMasterSchema.safeParse({ kind: "flavour", name: "x" }).success).toBe(false);
  });
  it("rejects empty/too-long names", () => {
    expect(CreateMasterSchema.safeParse({ kind: "condition", name: "  " }).success).toBe(false);
    expect(CreateMasterSchema.safeParse({ kind: "condition", name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("UpdateMasterSchema", () => {
  it("requires at least one change", () => {
    expect(UpdateMasterSchema.safeParse({}).success).toBe(false);
  });
  it("accepts isActive toggle", () => {
    expect(UpdateMasterSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});
