import * as XLSX from "xlsx";

/**
 * Client-side CSV export for the shared register data-table.
 *
 * Builds an array-of-arrays worksheet (header row + body rows) with the `xlsx`
 * library and triggers a browser download as a UTF-8 CSV file. Using
 * `XLSX.utils.aoa_to_sheet` → `XLSX.utils.sheet_to_csv` gives us RFC-4180
 * quoting/escaping for free (commas, quotes, newlines inside a cell), which a
 * naive `cells.join(",")` would get wrong.
 *
 * `null` cells become empty strings. The caller passes the CURRENTLY visible /
 * filtered / sorted rows - this util has no opinion about which rows; it just
 * serialises whatever it's given.
 *
 * Returns the CSV string it wrote so it can be unit-tested without a DOM.
 */
export function buildCsv(
  headers: string[],
  rows: (string | number | null)[][],
): string {
  const aoa: (string | number)[][] = [
    headers,
    ...rows.map((r) => r.map((c) => (c == null ? "" : c))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  return XLSX.utils.sheet_to_csv(ws);
}

/**
 * Serialise `rows` to CSV and download it as `<filename>.csv` in the browser.
 * No-op (returns the CSV string) when there's no `document` - e.g. under test.
 */
export function exportRowsToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
): string {
  // Prepend a UTF-8 BOM so Excel opens non-ASCII (₹, °, é) correctly.
  const csv = "﻿" + buildCsv(headers, rows);

  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
    return csv;
  }

  const name = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click's navigation has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return csv;
}
