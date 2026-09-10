"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Clock, Loader2, Paperclip, Upload, X } from "lucide-react";
import { uploadFileToServer } from "@/lib/storage/client-upload";
import {
  MAX_DOCUMENT_BYTES,
  safeDocumentName,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";
import {
  setSalesOrderPoConfirmation,
  getSalesOrderPoConfirmationLog,
} from "@/app/(app)/sales-orders/actions";
import type { SalesOrderPoConfirmationEntry } from "@/lib/queries/sales-orders";
import {
  SALES_ORDER_PO_CONFIRMATIONS,
  SALES_ORDER_PO_CONFIRMATION_LABELS,
  SALES_ORDER_PO_CONFIRMATION_COLORS,
  type SalesOrderPoConfirmationStatus,
} from "@/db/enums";
import { StatusPicker } from "@/components/inquiries/status-picker";
import { fireToast } from "@/lib/toast";

/** Confirmation-attachment blobs nest under the shared private `documents/` prefix. */
const PREFIX = "documents/so-po-confirmation/";

const TS_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/**
 * The register's "Customer PO Confirmation" cell — the current status as an
 * inline picker; choosing an option opens a popup for a note + optional
 * attachment (uploaded to private Blob), which appends to the append-only log
 * and updates the SO. A clock button opens that log. Setting "Revised SO" /
 * "Revised PO" lands the SO in the matching sidebar tab.
 */
export function SoPoConfirmationCell({
  salesOrderId,
  value,
}: {
  salesOrderId: string;
  value: SalesOrderPoConfirmationStatus;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<SalesOrderPoConfirmationStatus | null>(null);
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [log, setLog] = React.useState<SalesOrderPoConfirmationEntry[] | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // Portal the overlays to <body> so their clicks never bubble to the register
  // row's onClick/onDoubleClick (which would navigate to the SO detail page).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  function closeModal() {
    if (busy) return;
    setSelected(null);
    setNotes("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!selected) return;
    // Precheck the file BEFORE we mark busy, so a bad file just re-prompts.
    if (file) {
      if (file.size === 0) return fireToast({ message: "Pick a file." });
      if (file.size > MAX_DOCUMENT_BYTES) return fireToast({ message: "File exceeds 25 MB." });
      const shape = validateDocumentFileShape({ name: file.name, contentType: file.type });
      if (!shape.ok) return fireToast({ message: shape.error });
    }
    setBusy(true);
    try {
      let attachmentPath: string | undefined;
      let attachmentName: string | undefined;
      if (file) {
        const blob = await uploadFileToServer(
          "/api/documents/upload",
          `${PREFIX}${salesOrderId}/${safeDocumentName(file.name)}`,
          file,
          { access: "private" },
        );
        attachmentPath = blob.pathname;
        attachmentName = file.name;
      }
      const res = await setSalesOrderPoConfirmation({
        salesOrderId,
        status: selected,
        notes: notes.trim() || undefined,
        attachmentPath,
        attachmentName,
      });
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({
        type: "success",
        message: `Set to ${SALES_ORDER_PO_CONFIRMATION_LABELS[selected]}.`,
      });
      setSelected(null);
      setNotes("");
      setFile(null);
      setLog(null); // history is now stale
      router.refresh();
    } catch (err) {
      fireToast({
        type: "error",
        message: err instanceof Error ? err.message : "Could not save the confirmation.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    if (log === null) {
      try {
        setLog(await getSalesOrderPoConfirmationLog(salesOrderId));
      } catch {
        setLog([]);
      }
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <StatusPicker
        value={value}
        options={SALES_ORDER_PO_CONFIRMATIONS}
        labels={SALES_ORDER_PO_CONFIRMATION_LABELS}
        tones={SALES_ORDER_PO_CONFIRMATION_COLORS}
        // Never a plain flip: every pick opens the note/attachment popup, which
        // is what actually writes the change (via setSalesOrderPoConfirmation).
        onPick={() => Promise.resolve({ ok: true })}
        interceptPick={(next) => {
          setSelected(next);
          return true;
        }}
        ariaLabel="Customer PO Confirmation"
      />
      <button
        type="button"
        onClick={() => void openHistory()}
        title="Confirmation history"
        aria-label="Confirmation history"
        className="shrink-0 rounded-md p-1 text-ink-subtle transition hover:bg-surface-soft hover:text-ink-strong"
      >
        <Clock size={14} strokeWidth={2.2} />
      </button>

      {/* Add-confirmation popup (portaled to body) */}
      {selected && mounted && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 px-4 py-[8vh]"
          onClick={closeModal}
        >
          <div
            className="w-[min(520px,100%)] overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">
                  Customer PO Confirmation
                </p>
                <h3 className="mt-0.5 text-[16px] font-extrabold text-ink-strong">
                  {SALES_ORDER_PO_CONFIRMATION_LABELS[selected]}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Cancel"
                className="shrink-0 rounded-lg p-1.5 text-ink-subtle transition hover:bg-surface-soft hover:text-ink-strong"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              <label
                htmlFor="so-poc-notes"
                className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-subtle"
              >
                Notes
              </label>
              <textarea
                id="so-poc-notes"
                autoFocus
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What was confirmed / discussed…"
                className="nt-input resize-y"
                style={{ fontWeight: 400 }}
              />
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-hairline-strong bg-surface-soft px-4 py-3">
                <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
                  <Paperclip size={14} className="text-ink-subtle" />
                  {file ? file.name : "Attach a file (screenshot / revised PO / SO — optional, max 25 MB)"}
                </span>
                <label
                  className={`ml-auto inline-flex cursor-pointer items-center gap-2 rounded-pill border border-hairline bg-surface-card px-3.5 py-1.5 text-[13px] font-bold text-ink-strong transition-colors hover:border-hairline-strong ${
                    busy ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <Upload size={14} strokeWidth={2.4} />
                  {file ? "Replace" : "Attach"}
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,application/pdf"
                    disabled={busy}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-hairline bg-surface-soft px-5 py-3.5">
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="text-[13px] font-extrabold text-ink-soft disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-pill px-5 py-2 text-[13px] font-extrabold text-white transition-opacity disabled:opacity-50"
                style={{ background: "#454595" }}
              >
                {busy && <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} />}
                {busy ? "Saving…" : "Save confirmation"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* History popup (portaled to body) */}
      {historyOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 px-4 py-[8vh]"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="w-[min(560px,100%)] overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
              <h3 className="text-[15px] font-extrabold text-ink-strong">
                Customer PO Confirmation — history
              </h3>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-subtle transition hover:bg-surface-soft hover:text-ink-strong"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {log === null ? (
                <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
                  <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
                  Loading…
                </p>
              ) : log.length === 0 ? (
                <p className="text-[13px] text-ink-soft">No confirmations logged yet.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {log.map((e) => {
                    const tone = SALES_ORDER_PO_CONFIRMATION_COLORS[e.status] ?? "slate";
                    return (
                      <li key={e.id} className="rounded-xl border border-hairline bg-surface-soft px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className="inline-flex items-center rounded-pill px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.04em]"
                            style={{
                              background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
                              color: `var(--color-${tone}-deep)`,
                              border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
                            }}
                          >
                            {SALES_ORDER_PO_CONFIRMATION_LABELS[e.status]}
                          </span>
                          <span className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">
                            {e.authorName ?? "Unknown"} · {TS_FMT.format(new Date(e.createdAt))}
                          </span>
                        </div>
                        {e.notes && (
                          <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-ink-strong">{e.notes}</p>
                        )}
                        {(e.attachmentUrl || e.attachmentName) && (
                          <div className="mt-1.5">
                            {e.attachmentUrl ? (
                              <a
                                href={e.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-brand hover:underline"
                              >
                                <Paperclip size={12} strokeWidth={2.4} />
                                {e.attachmentName ?? "Attachment"}
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-subtle">
                                <Paperclip size={12} strokeWidth={2.4} />
                                {e.attachmentName}
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
