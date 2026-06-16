import { describe, it, expect } from "vitest";
import { resolveCell, resolveRow } from "@/lib/import/engine/resolve";
import type { ImportField, Lookups } from "@/lib/import/engine/spec";

const lookups: Lookups = {
  grade: [{ id: "g1", label: "WC10" }, { id: "g2", label: "WC20" }],
  employee: [{ id: "e1", label: "Piyush Bagde" }],
  productType: [{ id: "p1", label: "Insert" }, { id: "p2", label: "Rod" }],
};

const gradeField: ImportField = { key: "gradeId", header: "Grade", type: "ref", ref: { kind: "grade", allowCreate: true } };

describe("resolveCell", () => {
  it("matches a ref by case-insensitive label", () => {
    const c = resolveCell(gradeField, "wc10", lookups);
    expect(c.status).toBe("ok");
    expect(c.value).toBe("g1");
  });
  it("flags an unmatched ref as error", () => {
    const c = resolveCell(gradeField, "WC99", lookups);
    expect(c.status).toBe("error");
    expect(c.value).toBeNull();
    expect(c.error).toMatch(/not found/i);
  });
  it("treats blank optional ref as empty (ok)", () => {
    expect(resolveCell(gradeField, "", lookups).status).toBe("empty");
  });
  it("errors on a blank required text cell", () => {
    const f: ImportField = { key: "companyName", header: "Company Name", type: "text", required: true };
    expect(resolveCell(f, "", lookups).status).toBe("error");
  });
  it("coerces number + reports a bad number", () => {
    const f: ImportField = { key: "qty", header: "Quantity", type: "number" };
    expect(resolveCell(f, "12", lookups).value).toBe(12);
    expect(resolveCell(f, "abc", lookups).status).toBe("error");
  });
  it("matches an enum label to its value", () => {
    const f: ImportField = { key: "priority", header: "Priority", type: "enum",
      enumValues: [{ label: "High", value: "high" }, { label: "Normal", value: "normal" }] };
    expect(resolveCell(f, "high", lookups).value).toBe("high");
    expect(resolveCell(f, "Urgent", lookups).status).toBe("error");
  });
  it("splits refMulti on commas, ids resolved, unknown → error", () => {
    const f: ImportField = { key: "productTypeIds", header: "Product Types", type: "refMulti", ref: { kind: "productType" } };
    expect(resolveCell(f, "Insert, Rod", lookups).value).toEqual(["p1", "p2"]);
    expect(resolveCell(f, "Insert, Nope", lookups).status).toBe("error");
  });
  it("parses Yes/No booleans", () => {
    const f: ImportField = { key: "export", header: "Export", type: "boolean" };
    expect(resolveCell(f, "Yes", lookups).value).toBe(true);
    expect(resolveCell(f, "no", lookups).value).toBe(false);
  });
});

describe("resolveRow", () => {
  it("row ok only when every cell ok/empty", () => {
    const fields: ImportField[] = [
      { key: "companyName", header: "Company Name", type: "text", required: true },
      gradeField,
    ];
    expect(resolveRow(fields, { "Company Name": "Acme", "Grade": "WC10" }, lookups).ok).toBe(true);
    expect(resolveRow(fields, { "Company Name": "Acme", "Grade": "WC99" }, lookups).ok).toBe(false);
  });
});
