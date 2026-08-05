import { describe, it, expect } from "vitest";
import {
  DANGER_ZONE_OPERATIONS,
  DANGER_ZONE_WINDOW_MAX,
  clampWindow,
  confirmationMatches,
} from "@/lib/danger-zone/operations";

describe("clampWindow", () => {
  it("keeps whole days inside the allowed range", () => {
    expect(clampWindow(90)).toBe(90);
    expect(clampWindow("30")).toBe(30);
  });
  it("floors fractions and clamps out-of-range input", () => {
    expect(clampWindow(2.9)).toBe(2);
    expect(clampWindow(-40)).toBe(0);
    expect(clampWindow(99999)).toBe(DANGER_ZONE_WINDOW_MAX);
  });
  it("treats junk as zero rather than NaN", () => {
    expect(clampWindow("abc")).toBe(0);
    expect(clampWindow(undefined)).toBe(0);
    expect(clampWindow(null)).toBe(0);
  });
});

describe("confirmationMatches", () => {
  const purge = DANGER_ZONE_OPERATIONS.purge_recycled_drafts;
  const revoke = DANGER_ZONE_OPERATIONS.revoke_employee_access;
  const caches = DANGER_ZONE_OPERATIONS.clear_caches;

  it("requires the exact phrase, case included", () => {
    expect(confirmationMatches(purge, "PURGE DRAFTS")).toBe(true);
    expect(confirmationMatches(purge, "  PURGE DRAFTS  ")).toBe(true);
    expect(confirmationMatches(purge, "purge drafts")).toBe(false);
    expect(confirmationMatches(purge, "PURGE")).toBe(false);
    expect(confirmationMatches(purge, "")).toBe(false);
  });

  it("matches the target email case-insensitively for revoke", () => {
    expect(confirmationMatches(revoke, "Alok@carbideindia.com", "alok@carbideindia.com")).toBe(true);
    expect(confirmationMatches(revoke, "alok@carbideindia.com", "manan@carbideindia.com")).toBe(false);
    // No target supplied means nothing can confirm.
    expect(confirmationMatches(revoke, "alok@carbideindia.com")).toBe(false);
    expect(confirmationMatches(revoke, "", "alok@carbideindia.com")).toBe(false);
  });

  it("lets non-destructive operations through without typing", () => {
    expect(confirmationMatches(caches, "")).toBe(true);
  });
});

describe("operation catalogue", () => {
  it("gives every operation a unique audit entity id and a run label", () => {
    const metas = Object.values(DANGER_ZONE_OPERATIONS);
    const ids = new Set(metas.map((m) => m.auditEntityId));
    expect(ids.size).toBe(metas.length);
    for (const m of metas) {
      expect(m.auditEntityId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(m.runLabel.length).toBeGreaterThan(0);
      expect(m.blastRadius.length).toBeGreaterThan(0);
      expect(m.protected.length).toBeGreaterThan(0);
      // A phrase-confirmed operation must actually carry its phrase.
      if (m.confirmKind === "phrase") expect(m.confirmPhrase).toBeTruthy();
    }
  });
});
