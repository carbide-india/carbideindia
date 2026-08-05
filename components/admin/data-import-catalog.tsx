"use client";

import * as React from "react";
import { ChevronDown, Download, FileSpreadsheet, KeyRound, Link2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { buildTemplateWorkbook } from "@/lib/import/engine/template";
import { BulkImportModal } from "@/components/import/bulk-import-modal";
import { logTemplateDownload } from "@/app/(admin)/admin/data/actions";
import {
  fieldHint,
  fieldTypeLabel,
  REF_KIND_LABELS,
  summariseSpec,
  type ImportCatalogEntry,
} from "@/lib/data-transfer/catalog";
import type {
  ImportRowPayload,
  ImportSpec,
  Lookups,
} from "@/lib/import/engine/spec";

type CommitFn = (rows: ImportRowPayload[]) => Promise<{
  created: number;
  skipped: number;
  duplicates?: number;
  newMasters: number;
  errors: { row: number; reason: string }[];
}>;

export interface ImportCatalogItem extends ImportCatalogEntry {
  /** Server action that runs the module's own commit and logs the run. */
  commit: CommitFn;
}

interface Props {
  items: ImportCatalogItem[];
  /** Reference option lists for every kind any spec in the catalogue uses. */
  lookups: Lookups;
}

const STAGE_ORDER = ["Masters", "Sales pipeline"] as const;

const STAGE_BLURB: Record<(typeof STAGE_ORDER)[number], string> = {
  Masters:
    "Load these first - the pipeline sheets resolve their Client and Item columns against them.",
  "Sales pipeline":
    "Each row attaches to an existing SM number (or allocates one, for enquiries).",
};

/**
 * The importable half of the hub. Every card is driven by the SAME ImportSpec
 * the module's own Bulk Upload button uses, and the Import action opens that
 * exact BulkImportModal - this page adds the spec reference and the transfer
 * log, never a second importer.
 */
export function DataImportCatalog({ items, lookups }: Props) {
  if (items.length === 0) {
    return <EmptyCatalog />;
  }

  return (
    <div className="flex flex-col gap-10">
      {STAGE_ORDER.map((stage) => {
        const group = items.filter((i) => i.stage === stage);
        if (group.length === 0) return null;
        return (
          <section key={stage} aria-labelledby={`import-stage-${stage}`}>
            <h2
              id={`import-stage-${stage}`}
              className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#6b7280]"
            >
              {stage}
            </h2>
            <p className="mt-1 mb-4 text-[13.5px] text-[#8a90a0]">
              {STAGE_BLURB[stage]}
            </p>
            <div className="flex flex-col gap-3">
              {group.map((item) => (
                <ImportCard key={item.key} item={item} lookups={lookups} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmptyCatalog() {
  return (
    <div
      className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <p
        className="font-serif text-ink-strong"
        style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
      >
        No importable entities configured
      </p>
      <p className="mt-2 mx-auto max-w-sm text-[14px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
        Import specs live in <code>lib/import/specs</code>. Add one there and it
        appears here automatically.
      </p>
    </div>
  );
}

function ImportCard({
  item,
  lookups,
}: {
  item: ImportCatalogItem;
  lookups: Lookups;
}) {
  const [open, setOpen] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const summary = React.useMemo(() => summariseSpec(item.spec), [item.spec]);
  const panelId = `import-spec-${item.key}`;

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const buf = buildTemplateWorkbook(item.spec, lookups);
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.spec.formKey}-import-template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      const res = await logTemplateDownload(item.key);
      fireToast({
        message: res.ok
          ? `${item.plural} template downloaded.`
          : res.error,
        type: res.ok ? "success" : "error",
      });
    } catch (err) {
      fireToast({
        message:
          err instanceof Error
            ? `Template failed: ${err.message}`
            : "Could not build that template.",
        type: "error",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article
      className="rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="flex flex-wrap items-start gap-4 px-5 py-4">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
          style={{
            background: "linear-gradient(135deg, #3f3f94, #2f2f6f)",
            boxShadow: "0 6px 16px rgba(63,63,148,0.26)",
          }}
          aria-hidden="true"
        >
          <FileSpreadsheet className="h-5 w-5" strokeWidth={2.1} />
        </span>

        <div className="min-w-[240px] flex-1">
          <h3 className="text-[16px] font-extrabold tracking-tight text-[#1e2f66]">
            {item.plural}
          </h3>
          <p className="mt-1 text-[13.5px] leading-snug text-[#6b7280]">
            {item.blurb}
          </p>
          <p className="mt-2 text-[12.5px] font-semibold tabular-nums text-[#8a90a0]">
            {summary.columnCount} columns ·{" "}
            {summary.requiredHeaders.length === 0
              ? "no required column"
              : `${summary.requiredHeaders.length} required`}{" "}
            · {summary.refKinds.length} lookup
            {summary.refKinds.length === 1 ? "" : "s"}
            {summary.createsMasters ? " · can create masters" : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-chip border border-[#dcdce8] px-4 py-2.5 text-[13px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#efeffb] disabled:opacity-50"
          >
            <Download size={15} strokeWidth={2.4} />
            {downloading ? "Preparing" : "Template"}
          </button>
          <BulkImportModal
            spec={item.spec}
            lookups={lookups}
            commit={item.commit}
            isAdmin
            triggerClassName="inline-flex items-center gap-2 rounded-chip bg-[#3f3f94] px-5 py-2.5 text-[13px] font-extrabold text-white shadow-[0_6px_16px_rgba(63,63,148,0.28)] transition-all hover:-translate-y-px hover:bg-[#2f2f6f]"
          />
        </div>
      </div>

      <div className="border-t border-hairline">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-[13px] font-bold text-[#6b7280] transition hover:bg-surface-soft hover:text-[#1e2f66]"
        >
          <span>
            {open ? "Hide" : "Show"} the {summary.columnCount}-column sheet spec
          </span>
          <ChevronDown
            size={16}
            strokeWidth={2.4}
            className="transition-transform"
            style={{ transform: open ? "rotate(180deg)" : undefined }}
            aria-hidden="true"
          />
        </button>

        <div id={panelId} hidden={!open}>
          <SpecTable spec={item.spec} lookups={lookups} />
        </div>
      </div>
    </article>
  );
}

function SpecTable({ spec, lookups }: { spec: ImportSpec; lookups: Lookups }) {
  const summary = summariseSpec(spec);

  return (
    <div className="border-t border-hairline">
      {summary.refKinds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-surface-soft px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.09em] text-[#8a90a0]">
            <Link2 size={13} strokeWidth={2.4} aria-hidden="true" />
            Resolves against
          </span>
          {summary.refKinds.map((kind) => (
            <span
              key={kind}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dcdce8] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#3f3f94] tabular-nums"
            >
              {REF_KIND_LABELS[kind]}
              <span className="text-[#a2a8b4]">
                {(lookups[kind] ?? []).length}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <caption className="sr-only">
            Column specification for the {spec.title} import sheet
          </caption>
          <thead>
            <tr className="border-b border-hairline bg-surface-soft text-left text-[11.5px] uppercase tracking-[0.08em] text-ink-subtle">
              <th scope="col" className="px-5 py-2.5 font-bold">Column</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Type</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Accepts</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Example</th>
            </tr>
          </thead>
          <tbody>
            {spec.fields.map((f, i) => (
              <tr
                key={f.key}
                className="border-b border-hairline last:border-0"
                style={{
                  background: i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
                }}
              >
                <th
                  scope="row"
                  className="px-5 py-2 text-left font-semibold text-ink-strong"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {f.header}
                    {f.required && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]"
                        style={{
                          background: "var(--color-red-bg)",
                          color: "var(--color-red-deep)",
                        }}
                      >
                        <KeyRound size={10} strokeWidth={2.6} aria-hidden="true" />
                        Required
                      </span>
                    )}
                  </span>
                </th>
                <td className="px-3 py-2 whitespace-nowrap text-ink-soft">
                  {fieldTypeLabel(f)}
                </td>
                <td className="px-3 py-2 text-ink-subtle">{fieldHint(f) || "—"}</td>
                <td className="px-3 py-2 text-ink-subtle">{f.example ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
