import type { ImportField, ImportRowPayload } from "@/lib/import/engine/spec";
import { resolveCell, type CellResult } from "@/lib/import/engine/resolve";
import type { Lookups } from "@/lib/import/engine/spec";

/**
 * Row helpers for the bulk-upload sheet. Pure (no React, no db) so the paste /
 * blank-row / partition logic is unit-testable on its own.
 *
 * A sheet row is the per-field `CellResult` map the import engine already
 * produces — reusing it means the grid, the file upload and the commit all run
 * through exactly one validation path (`resolveCell`).
 */
export type SheetRow = Record<string, CellResult>;

/** How many empty rows a freshly-opened sheet offers. */
export const BLANK_ROWS = 20;

/** An empty row: every field resolved from "" so required cells start flagged. */
export function blankRow(fields: ImportField[], lookups: Lookups): SheetRow {
  const row: SheetRow = {};
  for (const f of fields) row[f.key] = resolveCell(f, "", lookups);
  return row;
}

export function blankRows(
  fields: ImportField[],
  lookups: Lookups,
  count = BLANK_ROWS,
): SheetRow[] {
  return Array.from({ length: count }, () => blankRow(fields, lookups));
}

/** A row nobody has typed into — every cell's raw text is empty. */
export function isRowEmpty(row: SheetRow, fields: ImportField[]): boolean {
  return fields.every((f) => (row[f.key]?.raw ?? "").trim() === "");
}

/** A row is committable when it has content and no cell is in error. */
export function isRowValid(row: SheetRow, fields: ImportField[]): boolean {
  if (isRowEmpty(row, fields)) return false;
  return fields.every((f) => row[f.key]?.status !== "error");
}

export interface RowPartition {
  /** Rows that will be sent to the commit action. */
  valid: SheetRow[];
  /** Rows with content but at least one error — surfaced to the user. */
  invalid: { row: SheetRow; index: number; errors: { field: string; message: string }[] }[];
  /** Untouched rows — ignored silently, never an error. */
  emptyCount: number;
}

/**
 * Split the sheet into what commits, what needs attention, and what to ignore.
 * Blank rows are NOT errors: the sheet opens with 20 of them, and a user who
 * fills three should be able to import without deleting the other seventeen.
 */
export function partitionRows(rows: SheetRow[], fields: ImportField[]): RowPartition {
  const valid: SheetRow[] = [];
  const invalid: RowPartition["invalid"] = [];
  let emptyCount = 0;

  rows.forEach((row, index) => {
    if (isRowEmpty(row, fields)) {
      emptyCount += 1;
      return;
    }
    const errors = fields
      .filter((f) => row[f.key]?.status === "error")
      .map((f) => ({ field: f.header, message: row[f.key]?.error ?? "Invalid" }));
    if (errors.length === 0) valid.push(row);
    else invalid.push({ row, index, errors });
  });

  return { valid, invalid, emptyCount };
}

/** Strip the sheet down to the payload the module's commit action expects. */
export function toPayload(rows: SheetRow[], fields: ImportField[]): ImportRowPayload[] {
  return rows.map((row) => {
    const out: ImportRowPayload = {};
    for (const f of fields) out[f.key] = row[f.key]?.value as never;
    return out;
  });
}
