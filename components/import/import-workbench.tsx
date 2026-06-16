"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Upload, Download, Loader2, Check, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { parseImportFile } from "@/lib/import/engine/parse";
import { resolveRows, resolveCell, type StagedRow } from "@/lib/import/engine/resolve";
import { buildTemplateWorkbook } from "@/lib/import/engine/template";
import { RefCell, type RefCellValue } from "./ref-cell";
import type { ImportSpec, Lookups, ImportRowPayload } from "@/lib/import/engine/spec";

interface Props {
  spec: ImportSpec;
  lookups: Lookups;
  isAdmin: boolean;
  commit: (rows: ImportRowPayload[]) => Promise<{ created: number; skipped: number; newMasters: number; errors: { row: number; reason: string }[] }>;
}

export function ImportWorkbench({ spec, lookups, isAdmin, commit }: Props) {
  const router = useRouter();
  const [rows, setRows] = React.useState<StagedRow[]>([]);
  const [pending, setPending] = React.useState(false);
  const [fatal, setFatal] = React.useState<string | null>(null);

  function downloadTemplate() {
    const buf = buildTemplateWorkbook(spec, lookups);
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${spec.formKey}-import-template.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFatal(null);
    try {
      const buf = await file.arrayBuffer();
      const raw = parseImportFile(buf);
      if (raw.length === 0) { setFatal("No data rows found in the file."); return; }
      setRows(resolveRows(spec.fields, raw, lookups));
    } catch {
      setFatal("Could not read that file. Use the .xlsx template.");
    }
  }

  function editRaw(rowIdx: number, fieldKey: string, raw: string) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const field = spec.fields.find((f) => f.key === fieldKey)!;
      const cell = resolveCell(field, raw, lookups);
      const cells = { ...r.cells, [fieldKey]: cell };
      return { cells, ok: spec.fields.every((f) => cells[f.key]!.status !== "error") };
    }));
  }

  function editRef(rowIdx: number, fieldKey: string, v: RefCellValue) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const field = spec.fields.find((f) => f.key === fieldKey)!;
      const display = typeof v === "string"
        ? (Object.values(lookups).flat().find((o) => o?.id === v)?.label ?? "")
        : v ? `+ ${v.__createMaster.name}` : "";
      const status: "ok" | "empty" | "error" = v === null && field.required ? "error" : "ok";
      const prevCell = r.cells[fieldKey]!;
      const cells = { ...r.cells, [fieldKey]: { ...prevCell, value: v as never, display, status, error: undefined } };
      return { cells, ok: spec.fields.every((f) => cells[f.key]!.status !== "error") };
    }));
  }

  const validCount = rows.filter((r) => r.ok).length;
  const badCount = rows.length - validCount;

  async function onCommit() {
    const payload: ImportRowPayload[] = rows.filter((r) => r.ok).map((r) => {
      const o: ImportRowPayload = {};
      for (const f of spec.fields) o[f.key] = r.cells[f.key]!.value as never;
      return o;
    });
    if (payload.length === 0) { fireToast({ message: "No valid rows to import.", type: "error" }); return; }
    setPending(true);
    try {
      const res = await commit(payload);
      fireToast({ message: `Imported ${res.created} ${spec.title}${res.created === 1 ? "" : "s"}${res.skipped ? `, ${res.skipped} skipped` : ""}.`, type: "success" });
      router.push(spec.basePath as Route);
      router.refresh();
    } catch (e) {
      fireToast({ message: e instanceof Error ? e.message : "Import failed.", type: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft">
          <Download size={15} /> Download template
        </button>
        <label className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold text-white cursor-pointer" style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))" }}>
          <Upload size={15} /> Upload file
          <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {rows.length > 0 && (
          <span className="text-[13px] font-semibold text-ink-muted tabular-nums">
            {validCount} valid · {badCount} need attention
          </span>
        )}
      </div>

      {fatal && <p className="text-[14px] font-semibold" style={{ color: "var(--color-red-deep)" }}>{fatal}</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-section border border-hairline">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft text-left">
                <th className="px-2 py-2 w-8"></th>
                {spec.fields.map((f) => <th key={f.key} className="px-3 py-2 font-bold whitespace-nowrap">{f.header}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-hairline last:border-0">
                  <td className="px-2 text-center">{r.ok ? <Check size={15} className="text-green-600" /> : <X size={15} className="text-red-600" />}</td>
                  {spec.fields.map((f) => {
                    const c = r.cells[f.key]!;
                    return (
                      <td key={f.key} className="px-2 py-1.5 align-top" title={c.error}>
                        {f.type === "ref" ? (
                          <RefCell raw={c.raw} value={c.value as RefCellValue} options={lookups[f.ref!.kind] ?? []} kind={f.ref!.kind} allowCreate={Boolean(f.ref!.allowCreate) && isAdmin} onChange={(v) => editRef(i, f.key, v)} />
                        ) : (
                          <input value={c.display} onChange={(e) => editRaw(i, f.key, e.target.value)} className="nt-input min-w-[120px]" style={c.status === "error" ? { borderColor: "var(--color-red)" } : undefined} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex justify-end">
          <button type="button" disabled={pending || validCount === 0} onClick={onCommit} className="inline-flex items-center gap-2 rounded-chip px-7 py-3.5 text-white font-extrabold disabled:opacity-50" style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))" }}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            {pending ? "Importing…" : `Import ${validCount} ${spec.title}${validCount === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
