import { describe, it, expect } from "vitest";
import {
  EXPORT_CATALOG,
  EXPORT_ENTITY_KEYS,
  IMPORT_CATALOG,
  IMPORT_ENTITY_KEYS,
  fieldHint,
  fieldTypeLabel,
  findExportEntry,
  isExportEntityKey,
  summariseSpec,
  transferFilename,
} from "@/lib/data-transfer/catalog";
import type { ImportField } from "@/lib/import/engine/spec";

describe("import catalogue", () => {
  it("covers every declared import entity key exactly once", () => {
    const keys = IMPORT_CATALOG.map((e) => e.key);
    expect([...keys].sort()).toEqual([...IMPORT_ENTITY_KEYS].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries a real spec with at least one column on every entry", () => {
    for (const entry of IMPORT_CATALOG) {
      expect(entry.spec.fields.length).toBeGreaterThan(0);
      expect(entry.blurb.length).toBeGreaterThan(10);
    }
  });

  it("never has two columns sharing a sheet header within one spec", () => {
    for (const entry of IMPORT_CATALOG) {
      const headers = entry.spec.fields.map((f) => f.header.toLowerCase());
      expect(new Set(headers).size).toBe(headers.length);
    }
  });
});

describe("summariseSpec", () => {
  it("counts columns, required headers and distinct lookups", () => {
    const summary = summariseSpec({
      formKey: "x",
      title: "X",
      basePath: "/x",
      fields: [
        { key: "a", header: "A", type: "text", required: true },
        { key: "b", header: "B", type: "ref", ref: { kind: "client" } },
        { key: "c", header: "C", type: "ref", ref: { kind: "client" } },
        { key: "d", header: "D", type: "ref", ref: { kind: "grade", allowCreate: true } },
      ],
    });
    expect(summary.columnCount).toBe(4);
    expect(summary.requiredHeaders).toEqual(["A"]);
    expect(summary.refKinds).toEqual(["client", "grade"]);
    expect(summary.createsMasters).toBe(true);
  });

  it("reports createsMasters false when no lookup allows inline creation", () => {
    const summary = summariseSpec({
      formKey: "x",
      title: "X",
      basePath: "/x",
      fields: [{ key: "b", header: "B", type: "ref", ref: { kind: "employee" } }],
    });
    expect(summary.createsMasters).toBe(false);
    expect(summary.requiredHeaders).toEqual([]);
  });

  it("handles a spec with no fields at all", () => {
    const summary = summariseSpec({ formKey: "x", title: "X", basePath: "/x", fields: [] });
    expect(summary).toEqual({
      columnCount: 0,
      requiredHeaders: [],
      refKinds: [],
      createsMasters: false,
    });
  });
});

describe("fieldTypeLabel / fieldHint", () => {
  const cases: Array<[ImportField, string]> = [
    [{ key: "a", header: "A", type: "text" }, "Text"],
    [{ key: "a", header: "A", type: "number" }, "Number"],
    [{ key: "a", header: "A", type: "date" }, "Date"],
    [{ key: "a", header: "A", type: "boolean" }, "Yes / No"],
    [{ key: "a", header: "A", type: "enum", enumValues: [] }, "Choice"],
    [{ key: "a", header: "A", type: "ref", ref: { kind: "grade" } }, "Lookup · Internal Grade"],
    [
      { key: "a", header: "A", type: "refMulti", ref: { kind: "productType" } },
      "Multi-lookup · Product Type",
    ],
  ];
  it.each(cases)("labels %o as %s", (field, expected) => {
    expect(fieldTypeLabel(field)).toBe(expected);
  });

  it("lists enum labels as the accepted values", () => {
    expect(
      fieldHint({
        key: "p",
        header: "Priority",
        type: "enum",
        enumValues: [
          { value: "low", label: "Low" },
          { value: "high", label: "High" },
        ],
      }),
    ).toBe("Low · High");
  });

  it("distinguishes create-able lookups from strict ones", () => {
    expect(
      fieldHint({ key: "g", header: "G", type: "ref", ref: { kind: "grade", allowCreate: true } }),
    ).toContain("created inline");
    expect(
      fieldHint({ key: "e", header: "E", type: "ref", ref: { kind: "employee" } }),
    ).toBe("must already exist");
  });

  it("surfaces number minimums and text length caps", () => {
    expect(fieldHint({ key: "q", header: "Q", type: "number", min: 1 })).toBe("minimum 1");
    expect(fieldHint({ key: "n", header: "N", type: "text", maxLen: 80 })).toBe(
      "max 80 characters",
    );
    expect(fieldHint({ key: "n", header: "N", type: "text" })).toBe("");
  });
});

describe("export catalogue", () => {
  it("covers every declared export entity key exactly once", () => {
    const keys = EXPORT_CATALOG.map((e) => e.key);
    expect([...keys].sort()).toEqual([...EXPORT_ENTITY_KEYS].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every dataset at least one format", () => {
    for (const entry of EXPORT_CATALOG) {
      expect(entry.formats.length).toBeGreaterThan(0);
    }
  });

  it("offers exactly one format for datasets delegated to a module route", () => {
    for (const entry of EXPORT_CATALOG) {
      if (!entry.delegateTo) continue;
      expect(entry.formats).toHaveLength(1);
      expect(entry.delegateTo.startsWith("/")).toBe(true);
    }
  });

  it("resolves known keys and rejects unknown ones", () => {
    expect(findExportEntry("clients")?.label).toBe("Client Master");
    expect(findExportEntry("nope")).toBeUndefined();
    expect(isExportEntityKey("enquiries")).toBe(true);
    expect(isExportEntityKey("../../etc/passwd")).toBe(false);
  });
});

describe("transferFilename", () => {
  it("dates the file and normalises underscores to hyphens", () => {
    expect(transferFilename("sales_orders", "xlsx", new Date("2026-08-04T09:00:00Z"))).toBe(
      "carbide-india-sales-orders-2026-08-04.xlsx",
    );
    expect(transferFilename("enquiries", "csv", new Date("2026-01-09T23:59:59Z"))).toBe(
      "carbide-india-enquiries-2026-01-09.csv",
    );
  });
});
