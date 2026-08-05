import { describe, it, expect } from "vitest";
import {
  ADMIN_ROLE_NAME,
  CANONICAL_ROLE_NAMES,
  ROLE_NAME_PATTERN,
  isCanonicalRoleName,
  normalizeRoleName,
} from "@/lib/roles/canonical";

// The rules that keep /admin/roles from renaming a role out from under the
// server code that quotes its name (requireRole("production") etc.).

describe("isCanonicalRoleName", () => {
  it("matches every seeded pipeline role", () => {
    for (const name of CANONICAL_ROLE_NAMES) {
      expect(isCanonicalRoleName(name)).toBe(true);
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isCanonicalRoleName("  Admin ")).toBe(true);
    expect(isCanonicalRoleName("QC")).toBe(true);
  });

  it("rejects custom role names", () => {
    expect(isCanonicalRoleName("store_keeper")).toBe(false);
    expect(isCanonicalRoleName("")).toBe(false);
  });

  it("includes admin, the role that implies every other", () => {
    expect(CANONICAL_ROLE_NAMES).toContain(ADMIN_ROLE_NAME);
  });
});

describe("normalizeRoleName", () => {
  it("slugs a display name into an identifier", () => {
    expect(normalizeRoleName("Store Keeper")).toBe("store_keeper");
    expect(normalizeRoleName("  Plant   Head  ")).toBe("plant_head");
    expect(normalizeRoleName("Quality-Control")).toBe("quality_control");
  });

  it("drops characters an identifier can't carry", () => {
    expect(normalizeRoleName("R&D / Tooling")).toBe("rd_tooling");
    expect(normalizeRoleName("Store (Night)")).toBe("store_night");
  });

  it("trims leading and trailing underscores", () => {
    expect(normalizeRoleName("__store__")).toBe("store");
    expect(normalizeRoleName("- store -")).toBe("store");
  });

  it("is idempotent", () => {
    const once = normalizeRoleName("Sales & Marketing");
    expect(normalizeRoleName(once)).toBe(once);
  });
});

describe("ROLE_NAME_PATTERN", () => {
  it("accepts snake_case identifiers starting with a letter", () => {
    expect(ROLE_NAME_PATTERN.test("store_keeper")).toBe(true);
    expect(ROLE_NAME_PATTERN.test("qc")).toBe(true);
    expect(ROLE_NAME_PATTERN.test("tier2_sales")).toBe(true);
  });

  it("rejects single characters, digits-first and stray symbols", () => {
    expect(ROLE_NAME_PATTERN.test("q")).toBe(false);
    expect(ROLE_NAME_PATTERN.test("2sales")).toBe(false);
    expect(ROLE_NAME_PATTERN.test("Sales")).toBe(false);
    expect(ROLE_NAME_PATTERN.test("store keeper")).toBe(false);
  });

  it("rejects anything longer than 32 characters", () => {
    expect(ROLE_NAME_PATTERN.test("a".repeat(32))).toBe(true);
    expect(ROLE_NAME_PATTERN.test("a".repeat(33))).toBe(false);
  });

  it("accepts every normalized canonical name", () => {
    for (const name of CANONICAL_ROLE_NAMES) {
      expect(ROLE_NAME_PATTERN.test(normalizeRoleName(name))).toBe(true);
    }
  });
});
