import * as XLSX from "xlsx";

export type RawRow = Record<string, string>;

/** Parse an uploaded .xlsx/.csv (xlsx reads both) into header-keyed string
 *  rows. Every cell is stringified + trimmed; fully-blank rows are dropped. */
export function parseImportFile(buf: ArrayBuffer): RawRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as unknown[][];
  const [headerRow, ...body] = aoa;
  if (!headerRow) return [];
  const headers = headerRow.map((h) => String(h ?? "").trim());
  const rows: RawRow[] = [];
  for (const r of body) {
    const row: RawRow = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const v = String((r as unknown[])[i] ?? "").replace(/\s+/g, " ").trim();
      row[h] = v;
      if (v) any = true;
    });
    if (any) rows.push(row);
  }
  return rows;
}
