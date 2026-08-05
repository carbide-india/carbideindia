"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Extra detail rendered above the reason box (device lines, warnings, ...). */
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  /** Show the optional "reason" textarea and pass its value to onConfirm. */
  withReason?: boolean;
  reasonLabel?: string;
  /** Return `{ ok: false, error }` to keep the dialog open and show the error. */
  onConfirm: (reason: string) => Promise<{ ok: boolean; error?: string; message?: string }>;
}

/**
 * Shared confirm step for every destructive action on /admin/sessions.
 * Radix Dialog gives the focus trap and restore; the confirm button is
 * autofocused so the whole flow is Enter-able from the keyboard.
 *
 * Callers must mount this only while the dialog is open (`{open && <... />}`) -
 * the fresh mount is what clears a previous reason/error, so no reset effect is
 * needed and a stale reason can never be reused on the next revocation.
 */
export function SessionsConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  withReason = false,
  reasonLabel = "Reason (optional, recorded in the audit trail)",
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmRef = useRef<HTMLButtonElement>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await onConfirm(reason.trim());
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      if (res.message) fireToast({ message: res.message });
      onOpenChange(false);
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (pending) return; // don't drop a dialog mid-write
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-32px)] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            confirmRef.current?.focus();
          }}
        >
          <Dialog.Title className="mb-1 font-serif text-xl text-[#0F172A]">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-[14.5px] leading-relaxed text-[#64748B]">
            {description}
          </Dialog.Description>

          {children}

          {withReason && (
            <div className="mt-4">
              <label
                htmlFor="sessions-revoke-reason"
                className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]"
              >
                {reasonLabel}
              </label>
              <textarea
                id="sessions-revoke-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                rows={2}
                className="w-full resize-y rounded-md border border-[#CBD5E1] px-3 py-2 text-[14px] leading-relaxed"
                placeholder="Laptop lost, contractor finished, ..."
              />
            </div>
          )}

          {error && (
            <AdminInlineError className="mt-4">
              {error}
            </AdminInlineError>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                className="px-4 py-2.5 text-[14px] font-medium text-[#64748B] disabled:opacity-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              ref={confirmRef}
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{ background: "#D32F2F" }}
            >
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
