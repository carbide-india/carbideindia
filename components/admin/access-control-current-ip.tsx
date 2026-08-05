"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Check, Copy, Radio } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { addCallerIpToAllowlist } from "@/app/(admin)/admin/access-control/actions";
import { AcGhostButton, AcMono, AcPill, AcPrimaryButton } from "./access-control-primitives";

interface Props {
  ip: string;
  /** Does the env ALLOWED_IPS gate (the one middleware runs) admit this IP? */
  envAdmits: boolean;
  /** Is the env gate switched on at all (ALLOWED_IPS non-empty)? */
  envGateOn: boolean;
  /** Label of the active register entry covering this IP, if any. */
  coveredBy: string | null;
  /** Is the signed-in admin on the bypass list (any network)? */
  bypassEmail: boolean;
  /** Would the DB-backed check admit this request right now? */
  dbAdmits: boolean;
  enforced: boolean;
}

/**
 * "Where you are standing" strip. Everything else on this page is safer to
 * change once the admin can see the address the server actually detected —
 * that is the value that must stay covered.
 */
export function AccessControlCurrentIp({
  ip,
  envAdmits,
  envGateOn,
  coveredBy,
  bypassEmail,
  dbAdmits,
  enforced,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(ip);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      fireToast({
        message: "Could not copy — select the address manually.",
        type: "error",
      });
    }
  }

  return (
    <section
      className="rounded-section border bg-surface-card px-5 py-4"
      style={{
        borderColor: "color-mix(in srgb, var(--color-brand) 22%, transparent)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <span
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "rgba(63, 63, 148, 0.08)",
              color: "var(--color-brand-deep)",
              border: "1px solid color-mix(in srgb, var(--color-brand) 22%, transparent)",
            }}
          >
            <Radio size={16} strokeWidth={2.3} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
              This request came from
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className="text-[19px] font-extrabold tracking-tight text-ink-strong tabular-nums"
                style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace" }}
              >
                {ip || "unknown"}
              </span>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy your IP address"
                className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
              >
                {copied ? (
                  <Check size={14} strokeWidth={2.6} />
                ) : (
                  <Copy size={14} strokeWidth={2.2} />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {envGateOn ? (
            envAdmits ? (
              <AcPill tone="green">Env gate: admitted</AcPill>
            ) : (
              <AcPill tone="red">Env gate: not listed</AcPill>
            )
          ) : (
            <AcPill tone="amber">Env gate: off (ALLOWED_IPS empty)</AcPill>
          )}

          {coveredBy ? (
            <AcPill tone="green">Register: {coveredBy}</AcPill>
          ) : (
            <AcPill tone="muted">Register: not covered</AcPill>
          )}

          {bypassEmail && <AcPill tone="brand">Bypass email</AcPill>}

          {enforced && (
            <AcPill tone={dbAdmits ? "green" : "red"}>
              Enforcement: {dbAdmits ? "you pass" : "you would be blocked"}
            </AcPill>
          )}

          {!coveredBy && ip !== "" && (
            <AcPrimaryButton type="button" onClick={() => setAddOpen(true)}>
              Add my IP
            </AcPrimaryButton>
          )}
        </div>
      </div>

      <AddMyIpDialog ip={ip} open={addOpen} onOpenChange={setAddOpen} />
    </section>
  );
}

function AddMyIpDialog({
  ip,
  open,
  onOpenChange,
}: {
  ip: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError("Give it a label — 'Ambad office', 'Manan's home line', …");
      return;
    }
    startTransition(async () => {
      const res = await addCallerIpToAllowlist(trimmed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${res.cidr} added to the register.` });
      setLabel("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-1 font-serif text-xl text-[#0F172A]">
            Add your current address
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-[14px] text-[#64748B]">
            The server will re-read the address from this request, so there is
            nothing to type wrong. It resolves to <AcMono>{ip || "unknown"}</AcMono>.
          </Dialog.Description>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                htmlFor="ac-myip-label"
                className="mb-1.5 block text-[13.5px] font-semibold text-[#0F172A]"
              >
                Label
              </label>
              <input
                id="ac-myip-label"
                autoFocus
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="Ambad office — primary fibre"
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[14.5px]"
              />
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-md border px-3 py-2 text-[13.5px]"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-red) 30%, transparent)",
                  background: "var(--color-red-bg)",
                  color: "var(--color-red-deep)",
                }}
              >
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <AcGhostButton
                type="button"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </AcGhostButton>
              <AcPrimaryButton type="submit" disabled={pending}>
                {pending ? "Adding…" : "Add to register"}
              </AcPrimaryButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
