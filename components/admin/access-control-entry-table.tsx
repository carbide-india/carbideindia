"use client";

import { useMemo, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { AlertTriangle, MapPin, Plus, ShieldCheck } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format";
import { describeCidr } from "@/lib/access-control-ip";
import { setIpAllowlistEntryActive } from "@/app/(admin)/admin/access-control/actions";
import {
  AccessControlEntryDialog,
  type AccessControlEntryDraft,
} from "./access-control-entry-dialog";
import {
  AcCard,
  AcEmpty,
  AcGhostButton,
  AcMono,
  AcPill,
  AcPrimaryButton,
} from "./access-control-primitives";

export interface AccessControlEntryView {
  id: string;
  label: string;
  cidr: string;
  note: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  matchesCallerIp: boolean;
  inEnvAllowlist: boolean;
}

interface Props {
  entries: AccessControlEntryView[];
  callerIp: string;
  /** True when org_settings.ip_allowlist_enforced is on. */
  enforced: boolean;
}

/**
 * The IP allowlist register. Rows that cover the caller's own address are
 * flagged, and deactivating one goes through an explicit lock-out confirmation
 * (the server refuses outright when it would strand the admin).
 */
export function AccessControlEntryTable({ entries, callerIp, enforced }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccessControlEntryDraft | null>(null);
  const [confirming, setConfirming] = useState<AccessControlEntryView | null>(null);

  const activeCount = useMemo(
    () => entries.filter((e) => e.isActive).length,
    [entries],
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(entry: AccessControlEntryView) {
    setEditing({
      id: entry.id,
      label: entry.label,
      cidr: entry.cidr,
      note: entry.note,
    });
    setDialogOpen(true);
  }

  return (
    <>
      <AcCard
        title="IP allowlist register"
        icon={<ShieldCheck size={13} strokeWidth={2.4} />}
        description={`${entries.length} entr${entries.length === 1 ? "y" : "ies"} · ${activeCount} active. Deactivate rather than delete — the history of who could get in from where survives.`}
        action={
          <AcPrimaryButton type="button" onClick={openCreate}>
            <span className="inline-flex items-center gap-1.5">
              <Plus size={14} strokeWidth={2.6} />
              Add entry
            </span>
          </AcPrimaryButton>
        }
      >
        {entries.length === 0 ? (
          <AcEmpty
            title="No allowlist entries yet"
            body="Add the office circuits you want on record. Until enforcement is switched on this register is documentation only — the ALLOWED_IPS environment variable stays the live gate."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <caption className="sr-only">
                IP allowlist entries with coverage, status and last-seen time
              </caption>
              <thead>
                <tr
                  className="border-b border-hairline text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <th scope="col" className="px-5 py-3">
                    Label
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Address / block
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Covers
                  </th>
                  <th scope="col" className="px-5 py-3">
                    In ALLOWED_IPS
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Last seen
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    rowIndex={i}
                    onEdit={() => openEdit(entry)}
                    onRequestDeactivate={() => setConfirming(entry)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AcCard>

      <AccessControlEntryDialog
        open={dialogOpen}
        entry={editing}
        suggestedCidr={editing ? undefined : callerIp}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
      />

      <DeactivateDialog
        entry={confirming}
        enforced={enforced}
        callerIp={callerIp}
        onDone={() => {
          setConfirming(null);
          router.refresh();
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

function EntryRow({
  entry,
  rowIndex,
  onEdit,
  onRequestDeactivate,
}: {
  entry: AccessControlEntryView;
  rowIndex: number;
  onEdit: () => void;
  onRequestDeactivate: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function reactivate() {
    startTransition(async () => {
      const res = await setIpAllowlistEntryActive(entry.id, true);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${entry.label} reactivated.` });
      router.refresh();
    });
  }

  return (
    <tr
      className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface-soft"
      style={{
        background: entry.matchesCallerIp
          ? "rgba(63, 63, 148, 0.045)"
          : rowIndex % 2 === 1
            ? "rgba(15, 23, 42, 0.012)"
            : undefined,
      }}
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink-strong">{entry.label}</span>
          {entry.matchesCallerIp && (
            <AcPill tone="brand" dot={false}>
              <MapPin size={11} strokeWidth={2.6} />
              You
            </AcPill>
          )}
        </div>
        {entry.note && (
          <p className="mt-0.5 max-w-[34ch] truncate text-[12.5px] text-ink-subtle">
            {entry.note}
          </p>
        )}
        <p className="mt-0.5 text-[11.5px] text-ink-subtle">
          Added by {entry.createdByName ?? "unknown"}
          {entry.updatedByName && entry.updatedByName !== entry.createdByName
            ? ` · last edited by ${entry.updatedByName}`
            : ""}
        </p>
      </td>
      <td className="px-5 py-3.5">
        <AcMono>{entry.cidr}</AcMono>
      </td>
      <td className="px-5 py-3.5 text-[12.5px] text-ink-soft tabular-nums">
        {describeCidr(entry.cidr)}
      </td>
      <td className="px-5 py-3.5">
        {entry.inEnvAllowlist ? (
          <AcPill tone="green">Yes</AcPill>
        ) : (
          <AcPill tone="amber">Register only</AcPill>
        )}
      </td>
      <td className="px-5 py-3.5 text-[12.5px] text-ink-soft tabular-nums">
        {entry.lastSeenAt ? formatDateTime(new Date(entry.lastSeenAt)) : "—"}
      </td>
      <td className="px-5 py-3.5">
        {entry.isActive ? (
          <AcPill tone="green">Active</AcPill>
        ) : (
          <AcPill tone="muted">Inactive</AcPill>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <div className="inline-flex items-center gap-1.5">
          <AcGhostButton type="button" onClick={onEdit} disabled={pending}>
            Edit
          </AcGhostButton>
          {entry.isActive ? (
            <AcGhostButton
              type="button"
              onClick={onRequestDeactivate}
              disabled={pending}
            >
              Deactivate
            </AcGhostButton>
          ) : (
            <AcGhostButton type="button" onClick={reactivate} disabled={pending}>
              {pending ? "Working…" : "Reactivate"}
            </AcGhostButton>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * Explicit confirm for the one destructive action on this page. When the entry
 * covers the caller's own address the copy escalates to a red lock-out warning
 * and the confirm flag is passed through to the server, which independently
 * re-derives the caller IP and can still refuse.
 */
function DeactivateDialog({
  entry,
  enforced,
  callerIp,
  onDone,
  onCancel,
}: {
  entry: AccessControlEntryView | null;
  enforced: boolean;
  callerIp: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selfLockout = entry?.matchesCallerIp ?? false;

  function confirm() {
    if (!entry) return;
    setError(null);
    startTransition(async () => {
      const res = await setIpAllowlistEntryActive(entry.id, false, true);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${entry.label} deactivated.` });
      onDone();
    });
  }

  return (
    <Dialog.Root
      open={entry !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onCancel();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg">
          <Dialog.Title className="mb-1 font-serif text-xl text-[#0F172A]">
            Deactivate {entry?.label ?? "entry"}?
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-[14px] text-[#64748B]">
            The entry stays on record and can be reactivated at any time. It
            stops counting towards allowlist coverage immediately.
          </Dialog.Description>

          {selfLockout && (
            <div
              role="alert"
              className="mb-4 flex gap-2.5 rounded-md border px-3.5 py-3"
              style={{
                borderColor: "color-mix(in srgb, var(--color-red) 35%, transparent)",
                background: "var(--color-red-bg)",
                color: "var(--color-red-deep)",
              }}
            >
              <AlertTriangle size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" />
              <div className="text-[13.5px]" style={{ lineHeight: 1.5 }}>
                <strong className="block">This entry covers you right now.</strong>
                Your current address {callerIp || "(unknown)"} falls inside{" "}
                {entry?.cidr}.{" "}
                {enforced
                  ? "Enforcement is ON — if nothing else covers you, you will lose access to the app from this network."
                  : "Enforcement is currently off, so nothing breaks today — but turning it on later would leave you outside."}
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border px-3 py-2 text-[13.5px]"
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
            <AcGhostButton type="button" disabled={pending} onClick={onCancel}>
              Keep it active
            </AcGhostButton>
            <button
              type="button"
              disabled={pending}
              onClick={confirm}
              className="rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-50"
              style={{
                background: "var(--color-red)",
                boxShadow: "0 6px 18px -10px rgba(211, 47, 47, 0.6)",
              }}
            >
              {pending ? "Deactivating…" : "Yes, deactivate"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
