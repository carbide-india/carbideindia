import { describe, expect, it } from "vitest";
import type { ImportField, Lookups } from "@/lib/import/engine/spec";
import {
  blankRow,
  blankRows,
  isRowEmpty,
  isRowValid,
  partitionRows,
  toPayload,
} from "@/lib/import/grid/rows";
import { resolveCell } from "@/lib/import/engine/resolve";

const FIELDS: ImportField[] = [
  { key: "companyName", header: "Company Name", type: "text", required: true },
  { key: "city", header: "City", type: "text" },
  { key: "qty", header: "Qty", type: "number", min: 1 },
  { key: "customerTypeId", header: "Customer Type", type: "ref", ref: { kind: "customerType" } },
];

const LOOKUPS: Lookups = {
  customerType: [{ id: "ct-1", label: "OEM" }],
};

function rowFrom(values: Record<string, string>) {
  const row = blankRow(FIELDS, LOOKUPS);
  for (const [key, raw] of Object.entries(values)) {
    const field = FIELDS.find((f) => f.key === key)!;
    row[key] = resolveCell(field, raw, LOOKUPS);
  }
  return row;
}

describe("bulk-upload sheet rows", () => {
  it("a blank row is empty and flags required fields", () => {
    const row = blankRow(FIELDS, LOOKUPS);
    expect(isRowEmpty(row, FIELDS)).toBe(true);
    expect(row.companyName?.status).toBe("error"); // required
    expect(row.city?.status).toBe("empty");
  });

  it("blankRows produces independent rows", () => {
    const rows = blankRows(FIELDS, LOOKUPS, 3);
    expect(rows).toHaveLength(3);
    rows[0]!.city = resolveCell(FIELDS[1]!, "Nashik", LOOKUPS);
    expect(rows[1]!.city?.raw).toBe("");
  });

  it("an empty row is never valid, even though required cells are flagged", () => {
    expect(isRowValid(blankRow(FIELDS, LOOKUPS), FIELDS)).toBe(false);
  });

  it("a filled row with no errors is valid", () => {
    const row = rowFrom({ companyName: "Acme Ltd", city: "Nashik" });
    expect(isRowValid(row, FIELDS)).toBe(true);
  });

  it("partition ignores blank rows rather than calling them errors", () => {
    const rows = [
      rowFrom({ companyName: "Acme Ltd" }),
      blankRow(FIELDS, LOOKUPS),
      blankRow(FIELDS, LOOKUPS),
    ];
    const p = partitionRows(rows, FIELDS);
    expect(p.valid).toHaveLength(1);
    expect(p.invalid).toHaveLength(0);
    expect(p.emptyCount).toBe(2);
  });

  it("partition reports a touched row that is missing a required cell", () => {
    const rows = [rowFrom({ city: "Pune" })]; // no company name
    const p = partitionRows(rows, FIELDS);
    expect(p.valid).toHaveLength(0);
    expect(p.invalid).toHaveLength(1);
    expect(p.invalid[0]!.index).toBe(0);
    expect(p.invalid[0]!.errors[0]!.message).toMatch(/required/i);
  });

  it("partition reports a bad number against the field minimum", () => {
    const p = partitionRows([rowFrom({ companyName: "Acme", qty: "0" })], FIELDS);
    expect(p.invalid[0]!.errors[0]!.message).toMatch(/at least 1/);
  });

  it("a ref cell resolves a pasted label to its master id", () => {
    const row = rowFrom({ companyName: "Acme", customerTypeId: "OEM" });
    expect(row.customerTypeId?.value).toBe("ct-1");
    expect(row.customerTypeId?.status).toBe("ok");
  });

  it("an unmatched ref label is an error, not a silent drop", () => {
    const row = rowFrom({ companyName: "Acme", customerTypeId: "Nope" });
    expect(row.customerTypeId?.status).toBe("error");
  });

  it("toPayload emits resolved values keyed by field key", () => {
    const rows = [rowFrom({ companyName: "Acme Ltd", qty: "5", customerTypeId: "OEM" })];
    expect(toPayload(rows, FIELDS)[0]).toEqual({
      companyName: "Acme Ltd",
      city: null,
      qty: 5,
      customerTypeId: "ct-1",
    });
  });
});
