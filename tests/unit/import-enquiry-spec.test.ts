import { describe, it, expect } from "vitest";
import { enquiryImportSpec } from "@/lib/import/specs/enquiry";
import { resolveRow } from "@/lib/import/engine/resolve";
import type { Lookups } from "@/lib/import/engine/spec";

const lookups: Lookups = {
  grade: [{ id: "g1", label: "WC10" }],
  tolerance: [{ id: "t1", label: "h6" }],
  condition: [{ id: "c1", label: "Sintered" }],
  employee: [{ id: "e1", label: "Piyush Bagde" }],
};

describe("enquiryImportSpec", () => {
  it("resolves a complete row to ok with mapped values", () => {
    const row = {
      "Company Name": "Acme Ltd", "Priority": "Normal", "Product Description": "Carbide insert",
      "Quantity": "100", "Grade": "WC10", "Sales Person": "Piyush Bagde",
    };
    const staged = resolveRow(enquiryImportSpec.fields, row, lookups);
    expect(staged.ok).toBe(true);
    expect(staged.cells["companyName"]!.value).toBe("Acme Ltd");
    expect(staged.cells["gradeId"]!.value).toBe("g1");
    expect(staged.cells["assignedSalesPersonId"]!.value).toBe("e1");
  });

  it("fails when required Company Name or Product Description missing", () => {
    const staged = resolveRow(enquiryImportSpec.fields, { "Company Name": "", "Product Description": "x" }, lookups);
    expect(staged.ok).toBe(false);
  });
});
