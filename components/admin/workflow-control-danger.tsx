"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { disableAllWorkflowGatesAction } from "@/app/(admin)/admin/workflow-control/actions";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

const CONFIRM_PHRASE = "DISABLE ALL";

interface Props {
  /** Labels of the gates currently ON — the exact list that would be cleared. */
  enforcedLabels: string[];
  /** True when org_settings has not been seeded — writes would fail. */
  locked: boolean;
}

/**
 * The rollback control: clear every gate in one write and return the whole app
 * to pre-enforcement behaviour. Irreversible in the sense that nothing restores
 * the previous combination automatically, so it is type-to-confirm and the
 * phrase is re-checked server-side.
 */
export function WorkflowControlDanger({ enforcedLabels, locked }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Dialog form state lives here so opening resets it in the click handler.
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const none = enforcedLabels.length === 0;

  function openDialog() {
    setText("");
    setNote("");
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    if (pending) return;
    setOpen(false);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await disableAllWorkflowGatesAction({
        confirmText: text.trim(),
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message:
          res.disabled.length === 0
            ? "Every gate was already off."
            : `${res.disabled.length} gate${res.disabled.length === 1 ? "" : "s"} turned off.`,
        type: "info",
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="workflow-rollback-heading"
      className="rounded-section border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--color-red) 24%, transparent)",
        background: "var(--color-surface-card)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2
            id="workflow-rollback-heading"
            className="flex items-center gap-2 text-[15px] font-bold tracking-tight"
            style={{ color: "var(--color-red-deep)" }}
          >
            <ShieldAlert size={16} strokeWidth={2.2} aria-hidden="true" />
            Roll back all enforcement
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
            Turns every gate off in a single write and returns the pipeline to its
            pre-enforcement behaviour. Records already frozen stay frozen — this
            only stops future moves being enforced. Each cleared gate is written
            to the audit trail separately.
          </p>
          <p className="mt-1.5 text-[12.5px] text-ink-subtle">
            {none
              ? "Nothing to roll back — every gate is already off."
              : `Would clear: ${enforcedLabels.join(", ")}.`}
          </p>
        </div>
        <button
          type="button"
          disabled={none || locked}
          onClick={openDialog}
          className="shrink-0 rounded-md border px-4 py-2 text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            borderColor: "color-mix(in srgb, var(--color-red) 38%, transparent)",
            background: "var(--color-red-bg)",
            color: "var(--color-red-deep)",
          }}
        >
          Disable all gates
        </button>
      </div>

      <ConfirmDialog
        open={open}
        enforcedLabels={enforcedLabels}
        text={text}
        onTextChange={setText}
        note={note}
        onNoteChange={setNote}
        error={error}
        pending={pending}
        onConfirm={confirm}
        onClose={closeDialog}
      />
    </section>
  );
}

function ConfirmDialog({
  open,
  enforcedLabels,
  text,
  onTextChange,
  note,
  onNoteChange,
  error,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  enforcedLabels: string[];
  text: string;
  onTextChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  error: string | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-32px)] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg"
        >
          <Dialog.Title className="font-serif text-xl text-[#0F172A]">
            Disable every workflow gate?
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[14px] leading-relaxed text-[#64748B]">
            {enforcedLabels.length} gate
            {enforcedLabels.length === 1 ? "" : "s"} will be turned off:{" "}
            {enforcedLabels.join(", ")}. Staff go back to creating each document
            by hand, and no price, quantity or spec is frozen on the way through.
          </Dialog.Description>

          <div className="mt-4">
            <label
              htmlFor="disable-all-confirm"
              className="mb-1.5 block text-[13.5px] font-semibold text-[#0F172A]"
            >
              Type <code className="rounded bg-[#F1F5F9] px-1">{CONFIRM_PHRASE}</code> to confirm
            </label>
            <input
              id="disable-all-confirm"
              value={text}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onTextChange(e.target.value)}
              className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[14px] tracking-wide"
            />
          </div>

          <div className="mt-3">
            <label
              htmlFor="disable-all-note"
              className="mb-1.5 block text-[13.5px] font-semibold text-[#0F172A]"
            >
              Reason <span className="font-normal text-[#64748B]">(optional)</span>
            </label>
            <input
              id="disable-all-note"
              value={note}
              maxLength={280}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. Rolling back after the 12 Aug freeze incident"
              className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[14px]"
            />
          </div>

          {error && (
            <AdminInlineError className="mt-3">
              {error}
            </AdminInlineError>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-md px-4 py-2.5 text-[14px] font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || text.trim() !== CONFIRM_PHRASE}
              className="inline-flex items-center gap-1.5 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-red-deep)" }}
            >
              {pending && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
              {pending ? "Disabling" : "Disable all gates"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
