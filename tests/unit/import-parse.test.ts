import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseImportFile } from "@/lib/import/engine/parse";

function xlsxBuffer(aoa: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  // xlsx@0.18+ returns an ArrayBuffer directly when type:"array" in Node/vitest
  const result = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as unknown;
  if (result instanceof ArrayBuffer) return result;
  const u8 = result as Uint8Array;
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

describe("parseImportFile", () => {
  it("maps header row to keyed string cells and trims blank rows", () => {
    const buf = xlsxBuffer([
      ["Company Name", "Quantity"],
      ["Acme Ltd", 50],
      ["", ""],
      ["  Beta  ", "  7 "],
    ]);
    const rows = parseImportFile(buf);
    expect(rows).toEqual([
      { "Company Name": "Acme Ltd", "Quantity": "50" },
      { "Company Name": "Beta", "Quantity": "7" },
    ]);
  });

  it("returns [] for an empty sheet", () => {
    expect(parseImportFile(xlsxBuffer([["Company Name"]]))).toEqual([]);
  });
});
