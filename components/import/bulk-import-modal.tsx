"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X, FileSpreadsheet } from "lucide-react";
import { BulkUploadSheet } from "./bulk-upload-sheet";
import type { ImportSpec, Lookups, ImportRowPayload } from "@/lib/import/engine/spec";

type CommitFn = (
  rows: ImportRowPayload[],
) => Promise<{ created: number; skipped: number; duplicates?: number; newMasters: number; errors: { row: number; reason: string }[] }>;

/**
 * Bulk upload as a near-full-viewport modal holding an in-app spreadsheet.
 *
 * Opens straight into an editable sheet — no Excel round trip needed — with the
 * template download and file upload kept inside as assists. The modal is sized
 * to carry the widest spec (Items is 28 columns) and scrolls the grid, never
 * the page. Closing with typed rows asks for confirmation first.
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
  const dirtyRef = React.useRef(false);

  // Guard the close: a mis-click must not silently discard 200 pasted rows.
  function onOpenChange(next: boolean) {
    if (!next && dirtyRef.current) {
      const ok = window.confirm(
        "Discard the rows you've entered? They haven't been imported yet.",
      );
      if (!ok) return;
    }
    dirtyRef.current = false;
    setOpen(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
          className="bulk-content flex h-[92vh] w-[96vw] flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
          aria-describedby="bulk-desc"
        >
          {/* Header */}
          <div className="flex items-start gap-4 border-b border-[#eef0f3] px-7 py-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#1e2f66,#2b46b5)] text-white shadow-[0_6px_16px_rgba(43,70,181,0.30)]">
              <FileSpreadsheet className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[20px] font-extrabold tracking-tight text-[#1e2f66]">
                Bulk Import - {spec.title === "enquiry" ? "Enquiries" : `${spec.title}s`}
              </Dialog.Title>
              <Dialog.Description id="bulk-desc" className="mt-0.5 text-[13.5px] font-medium text-[#6b7280]">
                Type straight into the sheet or paste from Excel - flagged cells stay editable until they're right.
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

          {/* The sheet fills the rest of the dialog; only the grid scrolls. */}
          <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
            <BulkUploadSheet
              spec={spec}
              lookups={lookups}
              isAdmin={isAdmin}
              commit={commit}
              onDirtyChange={(d) => {
                dirtyRef.current = d;
              }}
              onDone={() => {
                dirtyRef.current = false;
                setOpen(false);
              }}
            />
          </div>
        </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
