"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Pencil, Power, X } from "lucide-react";
import { COSTING_TYPE_LABELS } from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { deactivateItem, reactivateItem } from "@/app/(app)/items/actions";
import type { ItemListItem } from "@/lib/queries/items";

/*
 * ItemQuickView — instant quick-view popup for the Item Master register.
 * Renders entirely from the already-loaded ItemListItem row (no fetch), mirroring
 * the Client Master quick-view: overlay + card, closes on overlay click / ✕ /
 * Escape, a <dl> of fields, and footer buttons (Edit / Full record /
 * Deactivate-Reactivate for admins).
 */

interface Props {
  item: ItemListItem;
  isAdmin: boolean;
  onClose: () => void;
}

export function ItemQuickView({ item, isAdmin, onClose }: Props) {
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
      const res = item.isActive
        ? await deactivateItem(item.id)
        : await reactivateItem(item.id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: item.isActive
          ? `${item.itemCode} deactivated.`
          : `${item.itemCode} reactivated.`,
      });
      router.refresh();
      onClose();
    } finally {
      setPending(false);
    }
  }

  const classification = [
    item.shapeName,
    item.gradeName,
    item.toleranceName,
    item.conditionName,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" · ");

  const taxUnits = [
    item.hsnCode ? `HSN ${item.hsnCode}` : null,
    item.uom ? `UoM ${item.uom}` : null,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" · ");

  const rows: Array<[string, React.ReactNode]> = [
    ["Customer", item.customerName],
    ["Product", item.custProductName],
    ["Classification", classification || null],
    ["Tax & Units", taxUnits || null],
    ["Part No", item.partNo],
    ["Drawing Rev", item.drawingRevisionNo],
    [
      "Costing Type",
      item.costingType ? COSTING_TYPE_LABELS[item.costingType] : null,
    ],
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
              Item Master
            </div>
            <h2
              className="mt-0.5 text-2xl font-bold text-ink-strong"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {item.itemCode}
            </h2>
            <span
              className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                item.isActive
                  ? "bg-[var(--color-green-bg)] text-[var(--color-green-deep)]"
                  : "bg-[rgba(15,23,42,0.05)] text-ink-subtle"
              }`}
            >
              {item.isActive ? "Active" : "Inactive"}
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

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-6 py-5 sm:grid-cols-2">
          {rows
            .filter(([, v]) => v != null && v !== "")
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wide font-semibold text-ink-subtle">
                  {label}
                </dt>
                <dd className="mt-0.5 text-[14px] text-ink-strong">{value}</dd>
              </div>
            ))}
        </dl>

        <div className="flex flex-wrap justify-end gap-2 border-t border-hairline px-6 py-4">
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
              {item.isActive ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <Link
            href={`/items/${item.id}` as Route}
            className="inline-flex items-center rounded-lg border border-hairline px-4 py-2 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            Full record
          </Link>
          <Link
            href={`/items/${item.id}/edit` as Route}
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
