"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Pencil, Power, FileText } from "lucide-react";
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
    ],
    [],
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
    <RegisterDataTable<VendorRegisterRow>
      tableKey="vendors"
      rows={rows}
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
      emptyTitle="No vendors yet — add the first one."
      emptyHint="Use New vendor to capture a supplier's contact and commercial terms."
    />
  );
}
