import type { ImportField, Lookups, RefKind } from "./spec";
import type { RawRow } from "./parse";

export type CellStatus = "ok" | "empty" | "error";

export type CellValue = string | number | boolean | null | string[];

export interface CellResult {
  raw: string;
  value: CellValue;
  display: string;
  status: CellStatus;
  error?: string;
}

export interface StagedRow {
  cells: Record<string, CellResult>;
  ok: boolean;
}

function matchRef(kind: RefKind, raw: string, lookups: Lookups): string | null {
  const opts = lookups[kind] ?? [];
  const hit = opts.find((o) => o.label.toLowerCase() === raw.toLowerCase());
  return hit ? hit.id : null;
}

export function resolveCell(field: ImportField, raw: string, lookups: Lookups): CellResult {
  const text = (raw ?? "").trim();
  const base = { raw: text, display: text };

  if (text === "") {
    return field.required
      ? { ...base, value: null, status: "error" as const, error: `${field.header} is required` }
      : { ...base, value: field.type === "refMulti" ? [] : null, status: "empty" as const };
  }

  switch (field.type) {
    case "number": {
      const n = Number(text);
      if (!Number.isFinite(n)) {
        return { ...base, value: null, status: "error" as const, error: `"${text}" is not a number` };
      }
      if (field.min !== undefined && n < field.min) {
        return { ...base, value: null, status: "error" as const, error: `${field.header} must be at least ${field.min}` };
      }
      return { ...base, value: n, status: "ok" as const };
    }
    case "boolean": {
      const t = text.toLowerCase();
      if (["yes", "true", "y", "1"].includes(t)) return { ...base, value: true, status: "ok" as const };
      if (["no", "false", "n", "0"].includes(t)) return { ...base, value: false, status: "ok" as const };
      return { ...base, value: null, status: "error" as const, error: `"${text}" is not Yes/No` };
    }
    case "date": {
      const d = new Date(text);
      return Number.isNaN(d.getTime())
        ? { ...base, value: null, status: "error" as const, error: `"${text}" is not a date` }
        : { ...base, value: d.toISOString(), status: "ok" as const };
    }
    case "enum": {
      const hit = (field.enumValues ?? []).find(
        (e) => e.label.toLowerCase() === text.toLowerCase() || e.value.toLowerCase() === text.toLowerCase(),
      );
      return hit
        ? { ...base, value: hit.value, display: hit.label, status: "ok" as const }
        : { ...base, value: null, status: "error" as const, error: `"${text}" is not a valid ${field.header}` };
    }
    case "ref": {
      const id = field.ref ? matchRef(field.ref.kind, text, lookups) : null;
      return id
        ? { ...base, value: id, status: "ok" as const }
        : { ...base, value: null, status: "error" as const, error: `${field.header} "${text}" not found` };
    }
    case "refMulti": {
      const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
      const ids: string[] = [];
      for (const p of parts) {
        const id = field.ref ? matchRef(field.ref.kind, p, lookups) : null;
        if (!id) return { ...base, value: null, status: "error" as const, error: `${field.header} "${p}" not found` };
        ids.push(id);
      }
      return { ...base, value: ids, status: "ok" as const };
    }
    default: {
      if (field.maxLen && text.length > field.maxLen) {
        return { ...base, value: text, status: "error" as const, error: `${field.header} too long (max ${field.maxLen})` };
      }
      return { ...base, value: text, status: "ok" as const };
    }
  }
}

export function resolveRow(fields: ImportField[], raw: RawRow, lookups: Lookups): StagedRow {
  const cells: Record<string, CellResult> = {};
  let ok = true;
  for (const f of fields) {
    const c = resolveCell(f, raw[f.header] ?? "", lookups);
    cells[f.key] = c;
    if (c.status === "error") ok = false;
  }
  return { cells, ok };
}

export function resolveRows(fields: ImportField[], rows: RawRow[], lookups: Lookups): StagedRow[] {
  return rows.map((r) => resolveRow(fields, r, lookups));
}
