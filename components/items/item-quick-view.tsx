"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Pencil, Power, X } from "lucide-react";
import { COSTING_TYPE_LABELS } from "@/db/enums";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { deactivateItem, reactivateItem } from "@/app/(app)/items/actions";
import type { ItemListItem } from "@/lib/queries/items";

/*
 * ItemQuickView - instant quick-view popup for the Item Master register.
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

  const dimensions = composeDimensions(item);

  const altUomValue =
    item.altUom && item.altUomConversion
      ? `${item.altUom} (1 = ${item.altUomConversion} ${item.uom ?? "base"})`
      : item.altUom;

  const sections: Section[] = [
    {
      title: "Classification",
      rows: [
        ["Shape", item.shapeName],
        ["Grade (Internal)", item.gradeName],
        ["Tolerance", item.toleranceName],
        ["Condition", item.conditionName],
        ["Size Code", item.sizeCode],
        [
          "Costing Type",
          item.costingType ? COSTING_TYPE_LABELS[item.costingType] : null,
        ],
      ],
    },
    {
      title: "Dimensions",
      rows: [
        ["Dimensions", dimensions],
        ["Dimension Notes", item.dimensionNotes],
      ],
    },
    {
      title: "Customer / Product",
      rows: [
        ["Customer", item.customerName],
        ["SM Number", item.smNumber],
        ["Product", item.custProductName],
        ["Drawing No", item.custDrawingNo],
        ["Drawing Rev", item.drawingRevisionNo],
        ["Quantity", item.qty],
        ["Grade (Customer)", item.gradeCustomer],
        ["Grade Name for Customer", item.gradeNameForCust],
      ],
    },
    {
      title: "Tax & Units",
      rows: [
        ["HSN Code", item.hsnCode],
        ["Unit of Measure", item.uom],
        ["Alt UoM", altUomValue],
      ],
    },
    {
      title: "Part",
      rows: [
        ["Part No", item.partNo],
        ["Description 1", item.partDescription1],
      ],
      hidden: !item.partNo && !item.partDescription1,
    },
    {
      title: "Record",
      rows: [
        ["Status", item.isActive ? "Active" : "Inactive"],
        ["Created", formatDate(item.createdAt)],
        ["Last Updated", formatDate(item.updatedAt)],
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-[min(92vw,720px)] max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-7 pt-7 pb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
              Item Master
            </div>
            <h2
              className="mt-1 text-[26px] leading-tight font-bold text-ink-strong break-all"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {item.itemCode}
            </h2>
            <span
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
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

        <div className="px-7 py-6">
          <div className="overflow-hidden rounded-xl border border-hairline">
            <table className="w-full border-collapse text-left">
              <tbody>
                {sections.map((section) => (
                  <QuickViewSection key={section.title} section={section} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

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

/* ── Helpers ─────────────────────────────────────────────────────────── */

interface Section {
  title: string;
  rows: ReadonlyArray<readonly [string, string | null | undefined]>;
  hidden?: boolean;
}

function composeDimensions(
  item: Pick<
    ItemListItem,
    "outerDia" | "innerDia" | "length" | "width" | "thickness"
  >,
): string | null {
  const parts: string[] = [];
  if (item.outerDia) parts.push(`OD ${item.outerDia}`);
  if (item.innerDia) parts.push(`ID ${item.innerDia}`);
  if (item.length) parts.push(`L ${item.length}`);
  if (item.width) parts.push(`W ${item.width}`);
  if (item.thickness) parts.push(`T ${item.thickness}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function QuickViewSection({ section }: { section: Section }) {
  if (section.hidden) return null;
  const visible = section.rows.filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (visible.length === 0) return null;
  return (
    <>
      {/* Section band spanning both columns. */}
      <tr>
        <th
          colSpan={2}
          scope="colgroup"
          className="bg-surface-soft px-4 py-2 text-left text-[11px] uppercase tracking-[0.14em] font-bold text-ink-subtle border-y border-hairline"
        >
          {section.title}
        </th>
      </tr>
      {visible.map(([label, value]) => (
        <tr key={label} className="border-b border-hairline last:border-b-0">
          <th
            scope="row"
            className="w-[40%] whitespace-nowrap px-4 py-2.5 align-top text-[12.5px] font-semibold uppercase tracking-wide text-ink-subtle"
          >
            {label}
          </th>
          <td className="px-4 py-2.5 align-top text-[14px] font-medium leading-snug text-ink-strong break-words">
            {value}
          </td>
        </tr>
      ))}
    </>
  );
}
