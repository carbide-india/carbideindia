"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Upload, X, FileSpreadsheet, Download, PencilLine, UploadCloud } from "lucide-react";
import { ImportWorkbench } from "./import-workbench";
import type { ImportSpec, Lookups, ImportRowPayload } from "@/lib/import/engine/spec";

type CommitFn = (
  rows: ImportRowPayload[],
) => Promise<{ created: number; skipped: number; newMasters: number; errors: { row: number; reason: string }[] }>;

const STEPS = [
  { Icon: Download, label: "Download template", hint: "Pre-formatted .xlsx with dropdowns" },
  { Icon: PencilLine, label: "Fill in Excel", hint: "One enquiry per row" },
  { Icon: UploadCloud, label: "Upload & import", hint: "Fix flagged cells, then import" },
];

/**
 * Bulk-import as an animated modal (replaces the standalone /import page).
 * Wraps the proven ImportWorkbench — template download, parse, inline fix,
 * commit — and closes + refreshes on success via ImportWorkbench's onDone.
 */
export function BulkImportModal({
  spec,
  lookups,
  commit,
  isAdmin,
  triggerClassName,
}: {
  spec: ImportSpec;
  lookups: Lookups;
  commit: CommitFn;
  isAdmin: boolean;
  /** Override the trigger button's styling (e.g. a full-width sidebar item). */
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={
            triggerClassName ??
            "inline-flex items-center gap-2 rounded-lg border border-[#d5d8de] bg-white px-4 py-2.5 text-[13px] font-bold text-[#1e2f66] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2b46b5] hover:text-[#2b46b5] hover:shadow-[0_4px_12px_rgba(30,47,102,0.10)]"
          }
        >
          <Upload size={15} strokeWidth={2.4} />
          Bulk Upload
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @keyframes bulkFade { from { opacity: 0 } to { opacity: 1 } }
          @keyframes bulkPop { from { opacity: 0; transform: translateY(8px) scale(.96) } to { opacity: 1; transform: none } }
          @keyframes bulkStep { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
          .bulk-overlay { animation: bulkFade .2s ease both; }
          .bulk-content { animation: bulkPop .3s cubic-bezier(.22,.61,.36,1) both; }
          .bulk-step { animation: bulkStep .4s cubic-bezier(.22,.61,.36,1) both; }
          @media (prefers-reduced-motion: reduce) {
            .bulk-overlay, .bulk-content, .bulk-step { animation: none; }
          }
        `,
          }}
        />
        <Dialog.Overlay className="bulk-overlay fixed inset-0 z-[60] bg-[#0f172a]/45 backdrop-blur-[2px]" />
        <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <Dialog.Content
          className="bulk-content flex max-h-[88vh] w-[min(920px,94vw)] flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
          aria-describedby="bulk-desc"
        >
          {/* Header */}
          <div className="flex items-start gap-4 border-b border-[#eef0f3] px-7 py-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#1e2f66,#2b46b5)] text-white shadow-[0_6px_16px_rgba(43,70,181,0.30)]">
              <FileSpreadsheet className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[20px] font-extrabold tracking-tight text-[#1e2f66]">
                Bulk Import — {spec.title === "enquiry" ? "Enquiries" : `${spec.title}s`}
              </Dialog.Title>
              <Dialog.Description id="bulk-desc" className="mt-0.5 text-[13.5px] font-medium text-[#6b7280]">
                Download the template, fill it in Excel, upload, fix any flagged cells, then import — all here.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#9aa0ab] transition hover:bg-[#f3f4f6] hover:text-[#1e2f66]"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Step strip */}
          <div className="grid grid-cols-1 gap-3 border-b border-[#eef0f3] bg-[#fafbfc] px-7 py-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.label}
                className="bulk-step flex items-center gap-3 rounded-xl border border-[#eceef2] bg-white px-3.5 py-2.5"
                style={{ animationDelay: `${0.08 + i * 0.08}s` }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef1fb] text-[#2b46b5]">
                  <s.Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-[#1e2f66]">
                    <span className="mr-1 text-[#9aa0ab]">{i + 1}.</span>
                    {s.label}
                  </div>
                  <div className="truncate text-[11.5px] font-medium text-[#8a90a0]">{s.hint}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Workbench (scrollable) */}
          <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
            <ImportWorkbench
              spec={spec}
              lookups={lookups}
              isAdmin={isAdmin}
              commit={commit}
              onDone={() => setOpen(false)}
            />
          </div>
        </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
