"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  MessageSquare,
  Paperclip,
  Upload,
  X,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  addNegotiationLogEntry,
  listNegotiationLog,
  type NegotiationLogEntry,
} from "@/app/(app)/negotiations/board-actions";
import {
  MAX_DOCUMENT_BYTES,
  safeDocumentName,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";
import {
  NEGOTIATION_LOG_TYPES,
  NEGOTIATION_LOG_TYPE_LABELS,
  NEGOTIATION_STATUS_LABELS,
  negotiationLogTypeAllowsAttachment,
  type NegotiationLogType,
} from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { SectionCard } from "@/components/inquiries/form-field";

/** Log-attachment blobs nest under the shared private `documents/` prefix. */
const LOG_PREFIX = "documents/negotiation-log/";

/** Per-type chip palette (fixed hex so it reads the same in both themes). */
const TONE: Record<
  "slate" | "blue" | "green" | "amber",
  { fg: string; bg: string; bd: string }
> = {
  slate: { fg: "#565a72", bg: "#eef0f6", bd: "#d3d5e2" },
  blue: { fg: "#2563eb", bg: "#e8f0fe", bd: "#bcd0fb" },
  green: { fg: "#15803d", bg: "#e7f6ec", bd: "#b6e2c4" },
  amber: { fg: "#b45309", bg: "#fef3c7", bd: "#f2d891" },
};
const TYPE_TONE: Record<NegotiationLogType, keyof typeof TONE> = {
  note: "slate",
  email_confirmation: "blue",
  whatsapp_confirmation: "green",
  verbal_confirmation: "amber",
};
/** The composer dropdown reads "General note" for the plain type; the chip stays "Note". */
const OPTION_LABEL: Record<NegotiationLogType, string> = {
  ...NEGOTIATION_LOG_TYPE_LABELS,
  note: "General note",
};

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "";
  return (first + last).toUpperCase();
}

const TS_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
function fmtTs(d: Date): string {
  // "08/09/2026, 10:15 am" → "08-09-2026 · 10:15 AM"
  return TS_FMT.format(new Date(d))
    .replace(/\//g, "-")
    .replace(", ", " · ")
    .toUpperCase()
    .replace("· ", "· "); // keep the middot spacing tidy
}

function precheckFile(file: File): string | null {
  if (file.size === 0) return "Pick a file.";
  if (file.size > MAX_DOCUMENT_BYTES) return "File exceeds 25 MB.";
  const shape = validateDocumentFileShape({ name: file.name, contentType: file.type });
  return shape.ok ? null : shape.error;
}

/** A single log entry's type chip. */
function TypeChip({ entry }: { entry: NegotiationLogEntry }) {
  if (entry.entryType) {
    const tone = TONE[TYPE_TONE[entry.entryType]];
    return (
      <span
        className="inline-flex items-center rounded-pill px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.04em]"
        style={{ color: tone.fg, background: tone.bg, border: `1px solid ${tone.bd}` }}
      >
        {NEGOTIATION_LOG_TYPE_LABELS[entry.entryType]}
      </span>
    );
  }
  // Legacy / board-move remark — show the transition it carried, else a note tag.
  const moved = entry.fromStatus !== null && entry.fromStatus !== entry.status;
  if (moved) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-ink-subtle">
        {NEGOTIATION_STATUS_LABELS[entry.fromStatus!]}
        <ArrowRight size={10} strokeWidth={3} />
        {NEGOTIATION_STATUS_LABELS[entry.status]}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-pill px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.04em]"
      style={{ color: TONE.slate.fg, background: TONE.slate.bg, border: `1px solid ${TONE.slate.bd}` }}
    >
      Note
    </span>
  );
}

function LogEntryRow({ entry }: { entry: NegotiationLogEntry }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white"
        style={{ background: "#454595" }}
      >
        {initials(entry.authorName)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13px] font-extrabold text-ink-strong">
            {entry.authorName ?? "Unknown"}
          </span>
          <TypeChip entry={entry} />
          <span className="tabular-nums text-[11px] font-semibold text-ink-subtle">
            {fmtTs(entry.createdAt)}
          </span>
        </div>
        <div className="mt-1 rounded-[4px_12px_12px_12px] border border-hairline bg-surface-soft px-3 py-2 text-[13.5px] leading-relaxed text-ink-strong whitespace-pre-wrap">
          {entry.body}
          {(entry.attachmentUrl || entry.attachmentName) && (
            <div className="mt-2">
              {entry.attachmentUrl ? (
                <a
                  href={entry.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-hairline-strong bg-surface-card px-2.5 py-1 text-[12px] font-bold text-brand hover:border-brand"
                >
                  <Paperclip size={12} strokeWidth={2.4} />
                  {entry.attachmentName ?? "Attachment"}
                </a>
              ) : (
                <span
                  title="Attachment link unavailable — reload the page to retry"
                  aria-label={`${entry.attachmentName} — link temporarily unavailable`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-hairline-strong bg-surface-card px-2.5 py-1 text-[12px] font-bold text-ink-subtle opacity-70"
                >
                  <Paperclip size={12} strokeWidth={2.4} />
                  {entry.attachmentName}
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    · link unavailable
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The negotiation LOG — a timestamped, chat-style thread replacing the old
 * single Negotiation Notes box and the separate remarks panel. Entries read
 * oldest → newest (newest at the bottom, where a new one lands). A "Log
 * confirmation / note" dropdown opens a popup to add a plain note or a customer
 * confirmation by channel (Email / WhatsApp / Verbal); Email and WhatsApp allow
 * an evidence attachment, Verbal never does. Everything is append-only.
 */
export function NegotiationLog({ negotiationId }: { negotiationId: string }) {
  const router = useRouter();
  const [entries, setEntries] = React.useState<NegotiationLogEntry[] | null>(null);
  const [modalType, setModalType] = React.useState<NegotiationLogType | null>(null);
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLLIElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  // The composer <select> is the trigger — the popup opens programmatically (no
  // Dialog.Trigger), so Radix can't auto-restore focus to it on close. We do it
  // ourselves via onCloseAutoFocus.
  const selectRef = React.useRef<HTMLSelectElement>(null);

  const load = React.useCallback(async () => {
    const rows = await listNegotiationLog(negotiationId);
    setEntries(rows);
  }, [negotiationId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function openModal(type: NegotiationLogType) {
    setModalType(type);
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function closeModal() {
    if (busy) return;
    setModalType(null);
    setText("");
    setFile(null);
  }

  const allowsAttachment =
    modalType != null && negotiationLogTypeAllowsAttachment(modalType);

  async function submit() {
    if (!modalType) return;
    const body = text.trim();
    if (!body) {
      fireToast({ message: "Write a note." });
      return;
    }
    setBusy(true);
    try {
      let attachmentPath: string | undefined;
      let attachmentName: string | undefined;
      if (file && allowsAttachment) {
        const bad = precheckFile(file);
        if (bad) {
          fireToast({ message: bad });
          return;
        }
        const contentType = file.type || "application/octet-stream";
        const blob = await upload(
          `${LOG_PREFIX}${negotiationId}/${safeDocumentName(file.name)}`,
          file,
          {
            access: "private",
            handleUploadUrl: "/api/documents/upload",
            contentType,
            clientPayload: JSON.stringify({ contentType }),
          },
        );
        attachmentPath = blob.pathname;
        attachmentName = file.name;
      }
      const res = await addNegotiationLogEntry({
        negotiationId,
        entryType: modalType,
        body,
        attachmentPath,
        attachmentName,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setModalType(null);
      setText("");
      setFile(null);
      await load();
      router.refresh();
      requestAnimationFrame(() =>
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    } catch (err) {
      fireToast({
        message: err instanceof Error ? err.message : "Could not add to the log.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Negotiation Log"
      hint="Every note is timestamped and kept in order — nothing here can be edited or removed. Log a customer confirmation from the dropdown, or add a plain note."
    >
      <div className="flex flex-col gap-4">
        {entries === null ? (
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
            <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
            Loading the log…
          </p>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline-strong px-4 py-6 text-center">
            <MessageSquare size={20} strokeWidth={2} className="mx-auto mb-2 text-ink-subtle" />
            <p className="text-[13px] font-bold text-ink-strong">Nothing logged yet.</p>
            <p className="mt-0.5 text-[12px] font-medium text-ink-soft">
              Add the first note or log a customer confirmation below.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3.5">
            {entries.map((e) => (
              <LogEntryRow key={e.id} entry={e} />
            ))}
            <li ref={endRef} aria-hidden className="h-0" />
          </ol>
        )}

        {/* Composer — a type dropdown that opens the Add-note popup. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-hairline-strong pt-4">
          <select
            ref={selectRef}
            aria-label="Log a confirmation or note"
            value=""
            onChange={(e) => {
              const t = e.target.value as NegotiationLogType | "";
              if (t) openModal(t);
            }}
            className="nt-input max-w-[280px] cursor-pointer font-bold"
          >
            <option value="">＋ Log confirmation / note…</option>
            {NEGOTIATION_LOG_TYPES.map((t) => (
              <option key={t} value={t}>
                {OPTION_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="text-[12px] font-semibold text-ink-subtle">
            Picking a type opens the “Add note” popup.
          </span>
        </div>
      </div>

      {/* Add-note popup — Radix Dialog gives focus-trap, aria-modal, Escape,
          scroll-lock and focus restoration to the composer for free. */}
      <Dialog.Root
        open={modalType !== null}
        onOpenChange={(o) => {
          // Only allow closing (never a spurious open); block while a save/upload
          // is in flight so a stray Escape can't abandon the request.
          if (!o) closeModal();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/45" />
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              textareaRef.current?.focus();
            }}
            onCloseAutoFocus={(e) => {
              // Radix's modal default focuses a (here non-existent) trigger and
              // suppresses the fallback, so restore focus to the composer select.
              e.preventDefault();
              selectRef.current?.focus();
            }}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (busy) e.preventDefault();
            }}
            className="fixed left-1/2 top-[8vh] z-[130] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">
                  Add to negotiation log
                </p>
                <Dialog.Title className="mt-0.5 flex items-center gap-2 text-[16px] font-extrabold text-ink-strong">
                  {modalType === "note"
                    ? "Add Note"
                    : modalType
                      ? `Log ${NEGOTIATION_LOG_TYPE_LABELS[modalType]}`
                      : ""}
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Cancel"
                  className="shrink-0 rounded-lg p-1.5 text-ink-subtle transition hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              <label
                htmlFor="log-note-text"
                className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-subtle"
              >
                Note
              </label>
              <textarea
                id="log-note-text"
                ref={textareaRef}
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What was confirmed / discussed…"
                className="nt-input resize-y"
                style={{ fontWeight: 400 }}
              />

              {allowsAttachment ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-hairline-strong bg-surface-soft px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
                    <Paperclip size={14} className="text-ink-subtle" />
                    {file ? file.name : "Attach a screenshot / PO (optional, max 25 MB)"}
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
              ) : (
                <div className="rounded-xl border border-[#f2d891] bg-[#fef3c7] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#b45309]">
                  Verbal confirmation — no attachment allowed. Just record what was
                  said.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-hairline bg-surface-soft px-5 py-3.5">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="text-[13px] font-extrabold text-ink-soft disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !text.trim()}
                className="inline-flex items-center gap-2 rounded-pill px-5 py-2 text-[13px] font-extrabold text-white transition-opacity disabled:opacity-50"
                style={{ background: "#454595" }}
              >
                {busy && <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} />}
                {busy ? "Adding…" : "Add to log"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </SectionCard>
  );
}
