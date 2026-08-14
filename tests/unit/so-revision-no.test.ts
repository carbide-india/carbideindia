import { describe, expect, it } from "vitest";
import {
  baseSoNo,
  revisionOfSoNo,
  revisionSoNo,
} from "@/lib/sales-orders/revision-no";

describe("sales order revision numbering", () => {
  it("leaves an un-revised number alone", () => {
    expect(baseSoNo("SM9579-SO01")).toBe("SM9579-SO01");
    expect(revisionOfSoNo("SM9579-SO01")).toBe(1);
  });

  it("strips a revision suffix", () => {
    expect(baseSoNo("SM9579-SO01-R2")).toBe("SM9579-SO01");
    expect(revisionOfSoNo("SM9579-SO01-R2")).toBe(2);
    expect(revisionOfSoNo("SM9579-SO01-R17")).toBe(17);
  });

  it("never stacks suffixes", () => {
    // The whole reason this module exists: revising a revision must replace the
    // suffix, not append a second one.
    expect(revisionSoNo("SM9579-SO01-R2", 3)).toBe("SM9579-SO01-R3");
    expect(revisionSoNo(revisionSoNo("SM9579-SO01", 2), 3)).toBe("SM9579-SO01-R3");
  });

  it("does not mistake a -R in the middle of a number for a suffix", () => {
    // `split("-R")[0]` would return "SM9579" here and mint the next revision
    // against an order number that does not exist.
    expect(baseSoNo("SM9579-RUSH-SO01")).toBe("SM9579-RUSH-SO01");
    expect(revisionSoNo("SM9579-RUSH-SO01", 2)).toBe("SM9579-RUSH-SO01-R2");
  });

  it("does not treat a bare -R as a suffix", () => {
    expect(baseSoNo("SM9579-SO01-R")).toBe("SM9579-SO01-R");
    expect(revisionOfSoNo("SM9579-SO01-R")).toBe(1);
  });

  it("calls revision 1 by its plain name", () => {
    // There is no such document as "-R1"; the original is revision 1.
    expect(revisionSoNo("SM9579-SO01", 1)).toBe("SM9579-SO01");
    expect(revisionSoNo("SM9579-SO01-R4", 1)).toBe("SM9579-SO01");
  });
});
