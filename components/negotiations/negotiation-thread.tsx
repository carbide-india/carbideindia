"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, MessageSquare, X } from "lucide-react";
import {
  NEGOTIATION_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
} from "@/db/enums";
import {
  addNegotiationRemark,
  listNegotiationRemarks,
  type NegotiationRemarkEntry,
} from "@/app/(app)/negotiations/board-actions";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * The negotiation remark thread — "new remarks will keep coming on top of old
 * remarks" (Hetesh, 2026-08-13).
 *
 * Newest first, and that is not a sort preference: this is a record of a
 * conversation that is still happening, so the thing you need is the last thing
 * said, not the first. Chronological order would make you scroll past a year of
 * history to find out where the deal stands today.
 *
 * Nothing here can be edited or deleted, and the panel says so rather than
 * leaving people to discover it. The database enforces it (migration 0078's
 * append-only trigger); the line at the bottom is just honesty about what
 * writing here commits you to.
 *
 * Entries that accompanied a MOVE show the transition they carried. That is the
 * difference between "we called them" and "we called them and lost the order",
 * and it is the whole reason a move demands a remark in the first place.
 */

export function NegotiationThreadPanel({
  negotiationId,
  title,
  subtitle,
  onClose,
}: {
  negotiationId: string;
  /** SM number or negotiation number — how people refer to this deal. */
  title: string;
  subtitle?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [entries, setEntries] = React.useState<NegotiationRemarkEntry[] | null>(null);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const rows = await listNegotiationRemarks(negotiationId);
    setEntries(rows);
  }, [negotiationId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function submit() {
    if (draft.trim().length < 3) return;
    setSaving(true);
    try {
      const res = await addNegotiationRemark({ negotiationId, remark: draft });
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      setDraft("");
      await load();
      // The ageing clock moved, so the board behind this panel is now stale.
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex justify-end bg-black/35"
      onClick={() => !saving && onClose()}
    >
      <aside
        className="flex h-full w-[min(94vw,440px)] flex-col bg-white shadow-[-16px_0_50px_rgba(15,23,42,0.22)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
              Negotiation Remarks
            </p>
            <h2 className="mt-0.5 truncate text-[16px] font-black tracking-tight text-ink-strong">
              {title}
            </h2>
            {subtitle && (
              <p className="truncate text-[12.5px] font-semibold text-ink-soft">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close remarks"
            className="shrink-0 rounded-lg p-1.5 text-ink-subtle transition hover:bg-[#f1f2f6] hover:text-ink-strong"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {entries === null ? (
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
              <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
              Loading the thread…
            </p>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d6d8de] px-4 py-6 text-center">
              <MessageSquare
                size={20}
                strokeWidth={2}
                className="mx-auto mb-2 text-[#c6cbdd]"
              />
              <p className="text-[13px] font-bold text-ink-strong">Nothing said yet.</p>
              <p className="mt-0.5 text-[12px] font-medium text-ink-soft">
                Every move on the board adds one. Write the first below.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {entries.map((e, i) => (
                <ThreadEntry key={e.id} entry={e} newest={i === 0} />
              ))}
            </ol>
          )}
        </div>

        <div className="border-t border-hairline bg-[#f9fafc] px-5 py-4">
          <textarea
            rows={3}
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            placeholder="Called the buyer — waiting on their technical team."
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-subtle">
              <Lock size={11} strokeWidth={2.6} />
              Once saved, it cannot be edited or removed.
            </p>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || draft.trim().length < 3}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-pill px-4 text-[13px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: "#454595" }}
            >
              {saving && (
                <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} />
              )}
              {saving ? "Saving…" : "Add remark"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ThreadEntry({
  entry,
  newest,
}: {
  entry: NegotiationRemarkEntry;
  /** The top of the thread — the current state of the conversation. */
  newest: boolean;
}) {
  const moved = entry.fromStatus !== null && entry.fromStatus !== entry.status;
  return (
    <li
      className={cn(
        "rounded-xl border px-3.5 py-3",
        newest ? "border-[#c9cbe0] bg-[#f7f7fd]" : "border-hairline bg-white",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {moved ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-black uppercase tracking-[0.08em]">
            <span className="text-ink-subtle">
              {NEGOTIATION_STATUS_LABELS[entry.fromStatus!]}
            </span>
            <ArrowRight size={10} strokeWidth={3} className="text-ink-subtle" />
            <span
              style={{ color: `var(--color-${NEGOTIATION_STATUS_COLORS[entry.status]}-deep)` }}
            >
              {NEGOTIATION_STATUS_LABELS[entry.status]}
            </span>
          </span>
        ) : (
          <span className="text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-subtle">
            Note · {NEGOTIATION_STATUS_LABELS[entry.status]}
          </span>
        )}
      </div>

      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-strong">
        {entry.body}
      </p>

      <p className="mt-1.5 text-[11px] font-semibold text-ink-subtle">
        {entry.authorName ?? "Unknown"} ·{" "}
        {new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(entry.createdAt))}
      </p>
    </li>
  );
}
