"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
  type SortingState,
  type RowSelectionState,
  type Table as TableInstance,
  type Row,
} from "@tanstack/react-table";
import {
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Download,
  ArrowUpRight,
  Pencil,
  Check,
  Rows3,
  Rows4,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { fireToast } from "@/lib/toast";
import { exportRowsToCsv } from "@/lib/registers/export-rows";
import { cn } from "@/lib/utils";

/*
 * RegisterDataTable — the shared advanced data-table for all six Carbide sales
 * registers (Enquiries, Samples, Quotations, Negotiations, Sales Orders,
 * Meetings). Driven entirely by a per-register config (columns + filters +
 * bulk action). The look matches the house register language: a rounded card
 * wrapper, hairline borders, an uppercase tracked header, chip / mono-link
 * cells supplied by the caller's `cell()` render functions, and a friendly
 * empty state.
 *
 * SIZING NOTE: all of sort / global-search / faceted-filter / paginate run
 * CLIENT-SIDE over the rows already loaded into the page (registers currently
 * fetch the full filtered set). That's instant for the few-hundred-row
 * registers we have today. For very large registers we'd move filtering +
 * pagination to the server and feed this component a single page of rows plus a
 * total count — the config surface wouldn't need to change.
 *
 * Per-register SERVER filters (owned by the page via nuqs URL params) and this
 * component's CLIENT filters are independent: the page narrows what's fetched;
 * these toolbar filters narrow the loaded rows in the browser.
 */

// ---------------------------------------------------------------------------
// Public config types
// ---------------------------------------------------------------------------

export interface RegisterColumn<TRow> {
  id: string;
  header: string;
  /** Rendered node for the cell (chips, mono links, plain text, …). */
  cell: (row: TRow) => React.ReactNode;
  /** Comparable value used for sorting + as the default search/export value. */
  sortValue?: (row: TRow) => string | number | Date;
  /** Value emitted to CSV. Falls back to sortValue, then the column header text. */
  exportValue?: (row: TRow) => string | number | null;
  /** Include this column's sortValue/exportValue in the global search. */
  searchable?: boolean;
  /** Start hidden in the column menu (still toggleable on). */
  defaultHidden?: boolean;
  /** Default true. Set false to disable click-to-sort on the header. */
  enableSorting?: boolean;
  align?: "left" | "right";
}

export interface FilterConfig<TRow> {
  id: string;
  label: string;
  type: "select" | "dateRange";
  /** For `select` filters: the choosable values (value matched against the column's string sortValue). */
  options?: { value: string; label: string }[];
  /**
   * Value getter for this filter's column. For `select` the returned string is
   * compared to the chosen option value; for `dateRange` it must return a Date
   * (or null) compared against the from/to bounds. Defaults to the matching
   * column's sortValue when `id` matches a column id.
   */
  accessor?: (row: TRow) => string | Date | null;
}

export interface BulkActionConfig {
  label: string;
  options: { value: string; label: string }[];
  onApply: (ids: string[], value: string) => Promise<{ ok: boolean; error?: string }>;
}

export interface RegisterDataTableProps<TRow> {
  /** Stable key used to namespace localStorage persistence (cols + density). */
  tableKey: string;
  rows: TRow[];
  getRowId: (row: TRow) => string;
  columns: RegisterColumn<TRow>[];
  getOpenHref: (row: TRow) => Route;
  getEditHref?: (row: TRow) => Route;
  filters?: FilterConfig<TRow>[];
  /** Base filename for CSV export (date is appended; ".csv" added automatically). */
  exportFilename: string;
  bulkAction?: BulkActionConfig;
  emptyTitle: string;
  emptyHint?: string;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
type Density = "comfortable" | "compact";

interface Persisted {
  columnVisibility?: VisibilityState;
  density?: Density;
}

function storageKey(tableKey: string): string {
  return `carbide.register.${tableKey}.cols`;
}

/** Coerce a sortValue/accessor result to a lowercase string for search/compare. */
function asText(v: string | number | Date | null | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v);
}

function asDate(v: string | number | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function RegisterDataTable<TRow>({
  tableKey,
  rows,
  getRowId,
  columns,
  getOpenHref,
  getEditHref,
  filters = [],
  exportFilename,
  bulkAction,
  emptyTitle,
  emptyHint,
}: RegisterDataTableProps<TRow>) {
  const router = useRouter();

  // -- Persistence (column visibility + density). Start with config defaults
  //    on both server + first client render to avoid hydration mismatch, then
  //    hydrate the saved choice after mount. -----------------------------------
  const defaultVisibility = React.useMemo<VisibilityState>(() => {
    const v: VisibilityState = {};
    for (const c of columns) if (c.defaultHidden) v[c.id] = false;
    return v;
  }, [columns]);

  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(defaultVisibility);
  const [density, setDensity] = React.useState<Density>("comfortable");

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(tableKey));
      if (!raw) return;
      const saved = JSON.parse(raw) as Persisted;
      if (saved.columnVisibility) setColumnVisibility(saved.columnVisibility);
      if (saved.density) setDensity(saved.density);
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, [tableKey]);

  React.useEffect(() => {
    try {
      const payload: Persisted = { columnVisibility, density };
      localStorage.setItem(storageKey(tableKey), JSON.stringify(payload));
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [tableKey, columnVisibility, density]);

  // -- Global search + faceted filters (client-side state) --------------------
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // select filter id -> chosen value (""/undefined = all); dateRange id -> {from,to}
  const [selectFilters, setSelectFilters] = React.useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = React.useState<
    Record<string, { from: string; to: string }>
  >({});

  // Map a column id to its sortValue getter, for filter accessors that omit one.
  const colSortValue = React.useMemo(() => {
    const m = new Map<string, (row: TRow) => string | number | Date>();
    for (const c of columns) if (c.sortValue) m.set(c.id, c.sortValue);
    return m;
  }, [columns]);

  function filterAccessor(f: FilterConfig<TRow>): (row: TRow) => string | Date | null {
    if (f.accessor) return f.accessor;
    const sv = colSortValue.get(f.id);
    return sv ? (row) => sv(row) as string | Date : () => null;
  }

  const searchableCols = React.useMemo(
    () => columns.filter((c) => c.searchable),
    [columns],
  );

  // Pre-filter rows in the browser before handing them to TanStack. (Global
  // search + faceted select + date-range all live here so the table model only
  // ever sees the rows that should be visible.)
  const filteredRows = React.useMemo(() => {
    let out = rows;

    if (debouncedQuery) {
      out = out.filter((r) =>
        searchableCols.some((c) => {
          const v = c.sortValue ? c.sortValue(r) : undefined;
          return asText(v).toLowerCase().includes(debouncedQuery);
        }),
      );
    }

    for (const f of filters) {
      if (f.type === "select") {
        const chosen = selectFilters[f.id];
        if (!chosen) continue;
        const acc = filterAccessor(f);
        out = out.filter((r) => asText(acc(r) as string) === chosen);
      } else {
        const range = dateFilters[f.id];
        if (!range || (!range.from && !range.to)) continue;
        const from = range.from ? new Date(range.from) : null;
        const to = range.to ? new Date(`${range.to}T23:59:59.999`) : null;
        const acc = filterAccessor(f);
        out = out.filter((r) => {
          const d = asDate(acc(r) as Date | string | null);
          if (!d) return false;
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }
    }

    return out;
    // filterAccessor is derived from columns/filters which are deps already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, debouncedQuery, searchableCols, filters, selectFilters, dateFilters]);

  // -- Build TanStack column defs from the register config --------------------
  const tableColumns = React.useMemo<ColumnDef<TRow>[]>(() => {
    const select: ColumnDef<TRow> = {
      id: "__select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={(v) => table.toggleAllPageRowsSelected(v)}
          ariaLabel="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onChange={(v) => row.toggleSelected(v)}
          ariaLabel="Select row"
        />
      ),
    };

    const body: ColumnDef<TRow>[] = columns.map((c) => ({
      id: c.id,
      enableHiding: true,
      enableSorting: c.enableSorting !== false && Boolean(c.sortValue),
      accessorFn: c.sortValue ? (row) => c.sortValue!(row) : undefined,
      header: c.header,
      sortingFn: (a: Row<TRow>, b: Row<TRow>) => {
        const va = c.sortValue!(a.original);
        const vb = c.sortValue!(b.original);
        if (va instanceof Date || vb instanceof Date) {
          return asDate(va as Date)!.getTime() - asDate(vb as Date)!.getTime();
        }
        if (typeof va === "number" && typeof vb === "number") return va - vb;
        return asText(va).localeCompare(asText(vb), undefined, { sensitivity: "base" });
      },
      cell: ({ row }) => c.cell(row.original),
      meta: { align: c.align ?? "left" },
    }));

    const actions: ColumnDef<TRow> = {
      id: "__actions",
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Row actions</span>,
      cell: ({ row }) => (
        <RowActions
          openHref={getOpenHref(row.original)}
          editHref={getEditHref?.(row.original)}
        />
      ),
    };

    return [select, ...body, actions];
  }, [columns, getOpenHref, getEditHref]);

  // -- TanStack table instance ------------------------------------------------
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pageSize, setPageSize] = React.useState<number>(DEFAULT_PAGE_SIZE);

  const table = useReactTable({
    data: filteredRows,
    columns: tableColumns,
    state: { columnVisibility, sorting, rowSelection },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE } },
    autoResetPageIndex: false,
  });

  React.useEffect(() => {
    table.setPageSize(pageSize);
    table.setPageIndex(0);
  }, [pageSize, table]);

  // A new search / filter resets to the first page.
  React.useEffect(() => {
    table.setPageIndex(0);
  }, [debouncedQuery, selectFilters, dateFilters, table]);

  // Clamp the page when the loaded rows shrink (refresh / filter).
  React.useEffect(() => {
    const maxIndex = Math.max(0, Math.ceil(filteredRows.length / pageSize) - 1);
    if (table.getState().pagination.pageIndex > maxIndex) table.setPageIndex(maxIndex);
  }, [filteredRows, table, pageSize]);

  const totalFiltered = table.getPrePaginationRowModel().rows.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const rangeStart = totalFiltered === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min(totalFiltered, (pageIndex + 1) * pageSize);
  const showPager = totalFiltered > PAGE_SIZE_OPTIONS[0];

  const selectedIds = table.getSelectedRowModel().rows.map((r) => r.id);

  const hasActiveFilters =
    Boolean(debouncedQuery) ||
    Object.values(selectFilters).some(Boolean) ||
    Object.values(dateFilters).some((r) => r.from || r.to);

  function clearFilters() {
    setQuery("");
    setSelectFilters({});
    setDateFilters({});
  }

  // -- Export (current filtered + sorted + visible columns) -------------------
  function buildExportRows(rowModelRows: Row<TRow>[]): {
    headers: string[];
    body: (string | number | null)[][];
  } {
    const visible = columns.filter(
      (c) => columnVisibility[c.id] !== false,
    );
    const headers = visible.map((c) => c.header);
    const body = rowModelRows.map((r) =>
      visible.map((c) => {
        if (c.exportValue) return c.exportValue(r.original);
        if (c.sortValue) {
          const v = c.sortValue(r.original);
          return v instanceof Date ? asText(v) : (v as string | number);
        }
        return null;
      }),
    );
    return { headers, body };
  }

  function exportAll() {
    const { headers, body } = buildExportRows(table.getSortedRowModel().rows);
    const filename = `${exportFilename}-${new Date().toISOString().slice(0, 10)}`;
    exportRowsToCsv(filename, headers, body);
    fireToast({ message: `Exported ${body.length} ${body.length === 1 ? "row" : "rows"}.` });
  }

  function exportSelected() {
    const selRows = table.getSortedRowModel().rows.filter((r) => r.getIsSelected());
    const { headers, body } = buildExportRows(selRows);
    const filename = `${exportFilename}-selected-${new Date().toISOString().slice(0, 10)}`;
    exportRowsToCsv(filename, headers, body);
    fireToast({ message: `Exported ${body.length} ${body.length === 1 ? "row" : "rows"}.` });
  }

  const cellPadY = density === "compact" ? "py-2" : "py-3.5";

  return (
    <div>
      {/* Toolbar ------------------------------------------------------------- */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={15}
            strokeWidth={2.2}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search rows"
            className="w-full rounded-chip border border-hairline bg-surface-card pl-9 pr-8 py-2 text-[14px] text-ink-strong placeholder:text-ink-subtle outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
            style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink-strong transition-colors"
            >
              <X size={15} strokeWidth={2.4} />
            </button>
          )}
        </label>

        {filters.map((f) =>
          f.type === "select" ? (
            <select
              key={f.id}
              value={selectFilters[f.id] ?? ""}
              onChange={(e) =>
                setSelectFilters((s) => ({ ...s, [f.id]: e.target.value }))
              }
              aria-label={f.label}
              className="rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-brand"
              style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
            >
              <option value="">All {f.label.toLowerCase()}</option>
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 rounded-chip border border-hairline bg-surface-card px-2.5 py-1.5"
              style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
            >
              <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                {f.label}
              </span>
              <input
                type="date"
                value={dateFilters[f.id]?.from ?? ""}
                onChange={(e) =>
                  setDateFilters((s) => ({
                    ...s,
                    [f.id]: { from: e.target.value, to: s[f.id]?.to ?? "" },
                  }))
                }
                aria-label={`${f.label} from`}
                className="rounded-lg border border-hairline bg-surface-card px-2 py-1 text-[13px] text-ink-strong outline-none focus:border-brand"
              />
              <span className="text-ink-subtle text-[13px]">–</span>
              <input
                type="date"
                value={dateFilters[f.id]?.to ?? ""}
                onChange={(e) =>
                  setDateFilters((s) => ({
                    ...s,
                    [f.id]: { from: s[f.id]?.from ?? "", to: e.target.value },
                  }))
                }
                aria-label={`${f.label} to`}
                className="rounded-lg border border-hairline bg-surface-card px-2 py-1 text-[13px] text-ink-strong outline-none focus:border-brand"
              />
            </span>
          ),
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[13px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors px-2 py-2"
          >
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <DensityToggle value={density} onChange={setDensity} />
          <ColumnsMenu table={table} columns={columns} />
          <button
            type="button"
            onClick={exportAll}
            disabled={totalFiltered === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} strokeWidth={2.2} />
            Export
          </button>
        </div>
      </div>

      {/* Bulk bar ------------------------------------------------------------ */}
      {selectedIds.length > 0 && (
        <BulkBar
          count={selectedIds.length}
          ids={selectedIds}
          bulkAction={bulkAction}
          onExportSelected={exportSelected}
          onClear={() => table.resetRowSelection()}
          onApplied={() => {
            table.resetRowSelection();
            router.refresh();
          }}
        />
      )}

      {/* Table or empty state ------------------------------------------------ */}
      {totalFiltered === 0 ? (
        <EmptyState
          filtered={hasActiveFilters}
          title={emptyTitle}
          hint={emptyHint}
          onClear={clearFilters}
        />
      ) : (
        <div
          className="overflow-auto rounded-section border border-hairline bg-surface-card max-h-[calc(100vh-260px)]"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <table className="w-full text-[14px]">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr
                  key={hg.id}
                  className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
                >
                  {hg.headers.map((h) => {
                    const align =
                      (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                    const canSort = h.column.getCanSort();
                    const sorted = h.column.getIsSorted(); // false | "asc" | "desc"
                    const node = flexRender(h.column.columnDef.header, h.getContext());
                    return (
                      <th
                        key={h.id}
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : undefined
                        }
                        className={cn(
                          "sticky top-0 z-10 px-5 py-4 whitespace-nowrap",
                          align === "right" ? "text-right" : "text-left",
                        )}
                        style={{ background: "var(--color-surface-soft)" }}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            className={cn(
                              "group/sort inline-flex items-center gap-1.5 select-none uppercase tracking-[0.08em] transition-colors hover:text-ink-strong",
                              align === "right" ? "flex-row-reverse" : "",
                              sorted ? "text-ink-strong" : "",
                            )}
                          >
                            {node}
                            {sorted === "asc" ? (
                              <ArrowUp size={12} strokeWidth={2.6} />
                            ) : sorted === "desc" ? (
                              <ArrowDown size={12} strokeWidth={2.6} />
                            ) : (
                              <ChevronsUpDown
                                size={12}
                                strokeWidth={2.4}
                                className="opacity-45 transition-opacity group-hover/sort:opacity-100"
                              />
                            )}
                          </button>
                        ) : (
                          node
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, i) => {
                const href = getOpenHref(row.original);
                return (
                  <tr
                    key={row.id}
                    className="group/row border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft cursor-pointer"
                    style={{
                      background: i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
                    }}
                    onClick={(e) => {
                      // Ignore clicks that originate on interactive children
                      // (checkbox, links, action buttons).
                      const t = e.target as HTMLElement;
                      if (t.closest("button, a, input, select, [role='checkbox']")) return;
                      router.push(href);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const colId = cell.column.id;
                      const align =
                        (cell.column.columnDef.meta as { align?: string } | undefined)
                          ?.align;
                      const isSelect = colId === "__select";
                      const isActions = colId === "__actions";
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-5 whitespace-nowrap",
                            cellPadY,
                            align === "right" ? "text-right" : "text-left",
                            isSelect ? "w-10" : "",
                            isActions ? "w-0" : "",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer pager -------------------------------------------------------- */}
      {showPager && (
        <div className="mt-4 flex items-center gap-4 flex-wrap justify-between">
          <div className="inline-flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-subtle">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Rows per page"
              className="rounded-pill border border-hairline bg-surface-card px-3 py-1.5 text-[13px] font-bold tabular-nums text-ink-strong outline-none focus:border-brand"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[13px] font-semibold text-ink-subtle tabular-nums">
            Showing {rangeStart}–{rangeEnd} of {totalFiltered}
          </p>

          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13.5px] font-bold border border-hairline bg-surface-card text-ink-strong transition-all enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={15} strokeWidth={2.4} />
              Prev
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13.5px] font-bold border border-hairline bg-surface-card text-ink-strong transition-all enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight size={15} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RowActions({
  openHref,
  editHref,
}: {
  openHref: Route;
  editHref?: Route;
}) {
  return (
    <span className="inline-flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
      <Link
        href={openHref}
        aria-label="Open"
        title="Open"
        className="inline-flex size-7 items-center justify-center rounded-lg border border-hairline bg-surface-card text-ink-soft hover:border-brand hover:text-brand transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowUpRight size={15} strokeWidth={2.4} />
      </Link>
      {editHref && (
        <Link
          href={editHref}
          aria-label="Edit"
          title="Edit"
          className="inline-flex size-7 items-center justify-center rounded-lg border border-hairline bg-surface-card text-ink-soft hover:border-brand hover:text-brand transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <Pencil size={14} strokeWidth={2.4} />
        </Link>
      )}
    </span>
  );
}

function DensityToggle({
  value,
  onChange,
}: {
  value: Density;
  onChange: (v: Density) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Row density"
      className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-surface-soft p-0.5"
    >
      <button
        type="button"
        aria-pressed={value === "comfortable"}
        aria-label="Comfortable rows"
        title="Comfortable"
        onClick={() => onChange("comfortable")}
        className={cn(
          "inline-flex items-center justify-center size-8 rounded-pill transition-colors",
          value === "comfortable"
            ? "bg-white text-ink-strong border border-hairline-strong shadow-sm"
            : "text-ink-muted hover:text-ink-strong",
        )}
      >
        <Rows3 size={15} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        aria-pressed={value === "compact"}
        aria-label="Compact rows"
        title="Compact"
        onClick={() => onChange("compact")}
        className={cn(
          "inline-flex items-center justify-center size-8 rounded-pill transition-colors",
          value === "compact"
            ? "bg-white text-ink-strong border border-hairline-strong shadow-sm"
            : "text-ink-muted hover:text-ink-strong",
        )}
      >
        <Rows4 size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function ColumnsMenu<TRow>({
  table,
  columns,
}: {
  table: TableInstance<TRow>;
  columns: RegisterColumn<TRow>[];
}) {
  const labels = React.useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.header])),
    [columns],
  );
  const toggleable = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && c.id in labels);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-all"
        >
          <SlidersHorizontal size={14} strokeWidth={2.2} />
          Columns
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        {toggleable.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={(e) => {
              e.preventDefault();
              c.toggleVisibility();
            }}
          >
            <span className="inline-flex w-4 justify-center">
              {c.getIsVisible() ? <Check size={14} strokeWidth={2.6} /> : null}
            </span>
            {labels[c.id]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkBar({
  count,
  ids,
  bulkAction,
  onExportSelected,
  onClear,
  onApplied,
}: {
  count: number;
  ids: string[];
  bulkAction?: BulkActionConfig;
  onExportSelected: () => void;
  onClear: () => void;
  onApplied: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function apply() {
    if (!bulkAction || !value) return;
    setPending(true);
    try {
      const res = await bulkAction.onApply(ids, value);
      if (res.ok) {
        fireToast({ message: `Updated ${count} ${count === 1 ? "row" : "rows"}.` });
        setValue("");
        onApplied();
      } else {
        fireToast({ message: res.error ?? "Couldn't apply the change.", type: "error" });
      }
    } catch {
      fireToast({ message: "Couldn't apply the change.", type: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="sticky top-2 z-20 mb-3 flex items-center gap-3 flex-wrap rounded-section border border-brand/30 bg-brand/[0.06] px-4 py-2.5"
      style={{ boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)" }}
    >
      <span className="text-[13px] font-bold text-ink-strong tabular-nums">
        {count} selected
      </span>
      <button
        type="button"
        onClick={onExportSelected}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-brand hover:text-brand transition-all"
      >
        <Download size={13} strokeWidth={2.2} />
        Export selected
      </button>

      {bulkAction && (
        <div className="inline-flex items-center gap-2">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            aria-label={bulkAction.label}
            className="rounded-pill border border-hairline bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-strong outline-none focus:border-brand disabled:opacity-50"
          >
            <option value="">{bulkAction.label}…</option>
            {bulkAction.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={apply}
            disabled={pending || !value}
            className="inline-flex items-center h-8 px-3.5 rounded-pill text-[13px] font-bold bg-brand text-white transition-all enabled:hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-[13px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors"
      >
        Clear selection
      </button>
    </div>
  );
}

function EmptyState({
  filtered,
  title,
  hint,
  onClear,
}: {
  filtered: boolean;
  title: string;
  hint?: string;
  onClear: () => void;
}) {
  return (
    <div
      className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <p
        className="font-serif text-ink-strong"
        style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
      >
        {filtered ? "No rows match these filters." : title}
      </p>
      <p
        className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto"
        style={{ lineHeight: 1.5 }}
      >
        {filtered ? (
          <button
            type="button"
            onClick={onClear}
            className="font-semibold underline underline-offset-2 hover:text-ink-strong transition-colors"
          >
            Clear filters
          </button>
        ) : (
          hint
        )}
      </p>
    </div>
  );
}
