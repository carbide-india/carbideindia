"use client";

import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";

export type ConfirmTone = "brand" | "danger";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  tone: ConfirmTone;
  pending: boolean;
  onConfirm: () => void;
}

/**
 * The explicit confirm step for every irreversible template action (restoring
 * the shipped wording, sending a real email, taking custom copy off the air).
 *
 * Radix Dialog gives us the focus trap and Escape handling; we add
 * `role="alertdialog"` and park initial focus on Cancel so a stray Enter can
 * never fire the destructive branch.
 */
export function TemplatesConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone,
  pending,
  onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirmStyle =
    tone === "danger"
      ? { background: "var(--color-red, #D32F2F)" }
      : {
          background:
            "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
        };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <Dialog.Title className="mb-1 font-serif text-xl text-[#0F172A]">
            {title}
          </Dialog.Title>
          <Dialog.Description asChild>
            <div className="mb-5 text-[14px] leading-relaxed text-[#64748B]">
              {description}
            </div>
          </Dialog.Description>
          <div className="flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              className="rounded-md px-4 py-2.5 text-[14px] font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onConfirm}
              className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={confirmStyle}
            >
              {pending ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
