"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useQueryState, parseAsString } from "nuqs";
import { Check, Paperclip, Pencil, Power, FileText } from "lucide-react";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
  type RowMenuItem,
} from "@/components/registers/register-data-table";
import { fireToast } from "@/lib/toast";
import {
  deactivateVendor,
  deactivateVendorsBulk,
  reactivateVendor,
} from "@/app/(app)/vendors/actions";
import {
  VENDOR_VIEWS,
  VENDOR_VIEW_META,
  countVendorViews,
  isVendorView,
  matchesVendorView,
  type VendorView,
} from "@/components/vendors/vendor-views";
import type { VendorRegisterRow } from "@/lib/queries/vendors";

interface Props {
  rows: VendorRegisterRow[];
  isAdmin: boolean;
  /** Route prefix for all row links. Vendors are maintained under the Forms
   *  module at /vendors (the old /costings/vendors routes were removed). */
  basePath?: string;
}

/**
 * Vendor Master register — a thin config wrapper over the shared
 * RegisterDataTable (like the six sales registers), scaled to the vendor fields.
 * The per-row three-dot menu carries Full Record / Edit and, for admins, the
 * danger Deactivate (deactivate-only governance) / Reactivate toggle. Excel
 * export ships as a dedicated server route from the page header, so the table's
 * own CSV export is disabled to avoid a duplicate.
 */
export function VendorRegister({
  rows,
  isAdmin,
  basePath = "/vendors",
}: Props) {
  const router = useRouter();

  // ── Bucket strip ──
  // Every tile counts the SAME `rows` array the table renders, and clicking one
  // applies the identical predicate (`matchesVendorView`) — so a tile can never
  // show a number the list it opens disagrees with. The choice lives in the URL
  // (?view=), so a filtered register is linkable and survives a refresh.
  const counts = React.useMemo(() => countVendorViews(rows), [rows]);
  const [viewParam, setViewParam] = useQueryState(
    "view",
    parseAsString.withDefault(""),
  );
  const view: VendorView = isVendorView(viewParam) ? viewParam : "all";
  const visibleRows = React.useMemo(
    () => (view === "all" ? rows : rows.filter((r) => matchesVendorView(r, view))),
    [rows, view],
  );

  function selectView(next: VendorView) {
    // Clicking the active tile clears back to "all" — the strip is a toggle.
    void setViewParam(next === view || next === "all" ? "" : next);
  }

  async function toggleActive(row: VendorRegisterRow) {
    const res = row.isActive
      ? await deactivateVendor(row.id)
      : await reactivateVendor(row.id);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({
      message: row.isActive
        ? `${row.name} deactivated.`
        : `${row.name} reactivated.`,
    });
    router.refresh();
  }

  const columns = React.useMemo<RegisterColumn<VendorRegisterRow>[]>(
    () => [
      {
        id: "vendorCode",
        header: "Code",
        searchable: true,
        sortValue: (r) => r.vendorCode ?? "",
        exportValue: (r) => r.vendorCode ?? "",
        cell: (r) => (
          <Link
            href={`${basePath}/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.vendorCode ?? "-"}
          </Link>
        ),
      },
      {
        id: "name",
        header: "Name",
        searchable: true,
        sortValue: (r) => r.name,
        exportValue: (r) => r.name,
        cell: (r) => (
          <span className="font-medium text-ink-strong">{r.name}</span>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        searchable: true,
        sortValue: (r) => r.contactPerson ?? "",
        exportValue: (r) =>
          [r.contactPerson, r.contactNo].filter(Boolean).join(" · ") || "",
        cell: (r) =>
          r.contactPerson || r.contactNo ? (
            <div className="flex flex-col gap-0.5">
              {r.contactPerson && (
                <span className="text-ink-soft">{r.contactPerson}</span>
              )}
              {r.contactNo && (
                <span className="text-[12px] tabular-nums text-ink-subtle">
                  {r.contactNo}
                </span>
              )}
            </div>
          ) : (
            <span className="text-ink-subtle">-</span>
          ),
      },
      {
        id: "gstin",
        header: "GSTIN",
        searchable: true,
        sortValue: (r) => r.gstin ?? "",
        exportValue: (r) => r.gstin ?? (r.isGstApplicable ? "" : "Not applicable"),
        cell: (r) => {
          if (r.gstin) {
            return (
              <span
                className="text-[12.5px] text-ink-soft"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {r.gstin}
              </span>
            );
          }
          // A vendor GST doesn't apply to is complete, not missing — say so
          // rather than showing the same dash as a genuine gap.
          return r.isGstApplicable ? (
            <span className="text-[12px] font-semibold text-[#b45309]">Missing</span>
          ) : (
            <span className="text-[12px] text-ink-subtle">Not applicable</span>
          );
        },
      },
      {
        id: "website",
        header: "Website",
        searchable: true,
        defaultHidden: true,
        sortValue: (r) => r.website ?? "",
        exportValue: (r) => r.website ?? "",
        cell: (r) =>
          r.website ? (
            <a
              href={r.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12.5px] font-semibold text-[#3f3f94] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {r.website.replace(/^https?:\/\//i, "")}
            </a>
          ) : (
            <span className="text-ink-subtle">-</span>
          ),
      },
      {
        id: "attachments",
        header: "Files",
        align: "right",
        sortValue: (r) => r.attachmentCount,
        exportValue: (r) => r.attachmentCount,
        cell: (r) =>
          r.attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums text-ink-soft">
              <Paperclip size={12} strokeWidth={2.4} className="text-ink-subtle" />
              {r.attachmentCount}
            </span>
          ) : (
            <span className="text-ink-subtle">-</span>
          ),
      },
      {
        id: "defaultCreditDays",
        header: "Credit Days",
        align: "right",
        sortValue: (r) => r.defaultCreditDays ?? -1,
        exportValue: (r) => r.defaultCreditDays ?? "",
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {r.defaultCreditDays != null ? r.defaultCreditDays : "-"}
          </span>
        ),
      },
      {
        id: "paymentTerms",
        header: "Payment Terms",
        searchable: true,
        sortValue: (r) => r.paymentTerms ?? "",
        exportValue: (r) => r.paymentTerms ?? "",
        cell: (r) =>
          r.paymentTerms ? (
            <span className="text-ink-soft">{r.paymentTerms}</span>
          ) : (
            <span className="text-ink-subtle">-</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (r) => (r.isActive ? "Active" : "Inactive"),
        exportValue: (r) => (r.isActive ? "Active" : "Inactive"),
        cell: (r) =>
          r.isActive ? (
            <span className="text-[13px] text-ink-soft">Active</span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-[rgba(15,23,42,0.05)] px-2 py-0.5 text-[11px] font-semibold text-[#8a90a0]">
              Inactive
            </span>
          ),
      },
    ],
    [basePath],
  );

  const filters = React.useMemo<FilterConfig<VendorRegisterRow>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "Active", label: "Active" },
          { value: "Inactive", label: "Inactive" },
        ],
        accessor: (r) => (r.isActive ? "Active" : "Inactive"),
      },
      {
        id: "gst",
        label: "GST",
        type: "select",
        options: [
          { value: "Has GSTIN", label: "Has GSTIN" },
          { value: "Missing", label: "Missing" },
          { value: "Not applicable", label: "Not applicable" },
        ],
        accessor: (r) =>
          !r.isGstApplicable ? "Not applicable" : r.gstin ? "Has GSTIN" : "Missing",
      },
      {
        id: "state",
        label: "State",
        type: "select",
        // Options are derived from the loaded rows so the picker only ever
        // offers states that actually appear.
        options: Array.from(
          new Set(rows.map((r) => r.state).filter((s): s is string => Boolean(s))),
        )
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
          .map((s) => ({ value: s, label: s })),
        accessor: (r) => r.state ?? "",
      },
    ],
    [rows],
  );

  const rowMenu = React.useCallback(
    (row: VendorRegisterRow): RowMenuItem<VendorRegisterRow>[] => {
      const items: RowMenuItem<VendorRegisterRow>[] = [
        {
          key: "record",
          label: "Full Record",
          Icon: FileText,
          href: `${basePath}/${row.id}` as Route,
        },
        {
          key: "edit",
          label: "Edit",
          Icon: Pencil,
          href: `${basePath}/${row.id}/edit` as Route,
        },
      ];
      if (isAdmin) {
        items.push({
          key: "toggle",
          label: row.isActive ? "Deactivate" : "Reactivate",
          Icon: Power,
          danger: row.isActive,
          onSelect: (r) => void toggleActive(r),
        });
      }
      return items;
    },
    // toggleActive is stable enough for this closure; isAdmin drives the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, basePath],
  );

  return (
    <>
      {/* Bucket strip — what is LEFT on the vendor master, at a glance. Each
          tile is a button that narrows the register below it. */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {VENDOR_VIEWS.map((v) => (
          <StatCard
            key={v}
            label={VENDOR_VIEW_META[v].label}
            sub={VENDOR_VIEW_META[v].sub}
            value={counts[v]}
            accent={VENDOR_VIEW_META[v].accent}
            selected={view === v}
            onClick={() => selectView(v)}
          />
        ))}
      </div>

      {view !== "all" && (
        <div className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-ink-subtle">
          <span>
            Showing {visibleRows.length}{" "}
            {visibleRows.length === 1 ? "vendor" : "vendors"} ·{" "}
            {VENDOR_VIEW_META[view].label}
          </span>
          <button
            type="button"
            onClick={() => selectView("all")}
            className="rounded-chip border border-hairline px-2 py-0.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94]"
          >
            Clear
          </button>
        </div>
      )}

      <RegisterDataTable<VendorRegisterRow>
        tableKey="vendors"
        rows={visibleRows}
        getRowId={(r) => r.id}
        columns={columns}
        getOpenHref={(r) => `${basePath}/${r.id}` as Route}
        getEditHref={(r) => `${basePath}/${r.id}/edit` as Route}
        filters={filters}
        exportFilename="vendors"
        showExport={false}
        rowMenu={rowMenu}
        rowMenuPlacement="left"
        {...(isAdmin
        ? {
            bulkDelete: {
              // Vendors are deactivate-only governance — the bulk bar's button
              // is relabelled so it never claims to delete a master it only
              // retires. The server action keeps `costings.vendor_id` and the
              // BO quote-matrix rows intact, so nothing is skipped for being
              // "in use"; a skip here means the row vanished or the write threw.
              label: "Deactivate selected",
              // Wording must match the server verb: this deactivates, and
              // `reactivateVendor` puts the row back, so the bulk bar must not
              // confirm with "This can't be undone." or toast "Deleted".
              noun: { one: "vendor", many: "vendors" },
              verb: {
                infinitive: "deactivate",
                progressive: "Deactivating",
                past: "Deactivated",
              },
              irreversible: false,
              Icon: Power,
              onDelete: (ids: string[]) =>
                deactivateVendorsBulk(ids).then((r) => {
                  if (!r.ok) return { ok: false, error: r.error };
                  if (r.deleted === 0) {
                    return {
                      ok: false,
                      error: `Couldn't deactivate ${r.failed} ${r.failed === 1 ? "vendor" : "vendors"}. Please try again.`,
                    };
                  }
                  // Reported through `message` so the bulk bar shows this
                  // INSTEAD of its default toast, not on top of it.
                  return {
                    ok: true,
                    message:
                      r.failed > 0
                        ? `${r.deleted} deactivated, ${r.failed} skipped (couldn't be updated).`
                        : `${r.deleted} ${r.deleted === 1 ? "vendor" : "vendors"} deactivated - existing costings keep their vendor.`,
                  };
                }),
            },
          }
        : {})}
        emptyTitle={
          view === "all"
            ? "No vendors yet — add the first one."
            : `Nothing in ${VENDOR_VIEW_META[view].label}.`
        }
        emptyHint={
          view === "all"
            ? "Use New Vendor to capture a supplier's contact, GST and commercial terms."
            : "That's the whole point — this bucket is clear. Pick another tile to see what's left."
        }
      />
    </>
  );
}

/**
 * One bucket tile: the count, its label, and (where the count is scoped) the
 * scope in plain words so nobody has to guess what it excludes. Doubles as the
 * filter control — `aria-pressed` carries the selected state for screen readers
 * and it is reachable by Tab like any button.
 */
function StatCard({
  label,
  sub,
  value,
  accent,
  selected,
  onClick,
}: {
  label: string;
  sub?: string;
  value: number;
  accent?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-2xl border bg-white px-3.5 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[#c9c9ea] hover:shadow-[0_8px_20px_-10px_rgba(63,63,148,0.4)] ${
        selected ? "border-[#3f3f94] ring-2 ring-[#3f3f94]/25" : "border-[#e5e7eb]"
      }`}
      style={{ boxShadow: selected ? undefined : "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[#9aa0ab]">
            {label}
          </div>
          {sub && (
            <div className="truncate text-[10px] font-semibold text-[#b3b8c2]">{sub}</div>
          )}
        </div>
        {selected && <Check size={14} strokeWidth={3} className="shrink-0 text-[#3f3f94]" />}
      </div>
      <div
        className="mt-1.5 text-[26px] font-bold leading-none tabular-nums"
        style={{ color: accent || selected ? "#3f3f94" : "#1f2430" }}
      >
        {value}
      </div>
    </button>
  );
}
