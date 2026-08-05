"use client";

import { useRef, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { fireToast } from "@/lib/toast";
import { describeCidr, parseCidr } from "@/lib/access-control-ip";
import {
  createIpAllowlistEntry,
  updateIpAllowlistEntry,
} from "@/app/(admin)/admin/access-control/actions";
import { AcGhostButton, AcPrimaryButton } from "./access-control-primitives";

export interface AccessControlEntryDraft {
  id: string;
  label: string;
  cidr: string;
  note: string | null;
}

interface Props {
  open: boolean;
  /** null = create a new entry; a draft = edit that entry. */
  entry: AccessControlEntryDraft | null;
  /** Pre-fills the address field when creating (e.g. the caller's own IP). */
  suggestedCidr?: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create / edit dialog for an allowlist entry. The address is canonicalised
 * live so the admin sees exactly what will be stored ("203.0.113.7/24" →
 * "203.0.113.0/24") before they commit; the server re-parses regardless.
 */
export function AccessControlEntryDialog({
  open,
  entry,
  suggestedCidr,
  onOpenChange,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        {/* Keyed so switching target (or reopening with a different suggestion)
            remounts the body with fresh initial state - no re-seeding effect. */}
        <EntryDialogBody
          key={entry?.id ?? `new:${suggestedCidr ?? ""}`}
          entry={entry}
          suggestedCidr={suggestedCidr}
          onOpenChange={onOpenChange}
        />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EntryDialogBody({
  entry,
  suggestedCidr,
  onOpenChange,
}: {
  entry: AccessControlEntryDraft | null;
  suggestedCidr?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(entry?.label ?? "");
  const [cidr, setCidr] = useState(entry?.cidr ?? suggestedCidr ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const labelRef = useRef<HTMLInputElement>(null);

  const parsed = cidr.trim() === "" ? null : parseCidr(cidr);
  const cidrInvalid = cidr.trim() !== "" && parsed === null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedLabel = label.trim();
    const trimmedCidr = cidr.trim();
    const trimmedNote = note.trim();

    if (trimmedLabel.length < 2) {
      setError("Give the entry a label so the register stays readable.");
      return;
    }
    if (parseCidr(trimmedCidr) === null) {
      setError("Enter a valid IPv4/IPv6 address or CIDR block.");
      return;
    }

    startTransition(async () => {
      if (entry) {
        const patch: { label?: string; cidr?: string; note?: string | null } = {};
        if (trimmedLabel !== entry.label) patch.label = trimmedLabel;
        if (trimmedCidr !== entry.cidr) patch.cidr = trimmedCidr;
        if (trimmedNote !== (entry.note ?? "")) patch.note = trimmedNote || null;
        if (Object.keys(patch).length === 0) {
          setError("No changes to save.");
          return;
        }
        const res = await updateIpAllowlistEntry(entry.id, patch);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        fireToast({ message: `${trimmedLabel} updated.` });
      } else {
        const res = await createIpAllowlistEntry({
          label: trimmedLabel,
          cidr: trimmedCidr,
          note: trimmedNote || undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        fireToast({
          message: res.hostBitsCleared
            ? `Added as ${res.normalized} (host bits cleared).`
            : `${res.normalized} added to the register.`,
        });
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Content
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        labelRef.current?.focus();
      }}
      className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-32px)] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg"
    >
      <Dialog.Title className="mb-1 font-serif text-xl text-[#0F172A]">
        {entry ? "Edit allowlist entry" : "Add allowlist entry"}
      </Dialog.Title>
      <Dialog.Description className="mb-4 text-[14px] text-[#64748B]">
        Entries are the admin-editable register of who may reach the app and from
        where. They never delete — deactivate instead.
      </Dialog.Description>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="ac-entry-label"
            className="mb-1.5 block text-[13.5px] font-semibold text-[#0F172A]"
          >
            Label
          </label>
          <input
            id="ac-entry-label"
            ref={labelRef}
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="Ambad office — primary fibre"
            className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[14.5px]"
          />
        </div>

        <div>
          <label
            htmlFor="ac-entry-cidr"
            className="mb-1.5 block text-[13.5px] font-semibold text-[#0F172A]"
          >
            IP address or CIDR block
          </label>
          <input
            id="ac-entry-cidr"
            required
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            maxLength={64}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={cidrInvalid}
            aria-describedby="ac-entry-cidr-hint"
            placeholder="203.0.113.7  or  203.0.113.0/24"
            className="w-full rounded-md border px-3.5 py-2.5 text-[14.5px] tabular-nums"
            style={{
              fontFamily: "var(--font-mono-display), ui-monospace, monospace",
              borderColor: cidrInvalid ? "var(--color-red)" : "#CBD5E1",
            }}
          />
          <p
            id="ac-entry-cidr-hint"
            className="mt-1.5 text-[12.5px]"
            style={{
              color: cidrInvalid ? "var(--color-red-deep)" : "var(--color-ink-subtle)",
            }}
          >
            {cidrInvalid
              ? "Not a valid IPv4/IPv6 address or CIDR block."
              : parsed
                ? `Stored as ${parsed.normalized} · ${describeCidr(parsed.normalized)}${parsed.hostBitsCleared ? " · host bits cleared" : ""}`
                : "A bare address covers one machine; a /24 covers 256."}
          </p>
        </div>

        <div>
          <label
            htmlFor="ac-entry-note"
            className="mb-1.5 block text-[13.5px] font-semibold text-[#0F172A]"
          >
            Note <span className="font-normal text-[#94A3B8]">(optional)</span>
          </label>
          <textarea
            id="ac-entry-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={400}
            rows={2}
            placeholder="Who to call when this circuit changes"
            className="w-full resize-y rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[14.5px]"
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

        <div className="flex justify-end gap-2 pt-1">
          <AcGhostButton
            type="button"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </AcGhostButton>
          <AcPrimaryButton type="submit" disabled={pending || cidrInvalid}>
            {pending ? "Saving…" : entry ? "Save changes" : "Add entry"}
          </AcPrimaryButton>
        </div>
      </form>
    </Dialog.Content>
  );
}
