"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  LOST_REASONS,
  LOST_REASON_LABELS,
  NEGOTIATION_STAGE_BUCKETS,
  NEGOTIATION_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
  type LostReason,
} from "@/db/enums";
import { moveNegotiation } from "@/app/(app)/negotiations/board-actions";
import { fireToast } from "@/lib/toast";
import type { NegotiationBoardCard } from "@/lib/queries/negotiation-board";

/** A column of the Negotiation board — one of the seven commercial states. */
export type BoardColumn = (typeof NEGOTIATION_STAGE_BUCKETS)[number];

/**
 * The move dialog. A drop never writes straight through: the remark is
 * compulsory, and Lost also demands a reason from the fixed list.
 */
export function MoveDialog({
  card,
  target,
  onClose,
  onDone,
}: {
  card: NegotiationBoardCard;
  target: BoardColumn;
  onClose: () => void;
  onDone: () => void;
}) {
  const [remark, setRemark] = React.useState("");
  const [lostReason, setLostReason] = React.useState<LostReason | "">("");
  const [lostRemarks, setLostRemarks] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const isLost = target === "order_lost";
  const blocked =
    remark.trim().length < 3 ||
    (isLost && lostReason === "") ||
    (isLost && lostReason === "others" && lostRemarks.trim().length < 3);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  async function submit() {
    setPending(true);
    try {
      const res = await moveNegotiation({
        negotiationId: card.id,
        status: target,
        remark,
        ...(isLost && lostReason !== "" ? { lostReason } : {}),
        ...(isLost && lostRemarks.trim() ? { lostReasonRemarks: lostRemarks } : {}),
      });
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({
        message: `${card.smNumber ?? card.negotiationNo} moved to ${NEGOTIATION_STATUS_LABELS[target]}.`,
      });
      onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 p-4 sm:p-10"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-[min(94vw,520px)] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-hairline px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-subtle">
            {NEGOTIATION_STATUS_LABELS[card.negotiationStatus]} →{" "}
            <span style={{ color: `var(--color-${NEGOTIATION_STATUS_COLORS[target]}-deep)` }}>
              {NEGOTIATION_STATUS_LABELS[target]}
            </span>
          </p>
          <h2 className="mt-1 text-[16px] font-black tracking-tight text-ink-strong">
            {card.smNumber ?? card.negotiationNo} · {card.companyName ?? "—"}
          </h2>
        </div>

        <div className="flex flex-col gap-3 p-5">
          {isLost && (
            <>
              <label className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                Lost Reason
              </label>
              <select
                autoFocus
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value as LostReason | "")}
                className="nt-input"
              >
                <option value="">Pick a reason…</option>
                {LOST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {LOST_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                value={lostRemarks}
                onChange={(e) => setLostRemarks(e.target.value)}
                placeholder={
                  lostReason === "others"
                    ? "Say what the other reason was (required)"
                    : "Lost reason remarks (optional)"
                }
                className="nt-input resize-y"
                style={{ fontWeight: 400 }}
              />
            </>
          )}

          <label className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
            Negotiation remark (required)
          </label>
          <textarea
            autoFocus={!isLost}
            rows={4}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="What was said? This is added to the thread and cannot be edited later."
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
          />
          <p className="text-[11.5px] font-semibold text-ink-subtle">
            Remarks stack newest-first on the card. Nothing already written is ever
            changed or removed.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline bg-[#f9fafc] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-9 rounded-pill px-4 text-[13px] font-bold text-ink-soft hover:text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || blocked}
            className="inline-flex h-9 items-center gap-2 rounded-pill px-5 text-[13px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))" }}
          >
            {pending && <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />}
            {pending ? "Moving…" : `Move to ${NEGOTIATION_STATUS_LABELS[target]}`}
          </button>
        </div>
      </div>
    </div>
  );
}
