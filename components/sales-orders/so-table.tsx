"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { formatInr, formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import { setSalesOrderSentBulk } from "@/app/(app)/sales-orders/actions";
import type { SalesOrderListItem } from "@/lib/queries/sales-orders";

export const NEW_SALES_ORDER_ROUTE: Route = "/sales-orders/new";

interface Props {
  rows: SalesOrderListItem[];
}

function moneyText(value: string | null): string {
  if (value == null || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "-";
}

function moneyNumber(value: string | null): number {
  if (value == null || value === "") return -Infinity;
  const n = Number(value);
  return Number.isFinite(n) ? n : -Infinity;
}

/** SM snapshot of the enquiry date; legacy rows fall back to createdAt. */
function soDate(r: SalesOrderListItem): Date {
  return r.enquiryDate ?? r.createdAt;
}

/**
 * Sales Order register table - a thin config wrapper over the shared
 * RegisterDataTable. The SO has no clean status enum, so the bulk action is a
 * legit two-way SO-Sent toggle.
 */
export function SoTable({ rows }: Props) {
  const columns = React.useMemo<RegisterColumn<SalesOrderListItem>[]>(
    () => [
      {
        id: "soNo",
        header: "SO No",
        searchable: true,
        sortValue: (r) => r.soNo,
        cell: (r) => (
          <Link
            href={`/sales-orders/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.soNo}
          </Link>
        ),
      },
      {
        id: "companyName",
        header: "Company",
        searchable: true,
        sortValue: (r) => r.companyName ?? "",
        exportValue: (r) => r.companyName ?? "",
        cell: (r) => (
          <span className="text-ink-strong font-medium">
            {r.companyName ?? "-"}
          </span>
        ),
      },
      {
        id: "quotePrice",
        header: "Quote Price",
        align: "right",
        sortValue: (r) => moneyNumber(r.quotePrice),
        exportValue: (r) => (r.quotePrice == null ? null : Number(r.quotePrice)),
        cell: (r) => (
          <span className="tabular-nums text-ink-strong font-medium">
            {moneyText(r.quotePrice)}
          </span>
        ),
      },
      {
        id: "customerPoNo",
        header: "Customer PO No",
        searchable: true,
        sortValue: (r) => r.customerPoNo ?? "",
        exportValue: (r) => r.customerPoNo ?? "",
        cell: (r) => (
          <span
            className="block max-w-[220px] truncate text-ink-soft"
            title={r.customerPoNo ?? undefined}
          >
            {r.customerPoNo ?? "-"}
          </span>
        ),
      },
      {
        id: "customerSoSent",
        header: "SO Sent",
        sortValue: (r) => (r.customerSoSent ? 1 : 0),
        exportValue: (r) => (r.customerSoSent ? "Yes" : "No"),
        cell: (r) =>
          r.customerSoSent ? (
            <Chip label="Yes" tone="green" />
          ) : (
            <span className="text-[13px] font-semibold text-ink-subtle">No</span>
          ),
      },
      {
        id: "enquiryDate",
        header: "Enquiry Date",
        defaultHidden: true,
        sortValue: (r) => soDate(r),
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {formatDate(soDate(r))}
          </span>
        ),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<SalesOrderListItem>[]>(
    () => [
      {
        id: "customerSoSent",
        label: "SO sent",
        type: "select",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
        ],
        accessor: (r) => (r.customerSoSent ? "Yes" : "No"),
      },
      {
        id: "enquiryDate",
        label: "Enquiry date",
        type: "dateRange",
        accessor: (r) => soDate(r),
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<SalesOrderListItem>
      tableKey="sales-orders"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/sales-orders/${r.id}` as Route}
      filters={filters}
      exportFilename="sales-orders"
      bulkAction={{
        label: "Set SO Sent",
        options: [
          { value: "yes", label: "Sent" },
          { value: "no", label: "Not Sent" },
        ],
        onApply: (ids, value) => setSalesOrderSentBulk(ids, value),
      }}
      emptyTitle="No sales orders yet - record the first one."
      emptyHint="The customer PO and SO documents recorded against each quote appear here."
    />
  );
}
