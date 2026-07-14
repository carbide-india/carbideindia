"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Pencil, Power, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { deleteClient, reactivateClient } from "@/app/(admin)/admin/clients/actions";
import type { ClientRegisterRow } from "@/lib/queries/clients";

/*
 * ClientQuickView - instant quick-view popup for the Client Master register.
 * Renders entirely from the already-loaded ClientRegisterRow (no fetch), mirroring
 * the Item Master quick-view: overlay + card, closes on overlay click / ✕ /
 * Escape, a <dl> of fields, and footer buttons (Full record / Edit /
 * admin Deactivate-Reactivate).
 */

interface Props {
  client: ClientRegisterRow;
  isAdmin: boolean;
  onClose: () => void;
}

export function ClientQuickView({ client, isAdmin, onClose }: Props) {
  const c = client;
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleActive() {
    setPending(true);
    try {
      const res = c.isActive
        ? await deleteClient(c.id)
        : await reactivateClient(c.id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: c.isActive
          ? `${c.name} deactivated.`
          : `${c.name} reactivated.`,
      });
      router.refresh();
      onClose();
    } finally {
      setPending(false);
    }
  }

  const location = [c.city, c.state].filter(Boolean).join(", ");

  const rows: Array<[string, React.ReactNode]> = [
    ["Client Code", c.clientCode],
    ["GSTIN", c.gstin],
    ["Location", location || null],
    [
      "Customer Type",
      c.customerTypeNames.length > 0 ? c.customerTypeNames.join(", ") : null,
    ],
    [
      "Industry Type",
      c.industryTypeNames.length > 0 ? c.industryTypeNames.join(", ") : null,
    ],
    ["Credit Days", c.creditDays != null ? String(c.creditDays) : null],
    [
      "Export",
      c.isExport != null ? (c.isExport ? "Yes" : "No") : null,
    ],
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-[min(92vw,640px)] max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-7 pt-7 pb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
              Client Master
            </div>
            <h2 className="mt-1 text-[26px] leading-tight font-bold text-ink-strong break-words">
              {c.name}
            </h2>
            <span
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                c.isActive
                  ? "bg-[var(--color-green-bg)] text-[var(--color-green-deep)]"
                  : "bg-[rgba(15,23,42,0.05)] text-ink-subtle"
              }`}
            >
              {c.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-7 py-6 sm:grid-cols-2">
          {rows
            .filter(([, v]) => v != null && v !== "")
            .map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-[12px] uppercase tracking-wide font-semibold text-ink-subtle">
                  {label}
                </dt>
                <dd className="text-[15px] leading-snug text-ink-strong font-medium break-words">
                  {value}
                </dd>
              </div>
            ))}
        </dl>

        <div className="flex flex-wrap justify-end gap-2 border-t border-hairline px-7 py-4">
          {isAdmin && (
            <button
              type="button"
              onClick={toggleActive}
              disabled={pending}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50"
              style={{
                borderColor: "color-mix(in srgb, var(--color-red) 40%, transparent)",
                color: "var(--color-red)",
              }}
            >
              <Power size={14} strokeWidth={2.4} />
              {c.isActive ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <Link
            href={`/clients/${c.id}` as Route}
            className="inline-flex items-center rounded-lg border border-hairline px-4 py-2 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            Full record
          </Link>
          <Link
            href={`/clients/${c.id}/edit` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep"
          >
            <Pencil size={14} strokeWidth={2.4} />
            Edit
          </Link>
        </div>
      </div>
    </div>
  );
}
