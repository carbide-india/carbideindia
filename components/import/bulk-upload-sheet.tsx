"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { DataSheetGrid, type DataSheetGridRef } from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";
import {
  Download,
  Loader2,
  Plus,
  Redo2,
  TriangleAlert,
  Undo2,
  Upload,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { parseImportFile } from "@/lib/import/engine/parse";
import { resolveRows } from "@/lib/import/engine/resolve";
import { buildTemplateWorkbook } from "@/lib/import/engine/template";
import type { ImportSpec, Lookups, ImportRowPayload } from "@/lib/import/engine/spec";
import { columnsForFields } from "@/lib/import/grid/columns";
import {
  blankRow,
  blankRows,
  partitionRows,
  toPayload,
  type SheetRow,
} from "@/lib/import/grid/rows";
import {
  canRedo,
  canUndo,
  createHistory,
  current,
  push,
  redo,
  undo,
  type History,
} from "@/lib/import/grid/history";

type CommitFn = (rows: ImportRowPayload[]) => Promise<{
  created: number;
  skipped: number;
  duplicates?: number;
  newMasters: number;
  errors: { row: number; reason: string }[];
}>;

/**
 * Bulk upload as an in-app spreadsheet.
 *
 * Opens with blank rows ready to type into — no Excel round trip required. The
 * template download and file upload remain as assists that fill the same grid,
 * and every value (typed, pasted or parsed) runs through the SAME `resolveCell`
 * validation the commit action relies on.
 *
 * Undo/redo is ours (the library does not provide it) and works by snapshotting
 * the whole sheet; see lib/import/grid/history.ts.
 */
export function BulkUploadSheet({
  spec,
  lookups,
  isAdmin,
  commit,
  onDirtyChange,
  onDone,
}: {
  spec: ImportSpec;
  lookups: Lookups;
  isAdmin: boolean;
  commit: CommitFn;
  /** Lets a host modal warn before discarding typed rows. */
  onDirtyChange?: (dirty: boolean) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const gridRef = React.useRef<DataSheetGridRef>(null);
  const [sheetBoxRef, sheetHeight] = useMeasuredHeight(360);
  const [history, setHistory] = React.useState<History<SheetRow>>(() =>
    createHistory(blankRows(spec.fields, lookups)),
  );
  const [pending, setPending] = React.useState(false);
  const [fatal, setFatal] = React.useState<string | null>(null);

  const rows = current(history);
  const columns = React.useMemo(
    () => columnsForFields(spec.fields, lookups, isAdmin),
    [spec.fields, lookups, isAdmin],
  );
  const { valid, invalid, emptyCount } = React.useMemo(
    () => partitionRows(rows, spec.fields),
    [rows, spec.fields],
  );

  const dirty = rows.length - emptyCount > 0;
  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const commitRows = React.useCallback((next: SheetRow[]) => {
    setHistory((h) => push(h, next));
  }, []);

  // Ctrl/⌘+Z / Ctrl+Y (or ⇧+Ctrl+Z) anywhere inside the sheet.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      setHistory((h) => undo(h));
    } else if (k === "y" || (k === "z" && e.shiftKey)) {
      e.preventDefault();
      setHistory((h) => redo(h));
    }
  }

  function downloadTemplate() {
    const buf = buildTemplateWorkbook(spec, lookups);
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.formKey}-import-template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFatal(null);
    try {
      const raw = parseImportFile(await file.arrayBuffer());
      if (raw.length === 0) {
        setFatal("No data rows found in that file.");
        return;
      }
      const parsed = resolveRows(spec.fields, raw, lookups).map((r) => r.cells);
      // Replace the untouched blanks, keep anything already typed.
      const typed = rows.filter((r) => spec.fields.some((f) => (r[f.key]?.raw ?? "") !== ""));
      commitRows([...typed, ...parsed, ...blankRows(spec.fields, lookups, 5)]);
      fireToast({ message: `Loaded ${parsed.length} row${parsed.length === 1 ? "" : "s"} from the file.` });
    } catch {
      setFatal("Could not read that file. Use the .xlsx template.");
    }
  }

  async function onCommit() {
    if (valid.length === 0) {
      fireToast({ message: "Nothing valid to import yet.", type: "error" });
      return;
    }
    setPending(true);
    try {
      const res = await commit(toPayload(valid, spec.fields));
      const dup = res.duplicates ?? 0;
      const parts = [`Imported ${res.created} ${spec.title}${res.created === 1 ? "" : "s"}`];
      if (dup) parts.push(`${dup} duplicate${dup === 1 ? "" : "s"} skipped`);
      if (res.errors.length) parts.push(`${res.errors.length} error${res.errors.length === 1 ? "" : "s"}`);
      fireToast({
        message: `${parts.join(" · ")}.`,
        type: res.errors.length ? "error" : "success",
      });
      if (onDone) {
        onDone();
        router.refresh();
      } else {
        router.push(spec.basePath as Route);
        router.refresh();
      }
    } catch (e) {
      fireToast({ message: e instanceof Error ? e.message : "Import failed.", type: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" onKeyDown={onKeyDown}>
      <SheetStyles />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <ToolButton onClick={() => commitRows([...rows, blankRow(spec.fields, lookups)])} Icon={Plus}>
          Add row
        </ToolButton>
        <ToolButton
          onClick={() => setHistory((h) => undo(h))}
          disabled={!canUndo(history)}
          Icon={Undo2}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </ToolButton>
        <ToolButton
          onClick={() => setHistory((h) => redo(h))}
          disabled={!canRedo(history)}
          Icon={Redo2}
          title="Redo (Ctrl+Y)"
        >
          Redo
        </ToolButton>

        <span className="mx-1 h-5 w-px bg-[#dfe2ea]" />

        <ToolButton onClick={downloadTemplate} Icon={Download}>
          Template
        </ToolButton>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#d5d8de] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#1e2f66] transition hover:border-[#2b46b5] hover:text-[#2b46b5]">
          <Upload size={14} strokeWidth={2.4} />
          Upload file
          <input
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-ink-subtle">
          <span className="text-[#16a34a]">{valid.length} ready</span>
          {invalid.length > 0 && (
            <>
              {" · "}
              <span className="text-[#d32f2f]">{invalid.length} need attention</span>
            </>
          )}
        </span>
      </div>

      <p className="text-[12px] font-medium text-ink-subtle">
        Type straight into the sheet, or paste a block copied from Excel. Arrow keys and Tab move between
        cells; Ctrl+Z undoes. Blank rows are ignored on import.
      </p>

      {fatal && (
        <p className="text-[13px] font-bold" style={{ color: "var(--color-red-deep, #d32f2f)" }}>
          {fatal}
        </p>
      )}

      {/* ── The sheet ───────────────────────────────────────────────────── */}
      {/* The grid virtualises against an explicit pixel height, so we measure
          the flex slot it was given rather than guessing — otherwise it renders
          taller than the modal and the whole dialog scrolls instead of the grid. */}
      <div
        ref={sheetBoxRef}
        className="dsg-carbide min-h-0 flex-1 overflow-hidden rounded-xl border border-[#d9dce4]"
      >
        <DataSheetGrid<SheetRow>
          ref={gridRef}
          value={rows}
          onChange={commitRows}
          columns={columns}
          height={sheetHeight}
          rowHeight={38}
          headerRowHeight={40}
          createRow={() => blankRow(spec.fields, lookups)}
          duplicateRow={({ rowData }) => ({ ...rowData })}
          addRowsComponent={false}
          rowClassName={({ rowData }) =>
            spec.fields.some((f) => rowData[f.key]?.status === "error") ? "dsg-row-bad" : undefined
          }
        />
      </div>

      {/* ── Errors ──────────────────────────────────────────────────────── */}
      {invalid.length > 0 && (
        <div className="max-h-[120px] shrink-0 overflow-y-auto rounded-lg border border-[#f0b4b4] bg-[#fdeeee] px-3 py-2">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-black uppercase tracking-[0.08em] text-[#a62121]">
            <TriangleAlert size={13} strokeWidth={2.6} />
            Rows needing attention
          </div>
          <ul className="flex flex-col gap-0.5">
            {invalid.slice(0, 25).map((r) => (
              <li key={r.index} className="text-[12.5px] text-[#7f1d1d]">
                <button
                  type="button"
                  className="font-bold underline underline-offset-2"
                  onClick={() => gridRef.current?.setActiveCell({ col: 0, row: r.index })}
                >
                  Row {r.index + 1}
                </button>
                {" — "}
                {r.errors.map((e) => e.message).join("; ")}
              </li>
            ))}
            {invalid.length > 25 && (
              <li className="text-[12px] font-semibold text-[#7f1d1d]">
                …and {invalid.length - 25} more.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ── Commit ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-end gap-3">
        <button
          type="button"
          disabled={pending || valid.length === 0}
          onClick={() => void onCommit()}
          className="inline-flex items-center gap-2 rounded-chip px-7 py-3 text-[14px] font-extrabold text-white transition-opacity disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #3f3f94, #2f2f6f)" }}
        >
          {pending && <Loader2 size={16} style={{ animation: "spinFast 0.8s linear infinite" }} />}
          {pending
            ? "Importing…"
            : `Import ${valid.length} ${spec.title}${valid.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

/**
 * Live pixel height of an element, for the grid's virtualisation. Falls back to
 * `initial` until the first measurement so the sheet is never zero-height on the
 * first paint (which would render an empty grid).
 */
function useMeasuredHeight(
  initial: number,
): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(initial);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry?.contentRect.height ?? 0;
      if (h > 0) setHeight(Math.round(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, height];
}

function ToolButton({
  children,
  Icon,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  Icon: typeof Plus;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#d5d8de] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#1e2f66] transition hover:border-[#2b46b5] hover:text-[#2b46b5] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={14} strokeWidth={2.4} />
      {children}
    </button>
  );
}

/**
 * Overrides for the library's stock CSS so the sheet reads as part of the app
 * (indigo brand, house field metrics) rather than a third-party widget.
 */
function SheetStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
        .dsg-carbide .dsg-container { font-family: var(--font-sans), system-ui, sans-serif; }
        .dsg-carbide .dsg-cell-header { background: #eef1fb; color: #1e2f66; font-weight: 800;
          font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; }
        .dsg-carbide .dsg-cell { background: #fff; }
        .dsg-carbide .dsg-cell-disabled { background: #f7f8fa; }
        .dsg-carbide .dsg-selection-col-marker, .dsg-carbide .dsg-selection-row-marker { background: #3f3f94; }
        .dsg-carbide .dsg-selection-border { border-color: #3f3f94; }
        .dsg-carbide .dsg-row-bad .dsg-cell { background: #fff8f8; }
        .dsg-carbide-input { width: 100%; height: 100%; padding: 0 10px; border: 0; outline: none;
          background: transparent; font-size: 13.5px; font-weight: 600; color: #14151a; }
        .dsg-carbide-input[data-status="error"] { background: #fdeeee; color: #a62121; }
        .dsg-carbide-input::placeholder { color: #b8bdc9; font-weight: 400; }
        .dsg-carbide-ref { width: 100%; padding: 0 4px; }
        .dsg-carbide-ref[data-status="error"] { background: #fdeeee; }
      `,
      }}
    />
  );
}
