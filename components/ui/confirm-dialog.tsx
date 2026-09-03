"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

/**
 * Reusable confirmation dialog for destructive (or otherwise weighty) actions.
 * A single, consistent "Do you really want to…?" surface used across the
 * registers and tables instead of the browser's window.confirm.
 *
 * Controlled: the caller owns `open` + the `pending` flag (so the confirm button
 * shows a spinner while the action runs). `onConfirm` fires when confirmed;
 * closing (Cancel / overlay / Esc) calls `onOpenChange(false)` unless pending.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Are you sure?",
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  pending?: boolean;
  onConfirm: () => void;
}) {
  const accent = tone === "danger" ? "#d03232" : "#454595";
  const accentDeep = tone === "danger" ? "#b02525" : "#3a3a80";
  const accentBg =
    tone === "danger" ? "rgba(208,50,50,0.10)" : "rgba(69,69,149,0.10)";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="cd-overlay fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="cd-content fixed left-1/2 top-1/2 z-[100] w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e2dfdc] bg-white p-6 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.35)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ background: accentBg, color: accentDeep }}
            >
              {tone === "danger" ? (
                <Trash2 size={20} strokeWidth={2.2} />
              ) : (
                <AlertTriangle size={20} strokeWidth={2.2} />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <Dialog.Title className="text-[17px] font-black tracking-tight text-[#1f2547]">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-[#777985]">
                  {description}
                </Dialog.Description>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="rounded-lg border border-[#e2dfdc] px-4 py-2.5 text-[13.5px] font-bold text-[#57534e] transition-colors hover:bg-[#f5f2ec] disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
            >
              {pending && (
                <Loader2 size={15} style={{ animation: "spinFast 0.8s linear infinite" }} />
              )}
              {pending ? "Working…" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
