"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Factory, Trash2, UserRound } from "lucide-react";
import { formatInr, formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
  type RowMenuItem,
} from "@/components/registers/register-data-table";
import { fireToast } from "@/lib/toast";
import {
  setSalesOrderSentBulk,
  setProductionSoSentBulk,
  setSalesOrderStatusBulk,
  deleteSalesOrder,
  deleteSalesOrdersBulk,
} from "@/app/(app)/sales-orders/actions";
import type { SalesOrderListItem } from "@/lib/queries/sales-orders";
import {
  SALES_ORDER_STAGE_BUCKETS,
  SALES_ORDER_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
} from "@/db/enums";

export const NEW_SALES_ORDER_ROUTE: Route = "/sales-orders/new";

interface Props {
  rows: SalesOrderListItem[];
  /** Rendered inside the toolbar row — see RegisterHeading. */
  heading?: React.ReactNode;
  /** The page's primary action, at the end of the toolbar row. */
  actions?: React.ReactNode;
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
export function SoTable({ rows, heading, actions }: Props) {
  const router = useRouter();

  // Per-row actions menu: Open + a destructive Delete. Delete is a HARD delete
  // (sales orders have no record-level recycle bin), so it confirms first and
  // the server action refuses when a job card / production order / dispatch /
  // invoice was built from it (directly or through one of its lines).
  const rowMenu = React.useCallback(
    (r: SalesOrderListItem): RowMenuItem<SalesOrderListItem>[] => [
      {
        key: "open",
        label: "Open",
        Icon: ArrowUpRight,
        href: `/sales-orders/${r.id}` as Route,
      },
      // The two outputs, straight from the register row.
      {
        key: "customer-copy",
        label: "Customer copy",
        Icon: UserRound,
        href: `/sales-orders/${r.id}/customer-copy` as Route,
      },
      {
        key: "factory-copy",
        label: "Factory copy (internal)",
        Icon: Factory,
        href: `/sales-orders/${r.id}/factory-copy` as Route,
      },
      {
        key: "delete",
        label: "Delete",
        Icon: Trash2,
        danger: true,
        onSelect: async (row) => {
          if (
            !window.confirm(
              `Delete sales order ${row.soNo}? This can't be undone.`,
            )
          ) {
            return;
          }
          const res = await deleteSalesOrder(row.id);
          if (res.ok) {
            fireToast({ message: `Deleted ${row.soNo}.` });
            router.refresh();
          } else {
            fireToast({ message: res.error, type: "error" });
          }
        },
      },
    ],
    [router],
  );

  const columns = React.useMemo<RegisterColumn<SalesOrderListItem>[]>(
    () => [
      {
        id: "soNo",
        width: "110px",
        pinnedLeft: true,
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
        width: "190px",
        pinnedLeft: true,
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
        id: "salesOrderStatus",
        header: "Stage",
        sortValue: (r) => SALES_ORDER_STAGE_BUCKETS.indexOf(r.salesOrderStatus),
        exportValue: (r) => SALES_ORDER_STATUS_LABELS[r.salesOrderStatus],
        cell: (r) => (
          <Chip
            label={SALES_ORDER_STATUS_LABELS[r.salesOrderStatus]}
            tone={SALES_ORDER_STATUS_COLORS[r.salesOrderStatus]}
          />
        ),
      },
      // The two outputs, side by side. Independent flags on purpose: an order
      // can be confirmed to the customer while the shop floor is still waiting.
      {
        id: "customerSoSent",
        header: "Customer Copy",
        sortValue: (r) => (r.customerSoSent ? 1 : 0),
        exportValue: (r) => (r.customerSoSent ? "Sent" : "Pending"),
        cell: (r) =>
          r.customerSoSent ? (
            <Chip label="Sent" tone="green" />
          ) : (
            <span className="text-[13px] font-semibold text-ink-subtle">
              Pending
            </span>
          ),
      },
      {
        id: "productionSoSent",
        header: "Factory Copy",
        sortValue: (r) => (r.productionSoSent ? 1 : 0),
        exportValue: (r) => (r.productionSoSent ? "Sent" : "Pending"),
        cell: (r) =>
          r.productionSoSent ? (
            <Chip label="Sent" tone="green" />
          ) : (
            <span className="text-[13px] font-semibold text-ink-subtle">
              Pending
            </span>
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
      { id: "companyName", label: "Company", type: "select" },
      { id: "salesOrderStatus", label: "Status", type: "select" },
      {
        id: "customerSoSent",
        label: "Customer copy",
        type: "select",
        options: [
          { value: "Sent", label: "Sent" },
          { value: "Pending", label: "Pending" },
        ],
        accessor: (r) => (r.customerSoSent ? "Sent" : "Pending"),
      },
      {
        id: "productionSoSent",
        label: "Factory copy",
        type: "select",
        options: [
          { value: "Sent", label: "Sent" },
          { value: "Pending", label: "Pending" },
        ],
        accessor: (r) => (r.productionSoSent ? "Sent" : "Pending"),
      },
      {
        id: "enquiryDate",
        label: "Enquiry date",
        type: "period",
        accessor: (r) => soDate(r),
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<SalesOrderListItem>
      tableKey="sales-orders"
      rows={rows}
      heading={heading}
      actions={actions}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/sales-orders/${r.id}` as Route}
      filters={filters}
      exportFilename="sales-orders"
      rowMenu={rowMenu}
      bulkActions={[
        {
          label: "Set Stage",
          options: SALES_ORDER_STAGE_BUCKETS.map((b) => ({
            value: b,
            label: SALES_ORDER_STATUS_LABELS[b],
          })),
          onApply: (ids, value) => setSalesOrderStatusBulk(ids, value),
        },
        {
          label: "Customer Copy",
          options: [
            { value: "yes", label: "Sent" },
            { value: "no", label: "Pending" },
          ],
          onApply: (ids, value) => setSalesOrderSentBulk(ids, value),
        },
        {
          label: "Factory Copy",
          options: [
            { value: "yes", label: "Sent" },
            { value: "no", label: "Pending" },
          ],
          onApply: (ids, value) => setProductionSoSentBulk(ids, value),
        },
      ]}
      bulkDelete={{
        noun: { one: "sales order", many: "sales orders" },
        onDelete: async (ids) => {
          const res = await deleteSalesOrdersBulk(ids);
          if (!res.ok) return { ok: false, error: res.error };
          if (res.failed > 0) {
            // Partial run: report the real split via `message`. The bar's
            // default toast counts the SELECTION and would claim rows the
            // reference guard actually left in place.
            const why =
              "skipped (in use by a job card / production order / dispatch / invoice)";
            return res.deleted === 0
              ? { ok: false, error: `Nothing deleted - ${res.failed} ${why}.` }
              : {
                  ok: true,
                  message: `${res.deleted} deleted, ${res.failed} ${why}.`,
                };
          }
          return { ok: true };
        },
      }}
      emptyTitle="No sales orders yet - record the first one."
      emptyHint="The customer PO and SO documents recorded against each quote appear here."
    />
  );
}
