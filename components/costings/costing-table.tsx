"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
// Route used for typed href in columns
import {
  COSTING_ROUTE_LABELS,
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
} from "@/db/enums";
import { formatInr, formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import type { CostingListItem } from "@/lib/queries/costings";

interface Props {
  rows: CostingListItem[];
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

/**
 * Costing register table -- thin config wrapper over RegisterDataTable.
 * Columns: SM, Product, Route, Final Cost/pc, Quote Value, Status, Date.
 */
export function CostingTable({ rows }: Props) {
  const columns = React.useMemo<RegisterColumn<CostingListItem>[]>(
    () => [
      {
        id: "smNumber",
        header: "SM",
        searchable: true,
        sortValue: (r) => r.smNumber ?? "",
        exportValue: (r) => r.smNumber ?? "",
        cell: (r) => (
          <Link
            href={`/costings/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.smNumber ?? "-"}
          </Link>
        ),
      },
      {
        id: "custProductName",
        header: "Product",
        searchable: true,
        sortValue: (r) => r.custProductName ?? "",
        exportValue: (r) => r.custProductName ?? "",
        cell: (r) => (
          <span
            className="block max-w-[240px] truncate text-ink-soft"
            title={r.custProductName ?? undefined}
          >
            {r.custProductName ?? "-"}
          </span>
        ),
      },
      {
        id: "companyName",
        header: "Company",
        searchable: true,
        sortValue: (r) => r.companyName ?? "",
        exportValue: (r) => r.companyName ?? "",
        cell: (r) => (
          <span className="text-ink-soft">{r.companyName ?? "-"}</span>
        ),
      },
      {
        id: "costingType",
        header: "Route",
        sortValue: (r) => COSTING_ROUTE_LABELS[r.costingType],
        exportValue: (r) => COSTING_ROUTE_LABELS[r.costingType],
        cell: (r) => (
          <span className="text-[13px] font-medium text-ink-soft">
            {COSTING_ROUTE_LABELS[r.costingType]}
          </span>
        ),
      },
      {
        id: "finalCostPerPiece",
        header: "Final Cost / pc",
        align: "right",
        sortValue: (r) => moneyNumber(r.finalCostPerPiece),
        exportValue: (r) =>
          r.finalCostPerPiece == null ? null : Number(r.finalCostPerPiece),
        cell: (r) => (
          <span className="tabular-nums text-ink-strong font-semibold">
            {moneyText(r.finalCostPerPiece)}
          </span>
        ),
      },
      {
        id: "quoteValue",
        header: "Quote Value",
        align: "right",
        sortValue: (r) => moneyNumber(r.quoteValue),
        exportValue: (r) =>
          r.quoteValue == null ? null : Number(r.quoteValue),
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {moneyText(r.quoteValue)}
          </span>
        ),
      },
      {
        id: "costingDoneStatus",
        header: "Status",
        sortValue: (r) => COSTING_DONE_STATUS_LABELS[r.costingDoneStatus],
        cell: (r) => (
          <Chip
            label={COSTING_DONE_STATUS_LABELS[r.costingDoneStatus]}
            tone={COSTING_DONE_STATUS_COLORS[r.costingDoneStatus]}
          />
        ),
      },
      {
        id: "createdAt",
        header: "Date",
        sortValue: (r) => r.createdAt,
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {formatDate(r.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<CostingListItem>[]>(
    () => [
      {
        id: "costingType",
        label: "Route",
        type: "select",
        options: (["inhouse", "bought_out"] as const).map((r) => ({
          value: COSTING_ROUTE_LABELS[r],
          label: COSTING_ROUTE_LABELS[r],
        })),
        accessor: (r) => COSTING_ROUTE_LABELS[r.costingType],
      },
      {
        id: "costingDoneStatus",
        label: "Status",
        type: "select",
        options: COSTING_DONE_STATUSES.map((s) => ({
          value: COSTING_DONE_STATUS_LABELS[s],
          label: COSTING_DONE_STATUS_LABELS[s],
        })),
        accessor: (r) => COSTING_DONE_STATUS_LABELS[r.costingDoneStatus],
      },
      {
        id: "createdAt",
        label: "Date",
        type: "dateRange",
        accessor: (r) => r.createdAt,
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<CostingListItem>
      tableKey="costings"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/costings/${r.id}` as Route}
      filters={filters}
      exportFilename="costings"
      emptyTitle="No costings yet -- run the first one."
      emptyHint="In-house and bought-out costings appear here with their SM, product, route and final cost per piece."
    />
  );
}
