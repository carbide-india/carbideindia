import * as XLSX from "xlsx";

export type RawRow = Record<string, string>;

/** Parse an uploaded .xlsx/.csv (xlsx reads both) into header-keyed string
 *  rows. Every cell is stringified + trimmed; fully-blank rows are dropped. */
/** A native Excel date cell → `YYYY-MM-DD` using the date's UTC parts (xlsx
 *  date serials are date-only, read at UTC midnight), so it reaches the date
 *  resolver as a clean, unambiguous string instead of a locale-formatted one. */
function cellToString(cell: unknown): string {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const y = cell.getUTCFullYear();
    const m = String(cell.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cell.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(cell ?? "").replace(/\s+/g, " ").trim();
}

export function parseImportFile(buf: ArrayBuffer): RawRow[] {
  // `cellDates` turns real Excel date cells into Date objects (otherwise they
  // arrive as serial numbers like "45970" and every date row fails to parse).
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
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
      const v = cellToString((r as unknown[])[i]);
      row[h] = v;
      if (v) any = true;
    });
    if (any) rows.push(row);
  }
  return rows;
}
