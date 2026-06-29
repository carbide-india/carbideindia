import * as XLSX from "xlsx";
import type { ImportSpec, Lookups, RefKind } from "./spec";

const KIND_LABEL: Record<RefKind, string> = {
  grade: "Grade", tolerance: "Tolerance", condition: "Condition", shape: "Shape",
  customerType: "Customer Type", industryType: "Industry Type", productType: "Product Type",
  client: "Client", employee: "Employee", inquirySM: "SM Number",
};

/** Auto-generated note for any spec carrying refMulti (multi-select) columns. */
function multiSelectNote(spec: ImportSpec): string | null {
  const multi = spec.fields.filter((f) => f.type === "refMulti").map((f) => f.header);
  if (multi.length === 0) return null;
  return `Multi-select columns (${multi.join(", ")}) accept several values separated by a comma or semicolon, e.g. "OEM, Trader".`;
}

/** Build a downloadable .xlsx: a data sheet (headers + one example row) plus a
 *  "Valid values" sheet listing each referenced kind's current option names. A
 *  note explaining the comma/semicolon-separated multi-select columns is added
 *  to the top of the Valid-values sheet when the spec has any. */
export function buildTemplateWorkbook(spec: ImportSpec, lookups: Lookups): ArrayBuffer {
  const headers = spec.fields.map((f) => f.header);
  const example = spec.fields.map((f) => f.example ?? "");
  const dataWs = XLSX.utils.aoa_to_sheet([headers, example]);

  const kinds = [...new Set(spec.fields.filter((f) => f.ref).map((f) => f.ref!.kind))];
  const cols = kinds.map((k) => [KIND_LABEL[k], ...((lookups[k] ?? []).map((o) => o.label))]);
  const maxLen = Math.max(0, ...cols.map((c) => c.length));
  const refAoa: string[][] = [];
  const note = multiSelectNote(spec);
  if (note) refAoa.push([note], [""]);
  for (let r = 0; r < maxLen; r++) refAoa.push(cols.map((c) => c[r] ?? ""));
  const refWs = XLSX.utils.aoa_to_sheet(refAoa.length ? refAoa : [["(no reference fields)"]]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, dataWs, spec.title.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, refWs, "Valid values");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer | Uint8Array;
  return out instanceof ArrayBuffer
    ? out
    : (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
}
