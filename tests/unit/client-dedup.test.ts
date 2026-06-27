import { describe, it, expect, vi } from "vitest";

// dedup.ts does `import "server-only"` and imports the db client; neutralise
// both under vitest — we only exercise the pure normalizeDedupKey here.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { normalizeDedupKey } from "@/lib/clients/dedup";

describe("normalizeDedupKey", () => {
  it("trims and uppercases", () => {
    expect(normalizeDedupKey("  27aapfu0939f1zv ")).toBe("27AAPFU0939F1ZV");
  });

  it("treats empty / whitespace / null / undefined as null", () => {
    expect(normalizeDedupKey("")).toBeNull();
    expect(normalizeDedupKey("   ")).toBeNull();
    expect(normalizeDedupKey(null)).toBeNull();
    expect(normalizeDedupKey(undefined)).toBeNull();
  });

  it("leaves an already-normalized value unchanged", () => {
    expect(normalizeDedupKey("AAAPF1234C")).toBe("AAAPF1234C");
  });
});
