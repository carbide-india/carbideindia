"use client";

import * as React from "react";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface WbColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Provide a string for this row+column to enable client-side text filtering. */
  filterValue?: (row: T) => string;
  /** Provide a comparable value to enable click-to-sort on this column. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
}

interface WorkbenchTableProps<T> {
  rows: T[];
  columns: WbColumn<T>[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  emptyText?: string;
  className?: string;
}

type SortDir = "asc" | "desc";

/**
 * Generic, dense, presentational data table: a header row, a second row of
 * per-column filter inputs (only for columns with `filterValue`), click-to-sort
 * on columns with `sortValue`, and a paginated footer. Client-side only.
 */
export function WorkbenchTable<T>({
  rows,
  columns,
  getRowId,
  onRowClick,
  pageSizeOptions = [5, 10, 25, 50],
  initialPageSize = 10,
  emptyText = "No records.",
  className,
}: WorkbenchTableProps<T>) {
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const [page, setPage] = React.useState(0);

  const hasFilterRow = columns.some((c) => c.filterValue);

  // Filter across every active column filter combined (AND).
  const filtered = React.useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim() !== "");
    if (active.length === 0) return rows;
    return rows.filter((row) =>
      active.every(([key, term]) => {
        const col = columns.find((c) => c.key === key);
        if (!col?.filterValue) return true;
        return col
          .filterValue(row)
          .toLowerCase()
          .includes(term.trim().toLowerCase());
      }),
    );
  }, [rows, columns, filters]);

  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const getter = col.sortValue;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, columns, sortKey, sortDir]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  // Reset to first page whenever filters / sort / page size shrink the view.
  React.useEffect(() => {
    setPage(0);
  }, [filters, sortKey, sortDir, pageSize]);

  function toggleSort(col: WbColumn<T>) {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  function setColumnFilter(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-x-auto rounded-chip border border-hairline">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-surface-soft">
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      "px-3 py-2 font-semibold text-ink-soft border-b border-hairline whitespace-nowrap",
                      col.align === "right" ? "text-right" : "text-left",
                      col.sortValue && "cursor-pointer select-none hover:text-ink-strong",
                    )}
                    onClick={col.sortValue ? () => toggleSort(col) : undefined}
                    aria-sort={
                      isSorted
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        col.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {col.header}
                      {col.sortValue ? (
                        isSorted ? (
                          sortDir === "asc" ? (
                            <ChevronUp size={13} strokeWidth={2.4} className="text-brand" />
                          ) : (
                            <ChevronDown size={13} strokeWidth={2.4} className="text-brand" />
                          )
                        ) : (
                          <ChevronsUpDownGhost />
                        )
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
            {hasFilterRow ? (
              <tr className="bg-surface-card">
                {columns.map((col) => {
                  const val = filters[col.key] ?? "";
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className="px-2 py-1.5 border-b border-hairline align-middle"
                    >
                      {col.filterValue ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => setColumnFilter(col.key, e.target.value)}
                            placeholder="Filter…"
                            aria-label={`Filter by ${col.header}`}
                            className={cn(
                              "w-full h-7 rounded-chip border border-hairline-strong bg-surface-card",
                              "pl-2.5 pr-6 text-[12px] text-ink-strong outline-none transition-all",
                              "placeholder:text-ink-subtle",
                              "focus:border-brand focus:ring-2 focus:ring-brand/20",
                            )}
                          />
                          {val ? (
                            <button
                              type="button"
                              onClick={() => setColumnFilter(col.key, "")}
                              aria-label={`Clear ${col.header} filter`}
                              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-chip text-ink-subtle hover:text-ink-strong hover:bg-surface-soft"
                            >
                              <X size={13} strokeWidth={2.4} />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, columns.length)}
                  className="px-3 py-8 text-center text-[13px] text-ink-subtle"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-hairline last:border-b-0",
                    idx % 2 === 1 && "bg-surface-soft/50",
                    onRowClick && "cursor-pointer hover:bg-brand/[0.05]",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2 text-ink-strong align-middle",
                        col.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-soft">
        <span className="font-medium">
          Page {total === 0 ? 0 : safePage + 1} of {pageCount}
        </span>

        <span className="inline-flex items-center gap-1.5">
          <span className="text-ink-subtle">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className={cn(
              "h-7 rounded-chip border border-hairline-strong bg-surface-card px-1.5 text-[12px] text-ink-strong outline-none",
              "focus:border-brand focus:ring-2 focus:ring-brand/20",
            )}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </span>

        <span className="text-ink-subtle">{total} total</span>

        <div className="ml-auto inline-flex items-center gap-1">
          <PagerButton
            ariaLabel="First page"
            disabled={safePage === 0}
            onClick={() => setPage(0)}
          >
            <ChevronsLeft size={15} strokeWidth={2.2} />
          </PagerButton>
          <PagerButton
            ariaLabel="Previous page"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={15} strokeWidth={2.2} />
          </PagerButton>
          <PagerButton
            ariaLabel="Next page"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight size={15} strokeWidth={2.2} />
          </PagerButton>
          <PagerButton
            ariaLabel="Last page"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(pageCount - 1)}
          >
            <ChevronsRight size={15} strokeWidth={2.2} />
          </PagerButton>
        </div>
      </div>
    </div>
  );
}

function PagerButton({
  children,
  ariaLabel,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-chip border border-hairline-strong bg-surface-card text-ink-soft transition-all",
        "hover:border-brand/40 hover:text-ink-strong",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-hairline-strong disabled:hover:text-ink-soft",
      )}
    >
      {children}
    </button>
  );
}

/** Faint up/down hint shown on sortable-but-unsorted column headers. */
function ChevronsUpDownGhost() {
  return (
    <span className="inline-flex flex-col -space-y-1 text-ink-subtle/50">
      <ChevronUp size={11} strokeWidth={2.4} />
      <ChevronDown size={11} strokeWidth={2.4} />
    </span>
  );
}
