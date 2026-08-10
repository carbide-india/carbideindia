import { describe, it, expect } from "vitest";
import {
  costBasisDelta,
  isCostBasisStale,
  moneyOrNull,
  revisionLabel,
} from "@/components/quotations/costing-basis";

describe("moneyOrNull", () => {
  it("parses numeric strings and rejects blanks / junk", () => {
    expect(moneyOrNull("1234.50")).toBe(1234.5);
    expect(moneyOrNull("0")).toBe(0);
    expect(moneyOrNull("")).toBeNull();
    expect(moneyOrNull(null)).toBeNull();
    expect(moneyOrNull(undefined)).toBeNull();
    expect(moneyOrNull("n/a")).toBeNull();
  });
});

describe("isCostBasisStale", () => {
  it("flags a line quoted off a superseded revision", () => {
    expect(isCostBasisStale("100", "112.5")).toBe(true);
  });

  it("does not flag an unchanged cost", () => {
    expect(isCostBasisStale("100", "100")).toBe(false);
    expect(isCostBasisStale("100.000", "100.0000")).toBe(false);
  });

  it("ignores sub-paisa float noise", () => {
    expect(isCostBasisStale("100.000", "100.004")).toBe(false);
    expect(isCostBasisStale("100.000", "100.006")).toBe(true);
  });

  it("never reports UNKNOWN as stale", () => {
    // A false 'superseded' badge reads as a real pricing problem, so a missing
    // side must stay silent rather than guess.
    expect(isCostBasisStale(null, "120")).toBe(false);
    expect(isCostBasisStale("120", null)).toBe(false);
    expect(isCostBasisStale(null, null)).toBe(false);
    expect(isCostBasisStale("", "")).toBe(false);
  });

  it("treats a zero cost as a real number, not a blank", () => {
    expect(isCostBasisStale("0", "5")).toBe(true);
    expect(isCostBasisStale("0", "0")).toBe(false);
  });
});

describe("costBasisDelta", () => {
  it("is signed latest − quoted basis", () => {
    expect(costBasisDelta("100", "112.5")).toBe(12.5);
    expect(costBasisDelta("100", "90")).toBe(-10);
  });

  it("is null when either side is unknown", () => {
    expect(costBasisDelta(null, "90")).toBeNull();
    expect(costBasisDelta("90", "")).toBeNull();
  });
});

describe("revisionLabel", () => {
  it("names the revision and its route", () => {
    expect(revisionLabel(3, "In-house")).toBe("Costing 3 · In-house");
    expect(revisionLabel(1, null)).toBe("Costing 1");
  });

  it("is null when there is no revision to name", () => {
    expect(revisionLabel(null, "In-house")).toBeNull();
    expect(revisionLabel(undefined, undefined)).toBeNull();
  });
});
