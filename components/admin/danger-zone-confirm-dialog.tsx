"use client";

import { useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  confirmationMatches,
  type DangerZoneOperationMeta,
} from "@/lib/danger-zone/operations";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

export interface ConfirmImpactRow {
  label: string;
  value: number;
  /** "danger" rows are the ones about to be destroyed. */
  tone?: "danger" | "neutral";
}

interface Props {
  /** Non-null opens the dialog; null closes it. */
  meta: DangerZoneOperationMeta | null;
  /** Required when meta.confirmKind === "email" - the exact string to type. */
  targetEmail?: string;
  /** One line naming the exact scope, e.g. "Older than 90 days (before ...)". */
  scopeLine?: string;
  impact: ConfirmImpactRow[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onRun: (typed: string) => void;
}

/**
 * The single confirmation surface for every Danger Zone operation. States the
 * blast radius in plain language, shows the exact row counts BEFORE the run,
 * and - for anything destructive - keeps the run button disabled until the
 * admin types the operation's phrase (or the target's email) exactly.
 *
 * The typed value is re-checked server-side; this gate is UX, not security.
 */
export function DangerZoneConfirmDialog({
  meta,
  targetEmail,
  scopeLine,
  impact,
  pending,
  error,
  onCancel,
  onRun,
}: Props) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();

  // The console keys this component by operation + target, so every open
  // starts from an empty box without an effect resetting state.
  const open = meta !== null;
  const needsTyping = meta !== null && meta.confirmKind !== "none";
  const expected =
    meta === null
      ? ""
      : meta.confirmKind === "email"
        ? (targetEmail ?? "")
        : (meta.confirmPhrase ?? "");
  const matches = meta !== null && confirmationMatches(meta, typed, targetEmail);
  const canRun = meta !== null && !pending && (!needsTyping || matches);

  const accent = meta?.tone === "blue" ? "var(--color-blue)" : "var(--color-red)";
  const accentDeep =
    meta?.tone === "blue" ? "var(--color-blue-deep)" : "var(--color-red-deep)";
  const accentBg =
    meta?.tone === "blue" ? "var(--color-blue-bg)" : "var(--color-red-bg)";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canRun) return;
    onRun(typed);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-lg max-h-[calc(100dvh-32px)]"
          onOpenAutoFocus={(e) => {
            // Focus the confirmation box (not the Cancel button) so a keyboard
            // user lands where the work is.
            if (needsTyping) {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{ background: accentBg, color: accentDeep }}
            >
              {meta?.tone === "blue" ? (
                <ShieldCheck size={19} strokeWidth={2.2} />
              ) : (
                <AlertTriangle size={19} strokeWidth={2.2} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[18px] font-extrabold tracking-tight text-[#1e2f66]">
                {meta?.title ?? ""}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13.5px] leading-relaxed text-[#6b7280]">
                {meta?.summary ?? ""}
              </Dialog.Description>
              {scopeLine && (
                <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#3a4152]">
                  {scopeLine}
                </p>
              )}
            </div>
          </div>

          {impact.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e6e8ec] bg-[#e6e8ec]">
              {impact.map((row) => (
                <div key={row.label} className="bg-white px-3.5 py-3">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b91a0]">
                    {row.label}
                  </dt>
                  <dd
                    className="mt-0.5 text-[22px] font-extrabold leading-none tabular-nums"
                    style={{
                      color:
                        row.tone === "danger" && row.value > 0
                          ? accentDeep
                          : "#3a4152",
                    }}
                  >
                    {row.value.toLocaleString("en-IN")}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {meta && (
            <div className="mt-4 space-y-3">
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8b91a0]">
                  What this does
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {meta.blastRadius.map((line) => (
                    <li
                      key={line}
                      className="flex gap-2 text-[13px] leading-relaxed text-[#3a4152]"
                    >
                      <span aria-hidden="true" style={{ color: accent }}>
                        •
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8b91a0]">
                  What it never touches
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {meta.protected.map((line) => (
                    <li
                      key={line}
                      className="flex gap-2 text-[13px] leading-relaxed text-[#3a4152]"
                    >
                      <span aria-hidden="true" className="text-[#12b76a]">
                        •
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <p
                className="rounded-lg px-3 py-2 text-[12.5px] leading-relaxed"
                style={{ background: accentBg, color: accentDeep }}
              >
                {meta.reversibility}
              </p>
            </div>
          )}

          <form onSubmit={submit} className="mt-4">
            {needsTyping && (
              <div>
                <label
                  htmlFor={inputId}
                  className="block text-[13px] font-semibold text-[#0f172a]"
                >
                  Type{" "}
                  <span className="font-mono font-bold" style={{ color: accentDeep }}>
                    {expected}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id={inputId}
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={hintId}
                  aria-invalid={typed.length > 0 && !matches}
                  maxLength={320}
                  className="mt-1.5 w-full rounded-md border border-[#cbd5e1] px-3.5 py-2.5 text-[14px] font-mono focus:border-[#3f3f94] focus:outline-none focus:ring-2 focus:ring-[#3f3f94]/25"
                />
                <p id={hintId} className="mt-1 text-[12px] text-[#8b91a0]">
                  {matches
                    ? "Confirmed - the run button is now enabled."
                    : "Exact match required, including case."}
                </p>
              </div>
            )}

            {error && (
              <AdminInlineError className="mt-3">
                {error}
              </AdminInlineError>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className="rounded-md px-4 py-2.5 text-[14px] font-semibold text-[#64748b] transition hover:bg-[#f1f2f6] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canRun}
                className="rounded-md px-5 py-2.5 text-[14px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accentDeep})`,
                }}
              >
                {pending ? "Working…" : (meta?.runLabel ?? "Run")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
