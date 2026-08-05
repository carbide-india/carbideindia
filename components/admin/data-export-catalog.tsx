"use client";

import * as React from "react";
import { AlertTriangle, ArrowUpRight, Database, Download } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatCount } from "@/lib/format";
import type { DataJobFormat } from "@/db/enums";
import type {
  ExportCatalogEntry,
  ExportEntityKey,
} from "@/lib/data-transfer/catalog";

interface Props {
  entries: readonly ExportCatalogEntry[];
  /** Live row count per dataset - 0 on a fresh install, never undefined. */
  counts: Record<ExportEntityKey, number>;
  /**
   * MAX_EXPORT_ROWS from lib/exports/csv, passed in rather than imported:
   * that module pulls in csv-stringify, which has no business in the browser
   * bundle just to read one constant.
   */
  csvRowCap: number;
}

const STAGE_ORDER = ["Masters", "Sales pipeline", "Operations"] as const;

const STAGE_BLURB: Record<(typeof STAGE_ORDER)[number], string> = {
  Masters: "Reference data other modules point at.",
  "Sales pipeline": "Transactional registers, SM number first.",
  Operations: "Work management and the audit stream.",
};

const FORMAT_LABEL: Record<DataJobFormat, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV",
  json: "JSON",
};

/**
 * The exportable half of the hub. Every row links at /admin/data/export, which
 * logs the run then either generates the file or hands off to the module's own
 * canonical export route - so an admin never has to remember which module owns
 * which download.
 */
export function DataExportCatalog({ entries, counts, csvRowCap }: Props) {
  if (entries.length === 0) {
    return (
      <div
        className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
        >
          No exportable datasets configured
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {STAGE_ORDER.map((stage) => {
        const group = entries.filter((e) => e.stage === stage);
        if (group.length === 0) return null;
        return (
          <section key={stage} aria-labelledby={`export-stage-${stage}`}>
            <h2
              id={`export-stage-${stage}`}
              className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#6b7280]"
            >
              {stage}
            </h2>
            <p className="mt-1 mb-4 text-[13.5px] text-[#8a90a0]">
              {STAGE_BLURB[stage]}
            </p>
            <div className="flex flex-col gap-3">
              {group.map((entry) => (
                <ExportRow
                  key={entry.key}
                  entry={entry}
                  rowCount={counts[entry.key] ?? 0}
                  csvRowCap={csvRowCap}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ExportRow({
  entry,
  rowCount,
  csvRowCap,
}: {
  entry: ExportCatalogEntry;
  rowCount: number;
  csvRowCap: number;
}) {
  const firstFormat = entry.formats[0] ?? "xlsx";
  const [format, setFormat] = React.useState<DataJobFormat>(firstFormat);
  const selectId = `export-format-${entry.key}`;

  const empty = rowCount === 0;
  // The shared CSV helper refuses anything past the cap rather than silently
  // truncating - warn before the click, not after the 422.
  const csvOverCap = format === "csv" && rowCount > csvRowCap;
  const href = `/admin/data/export?entity=${entry.key}&format=${format}`;

  return (
    <article
      className="flex flex-wrap items-center gap-4 rounded-section border border-hairline bg-surface-card px-5 py-4"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{
          background: "#efeffb",
          color: "#3f3f94",
          border: "1px solid rgba(63,63,148,0.18)",
        }}
        aria-hidden="true"
      >
        <Database className="h-[18px] w-[18px]" strokeWidth={2.1} />
      </span>

      <div className="min-w-[240px] flex-1">
        <h3 className="flex flex-wrap items-center gap-2 text-[15.5px] font-extrabold tracking-tight text-[#1e2f66]">
          {entry.label}
          {entry.delegateTo && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[#dcdce8] px-2 py-0.5 text-[11px] font-semibold text-[#8a90a0]"
              title={`Handled by the module's own export route (${entry.delegateTo})`}
            >
              <ArrowUpRight size={11} strokeWidth={2.6} aria-hidden="true" />
              Module route
            </span>
          )}
        </h3>
        <p className="mt-0.5 text-[13.5px] leading-snug text-[#6b7280]">
          {entry.blurb}
        </p>
        <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#8a90a0]">
          {empty ? "No rows yet" : `${formatCount(rowCount)} rows`}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {entry.formats.length > 1 ? (
          <div className="flex items-center gap-2">
            <label
              htmlFor={selectId}
              className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#8a90a0]"
            >
              Format
            </label>
            <select
              id={selectId}
              value={format}
              onChange={(e) => setFormat(e.target.value as DataJobFormat)}
              className="nt-input w-[152px] py-2 text-[13px]"
            >
              {entry.formats.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="rounded-full border border-[#dcdce8] px-3 py-1.5 text-[12px] font-semibold text-[#8a90a0]">
            {FORMAT_LABEL[firstFormat]}
          </span>
        )}

        {empty ? (
          <span
            className="inline-flex items-center gap-2 rounded-chip border border-[#e5e7eb] px-5 py-2.5 text-[13px] font-bold text-[#a2a8b4]"
            aria-disabled="true"
          >
            <Download size={15} strokeWidth={2.4} aria-hidden="true" />
            Nothing to export
          </span>
        ) : (
          <a
            href={href}
            onClick={() => {
              if (csvOverCap) return;
              fireToast({
                message: `Preparing the ${entry.label} export.`,
                type: "info",
              });
            }}
            aria-disabled={csvOverCap || undefined}
            className={
              csvOverCap
                ? "pointer-events-none inline-flex items-center gap-2 rounded-chip border border-[#e5e7eb] px-5 py-2.5 text-[13px] font-bold text-[#a2a8b4]"
                : "inline-flex items-center gap-2 rounded-chip bg-[#3f3f94] px-5 py-2.5 text-[13px] font-extrabold text-white shadow-[0_6px_16px_rgba(63,63,148,0.28)] transition-all hover:-translate-y-px hover:bg-[#2f2f6f]"
            }
          >
            <Download size={15} strokeWidth={2.4} aria-hidden="true" />
            Export
          </a>
        )}
      </div>

      {csvOverCap && !empty && (
        <p
          role="status"
          className="flex w-full items-center gap-2 text-[12.5px] font-semibold"
          style={{ color: "var(--color-red-deep)" }}
        >
          <AlertTriangle size={14} strokeWidth={2.4} aria-hidden="true" />
          {formatCount(rowCount)} rows is past the {formatCount(csvRowCap)}-row
          CSV cap. Choose Excel instead.
        </p>
      )}
    </article>
  );
}
