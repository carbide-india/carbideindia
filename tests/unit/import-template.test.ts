import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildTemplateWorkbook } from "@/lib/import/engine/template";
import type { ImportSpec, Lookups } from "@/lib/import/engine/spec";

const spec: ImportSpec = {
  formKey: "demo", title: "Demo", basePath: "/demo",
  fields: [
    { key: "companyName", header: "Company Name", type: "text", required: true, example: "Acme Ltd" },
    { key: "gradeId", header: "Grade", type: "ref", ref: { kind: "grade" }, example: "WC10" },
  ],
};
const lookups: Lookups = { grade: [{ id: "g1", label: "WC10" }, { id: "g2", label: "WC20" }] };

describe("buildTemplateWorkbook", () => {
  it("emits a data sheet with headers + example and a Valid values sheet", () => {
    const buf = buildTemplateWorkbook(spec, lookups);
    const wb = XLSX.read(buf, { type: "array" });
    expect(wb.SheetNames).toContain("Demo");
    expect(wb.SheetNames).toContain("Valid values");
    const data = XLSX.utils.sheet_to_json(wb.Sheets["Demo"]!, { header: 1 }) as string[][];
    expect(data[0]).toEqual(["Company Name", "Grade"]);
    expect(data[1]).toEqual(["Acme Ltd", "WC10"]);
    const ref = XLSX.utils.sheet_to_json(wb.Sheets["Valid values"]!, { header: 1 }) as string[][];
    expect(ref.flat()).toContain("WC10");
    expect(ref.flat()).toContain("WC20");
  });
});
