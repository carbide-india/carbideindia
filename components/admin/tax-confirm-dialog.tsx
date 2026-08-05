"use client";

import { useRef, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

export interface TaxConfirmSpec {
  title: string;
  /** One or two sentences explaining the consequence, not the mechanic. */
  body: string;
  confirmLabel: string;
  /** Toast text on success. */
  successMessage: string;
  /** `danger` paints the confirm button with the semantic red role. */
  tone: "brand" | "danger";
  run: () => Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * Explicit confirm step for anything that changes what future documents do
 * (default rate) or retires a master row.  Radix Dialog gives us the focus
 * trap + restore; we additionally move focus onto the confirm button so the
 * keyboard path is Enter-to-confirm, Esc-to-cancel.  The body remounts per
 * spec (key) so the error message never leaks between two confirms.
 */
export function TaxConfirmDialog({
  spec,
  onClose,
  onDone,
}: {
  spec: TaxConfirmSpec | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog.Root
      open={spec !== null}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          ref={contentRef}
          // Land focus on Confirm (not Cancel, the first tabbable) so the
          // keyboard path is Enter-to-confirm / Esc-to-cancel.
          onOpenAutoFocus={(e) => {
            const btn = contentRef.current?.querySelector<HTMLButtonElement>(
              "[data-tax-confirm]",
            );
            if (!btn) return;
            e.preventDefault();
            btn.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg"
        >
          {spec && (
            <ConfirmBody
              key={spec.title}
              spec={spec}
              onBusyChange={setBusy}
              onClose={onClose}
              onDone={onDone}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConfirmBody({
  spec,
  onBusyChange,
  onClose,
  onDone,
}: {
  spec: TaxConfirmSpec;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    onBusyChange(true);
    startTransition(async () => {
      const res = await spec.run();
      onBusyChange(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(spec.successMessage);
      onClose();
    });
  }

  const danger = spec.tone === "danger";

  return (
    <>
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg"
          style={{
            background: danger ? "#fdecec" : "#eef1fb",
            color: danger ? "#d32f2f" : "#3f3f94",
          }}
        >
          <AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <Dialog.Title className="text-[16px] font-extrabold text-[#1e2f66]">
            {spec.title}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-[#6b7280]">
            {spec.body}
          </Dialog.Description>
        </div>
      </div>

      {error && (
        <AdminInlineError className="mt-4">
          {error}
        </AdminInlineError>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Dialog.Close asChild>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-[#6b7280] transition hover:text-[#3a4152] disabled:opacity-50"
          >
            Cancel
          </button>
        </Dialog.Close>
        <button
          type="button"
          data-tax-confirm=""
          onClick={confirm}
          disabled={pending}
          className="rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white transition disabled:opacity-50"
          style={{ background: danger ? "#d32f2f" : "#3f3f94" }}
        >
          {pending ? "Working…" : spec.confirmLabel}
        </button>
      </div>
    </>
  );
}
