import { describe, it, expect } from "vitest";
import { buildCsv } from "@/lib/registers/export-rows";

describe("buildCsv", () => {
  it("writes a header row followed by body rows", () => {
    const csv = buildCsv(
      ["SM", "Company"],
      [
        ["SM-1", "Acme"],
        ["SM-2", "Globex"],
      ],
    );
    expect(csv.trim().split(/\r?\n/)).toEqual([
      "SM,Company",
      "SM-1,Acme",
      "SM-2,Globex",
    ]);
  });

  it("renders null cells as empty strings", () => {
    const csv = buildCsv(["A", "B"], [["x", null]]);
    expect(csv.trim().split(/\r?\n/)[1]).toBe("x,");
  });

  it("quotes cells containing commas, quotes, or newlines (RFC 4180)", () => {
    const csv = buildCsv(["Note"], [["a, b"], ['he said "hi"'], ["line1\nline2"]]);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe("Note");
    expect(lines[1]).toBe('"a, b"');
    expect(lines[2]).toBe('"he said ""hi"""');
    // A cell with an embedded newline stays quoted and spans two physical lines.
    expect(csv).toContain('"line1\nline2"');
  });

  it("keeps numbers unquoted", () => {
    const csv = buildCsv(["Qty"], [[42], [3.5]]);
    expect(csv.trim().split(/\r?\n/)).toEqual(["Qty", "42", "3.5"]);
  });
});
