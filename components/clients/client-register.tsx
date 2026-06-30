"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { formatDate } from "@/lib/format";
import {
  RegisterDataTable,
  type RegisterColumn,
} from "@/components/registers/register-data-table";
import { ClientQuickView } from "@/components/clients/client-quick-view";
import type { ClientRegisterRow } from "@/lib/queries/clients";

interface Props {
  rows: ClientRegisterRow[];
  isAdmin: boolean;
}

/**
 * Client Master register — KPI stat row + advanced RegisterDataTable, mirroring
 * the Item Master register. Row click opens an instant quick-view popup; the
 * dedicated header "Export to Excel" is the single export (toolbar export off).
 */
export function ClientRegister({ rows, isAdmin }: Props) {
  const [quickView, setQuickView] = React.useState<ClientRegisterRow | null>(
    null,
  );

  const stats = React.useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.isActive).length;
    const withGstin = rows.filter((r) => Boolean(r.gstin)).length;
    const exportClients = rows.filter((r) => r.isExport === true).length;
    return {
      total,
      active,
      inactive: total - active,
      withGstin,
      exportClients,
    };
  }, [rows]);

  const columns = React.useMemo<RegisterColumn<ClientRegisterRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        searchable: true,
        sortValue: (r) => r.name,
        cell: (r) => (
          <Link
            href={`/clients/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
          >
            {r.name}
          </Link>
        ),
      },
      {
        id: "clientCode",
        header: "Client Code",
        searchable: true,
        sortValue: (r) => r.clientCode ?? "",
        cell: (r) => (
          <span
            className="text-ink-soft"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.clientCode ?? "—"}
          </span>
        ),
      },
      {
        id: "city",
        header: "City",
        searchable: true,
        sortValue: (r) => r.city ?? "",
        cell: (r) => (
          <span className="text-ink-soft">{r.city ?? "—"}</span>
        ),
      },
      {
        id: "state",
        header: "State",
        searchable: true,
        sortValue: (r) => r.state ?? "",
        cell: (r) => (
          <span className="text-ink-soft text-[12.5px]">{r.state ?? "—"}</span>
        ),
      },
      {
        id: "gstin",
        header: "GSTIN",
        searchable: true,
        sortValue: (r) => r.gstin ?? "",
        cell: (r) => (
          <span className="text-ink-soft tabular-nums text-[12.5px]">
            {r.gstin ?? "—"}
          </span>
        ),
      },
      {
        id: "customerType",
        header: "Customer Type",
        sortValue: (r) => r.customerTypeNames.join(", "),
        exportValue: (r) => r.customerTypeNames.join(", "),
        cell: (r) =>
          r.customerTypeNames.length > 0 ? (
            <span
              className="block max-w-[28ch] truncate text-ink-soft text-[12.5px]"
              title={r.customerTypeNames.join(", ")}
            >
              {r.customerTypeNames.join(", ")}
            </span>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      {
        id: "industryType",
        header: "Industry Type",
        sortValue: (r) => r.industryTypeNames.join(", "),
        exportValue: (r) => r.industryTypeNames.join(", "),
        cell: (r) =>
          r.industryTypeNames.length > 0 ? (
            <span
              className="block max-w-[28ch] truncate text-ink-soft text-[12.5px]"
              title={r.industryTypeNames.join(", ")}
            >
              {r.industryTypeNames.join(", ")}
            </span>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      {
        id: "creditDays",
        header: "Credit Days",
        align: "right",
        sortValue: (r) => r.creditDays ?? -1,
        exportValue: (r) => (r.creditDays != null ? r.creditDays : ""),
        cell: (r) => (
          <span className="text-ink-soft tabular-nums">
            {r.creditDays != null ? r.creditDays : "—"}
          </span>
        ),
      },
      {
        id: "isActive",
        header: "Status",
        sortValue: (r) => (r.isActive ? "Active" : "Inactive"),
        exportValue: (r) => (r.isActive ? "Active" : "Inactive"),
        cell: (r) =>
          r.isActive ? (
            <span className="text-ink-soft text-[12.5px]">Active</span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-[rgba(15,23,42,0.05)] px-2 py-0.5 text-[11px] font-semibold text-ink-subtle">
              Inactive
            </span>
          ),
      },
      {
        id: "createdAt",
        header: "Created",
        sortValue: (r) => r.createdAt,
        cell: (r) => (
          <span className="tabular-nums text-ink-soft text-[12.5px]">
            {formatDate(r.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Clients" value={stats.total} accent />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Inactive" value={stats.inactive} />
        <StatCard label="With GSTIN" value={stats.withGstin} />
        <StatCard label="Export Clients" value={stats.exportClients} />
      </div>

      <RegisterDataTable<ClientRegisterRow>
        tableKey="clients"
        rows={rows}
        getRowId={(r) => r.id}
        columns={columns}
        getOpenHref={(r) => `/clients/${r.id}` as Route}
        onRowOpen={(r) => setQuickView(r)}
        getEditHref={(r) => `/clients/${r.id}/edit` as Route}
        exportFilename="client-master"
        showExport={false}
        emptyTitle="No clients yet — onboard the first one."
        emptyHint="Use New client to capture KYC, or Bulk upload to import a sheet."
      />

      {quickView && (
        <ClientQuickView
          client={quickView}
          isAdmin={isAdmin}
          onClose={() => setQuickView(null)}
        />
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-section border border-hairline bg-surface-card px-4 py-3.5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="text-[11px] uppercase tracking-[0.10em] font-bold text-ink-subtle">
        {label}
      </div>
      <div
        className="mt-1.5 text-[28px] font-bold leading-none tabular-nums"
        style={{ color: accent ? "var(--color-brand)" : "var(--color-ink-strong)" }}
      >
        {value}
      </div>
    </div>
  );
}
