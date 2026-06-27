import { describe, it, expect } from "vitest";
import { diffFields } from "@/lib/audit/diff";
describe("diffFields", () => {
  it("returns only changed fields with old+new", () => {
    const r = diffFields({ a: 1, b: "x", c: true }, { a: 2, b: "x", c: false }, ["a","b","c"]);
    expect(r).toEqual([{ field: "a", old: 1, new: 2 }, { field: "c", old: true, new: false }]);
  });
  it("treats null and undefined as equal (no spurious change)", () => {
    expect(diffFields({ a: null }, { a: undefined }, ["a"])).toEqual([]);
  });
  it("normalizes numeric-string vs number when asked is out of scope — strict equality on given fields", () => {
    expect(diffFields({ a: "5" }, { a: "5" }, ["a"])).toEqual([]);
  });
});
