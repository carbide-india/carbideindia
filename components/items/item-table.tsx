"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { COSTING_TYPE_LABELS } from "@/db/enums";
import { formatDate } from "@/lib/format";
import {
  RegisterDataTable,
  type RegisterColumn,
} from "@/components/registers/register-data-table";
import type { ItemListItem } from "@/lib/queries/items";

export const NEW_ITEM_ROUTE = "/items/new" as Route;

interface Props {
  rows: ItemListItem[];
}

/**
 * Item Master register table — thin config wrapper over RegisterDataTable.
 * Columns: Item Code, Customer, Product, Part No, Costing Type, Created.
 */
export function ItemTable({ rows }: Props) {
  const columns = React.useMemo<RegisterColumn<ItemListItem>[]>(
    () => [
      {
        id: "itemCode",
        header: "Item Code",
        searchable: true,
        sortValue: (r) => r.itemCode,
        cell: (r) => (
          <Link
            href={`/items/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.itemCode}
          </Link>
        ),
      },
      {
        id: "customerName",
        header: "Customer",
        searchable: true,
        sortValue: (r) => r.customerName ?? "",
        cell: (r) => (
          <span className="text-ink-strong font-medium">
            {r.customerName ?? "—"}
          </span>
        ),
      },
      {
        id: "custProductName",
        header: "Product",
        searchable: true,
        sortValue: (r) => r.custProductName ?? "",
        cell: (r) => (
          <span
            className="block max-w-[48ch] truncate text-ink-soft"
            title={r.custProductName ?? undefined}
          >
            {r.custProductName ?? "—"}
          </span>
        ),
      },
      {
        id: "partNo",
        header: "Part No",
        searchable: true,
        sortValue: (r) => r.partNo ?? "",
        cell: (r) => (
          <span className="text-ink-soft tabular-nums">{r.partNo ?? "—"}</span>
        ),
      },
      {
        id: "costingType",
        header: "Costing Type",
        sortValue: (r) => r.costingType ?? "",
        exportValue: (r) =>
          r.costingType ? COSTING_TYPE_LABELS[r.costingType] : "",
        cell: (r) =>
          r.costingType ? (
            <span className="text-ink-soft text-[12.5px]">
              {COSTING_TYPE_LABELS[r.costingType]}
            </span>
          ) : (
            <span className="text-ink-subtle">—</span>
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
    <RegisterDataTable<ItemListItem>
      tableKey="items"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/items/${r.id}` as Route}
      exportFilename="item-master"
      emptyTitle="No items yet — create the first one."
      emptyHint="Each item gets a unique internal code assembled from shape, grade and size."
    />
  );
}
