"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Plus,
  Download,
  Upload,
  MoreHorizontal,
  Eye,
  FileText,
  Pencil,
  Power,
  ArrowUpDown,
  SlidersHorizontal,
} from "lucide-react";
import { COSTING_TYPE_LABELS } from "@/db/enums";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { deactivateItem, reactivateItem } from "@/app/(app)/items/actions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ItemQuickView } from "@/components/items/item-quick-view";
import type { ItemListItem } from "@/lib/queries/items";

export const NEW_ITEM_ROUTE = "/items/new" as Route;

interface Props {
  rows: ItemListItem[];
  isAdmin: boolean;
}

type SortKey =
  | "recent"
  | "oldest"
  | "code"
  | "codeDesc"
  | "customer"
  | "customerDesc"
  | "status";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "code", label: "Item Code (A→Z)" },
  { value: "codeDesc", label: "Item Code (Z→A)" },
  { value: "customer", label: "Customer (A→Z)" },
  { value: "customerDesc", label: "Customer (Z→A)" },
  { value: "status", label: "Active first" },
];

/** Filter facets - each bifurcated live from the visible rows. `get` resolves a
 *  row's value for that facet (null = not set → excluded from the option list). */
const FACETS: {
  key: string;
  label: string;
  get: (r: ItemListItem) => string | null;
}[] = [
  { key: "status", label: "Status", get: (r) => (r.isActive ? "Active" : "Inactive") },
  { key: "shape", label: "Shape", get: (r) => r.shapeName },
  { key: "grade", label: "Grade", get: (r) => r.gradeName },
  { key: "tolerance", label: "Tolerance", get: (r) => r.toleranceName },
  { key: "condition", label: "Condition", get: (r) => r.conditionName },
  { key: "size", label: "Size", get: (r) => r.sizeCode },
  {
    key: "costing",
    label: "Costing",
    get: (r) => (r.costingType ? COSTING_TYPE_LABELS[r.costingType] : null),
  },
  { key: "customer", label: "Customer", get: (r) => r.customerName },
];

/**
 * Product Master (Item Master) - a dense column table. Row 1 is the title +
 * search + sort + actions; row 2 is a horizontally-scrollable filter bar with a
 * dropdown per facet (all derived from the data); the table starts on row 3 with
 * prominent text, a sticky Item-Code column (left) and sticky Actions (right),
 * horizontal scroll for the spec columns in between.
 */
export function ItemTable({ rows, isAdmin }: Props) {
  const router = useRouter();
  const [quickView, setQuickView] = React.useState<ItemListItem | null>(null);
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [filters, setFilters] = React.useState<Record<string, string>>({});

  const toggleActive = React.useCallback(
    async (item: ItemListItem) => {
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
    },
    [router],
  );

  // Distinct option list per facet, derived from all rows.
  const facetOptions = React.useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of FACETS) {
      const set = new Set<string>();
      for (const r of rows) {
        const v = f.get(r);
        if (v) set.add(v);
      }
      const arr = Array.from(set);
      if (f.key === "status") {
        arr.sort((a, b) => (a === "Active" ? -1 : b === "Active" ? 1 : 0));
      } else {
        arr.sort((a, b) => a.localeCompare(b));
      }
      out[f.key] = arr;
    }
    return out;
  }, [rows]);

  const activeFilterCount = React.useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;

    // Facet filters.
    const active = FACETS.filter((f) => filters[f.key]);
    if (active.length) {
      out = out.filter((r) => active.every((f) => f.get(r) === filters[f.key]));
    }

    if (q) {
      out = out.filter((r) =>
        [
          r.itemCode,
          r.customerName,
          r.custProductName,
          r.partNo,
          r.hsnCode,
          r.shapeName,
          r.gradeName,
        ]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }

    const sorted = out.slice();
    const byDate = (a: ItemListItem, b: ItemListItem) =>
      +new Date(a.createdAt) - +new Date(b.createdAt);
    switch (sort) {
      case "oldest":
        sorted.sort(byDate);
        break;
      case "code":
        sorted.sort((a, b) => a.itemCode.localeCompare(b.itemCode));
        break;
      case "codeDesc":
        sorted.sort((a, b) => b.itemCode.localeCompare(a.itemCode));
        break;
      case "customer":
        sorted.sort((a, b) => (a.customerName ?? "").localeCompare(b.customerName ?? ""));
        break;
      case "customerDesc":
        sorted.sort((a, b) => (b.customerName ?? "").localeCompare(a.customerName ?? ""));
        break;
      case "status":
        sorted.sort((a, b) => Number(b.isActive) - Number(a.isActive) || -byDate(a, b));
        break;
      default: // recent
        sorted.sort((a, b) => -byDate(a, b));
    }
    return sorted;
  }, [rows, search, sort, filters]);

  return (
    <>
      {/* ── Row 1: title + search + sort + primary actions (single line) ── */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Product Master
          </h1>
          <label className="relative w-[260px] max-w-full">
            <Search
              size={15}
              strokeWidth={2.2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="w-full rounded-chip border border-hairline bg-surface-card py-2 pl-9 pr-8 text-[14px] text-ink-strong outline-none placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle transition-colors hover:text-ink-strong"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            )}
          </label>
          <label className="inline-flex items-center gap-2 text-[13px] text-ink-subtle">
            <ArrowUpDown size={14} strokeWidth={2.2} />
            <span className="font-semibold">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort products"
              className="rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[13px] font-semibold text-ink-strong outline-none focus:border-brand"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={"/items/import" as Route}
            className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-4 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-ink-subtle hover:text-ink-strong"
          >
            <Upload size={15} strokeWidth={2.2} />
            Bulk upload
          </Link>
          <a
            href="/items/export.xlsx"
            className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-4 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-ink-subtle hover:text-ink-strong"
          >
            <Download size={15} strokeWidth={2.2} />
            Export to Excel
          </a>
          <Link
            href={NEW_ITEM_ROUTE}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-bold text-white transition-transform hover:-translate-y-px"
            style={{
              background: "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Product
          </Link>
        </div>
      </header>

      {/* ── Row 2: filter bar (compact, sized to fit on one line) ── */}
      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1.5 [scrollbar-width:thin]">
        <span className="flex shrink-0 items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
          <SlidersHorizontal size={13} strokeWidth={2.4} />
          <span className="max-md:hidden">Filters</span>
        </span>
        {FACETS.map((f) => (
          <FacetSelect
            key={f.key}
            label={f.label}
            value={filters[f.key] ?? ""}
            options={facetOptions[f.key] ?? []}
            onChange={(v) =>
              setFilters((prev) => {
                const next = { ...prev };
                if (v) next[f.key] = v;
                else delete next[f.key];
                return next;
              })
            }
          />
        ))}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({})}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand/40 bg-brand/6 px-2 py-1 text-[12px] font-bold text-brand transition-colors hover:bg-brand/12"
          >
            <X size={12} strokeWidth={2.6} />
            Clear ({activeFilterCount})
          </button>
        )}
        <span className="ml-auto shrink-0 whitespace-nowrap pl-1.5 text-[12px] font-semibold text-ink-subtle tabular-nums">
          {shown.length} of {rows.length}
        </span>
      </div>

      {/* ── Row 3+: the table ── */}
      {shown.length === 0 ? (
        <div
          className="mt-3 rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-16 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p className="text-[15px] font-semibold text-ink-strong">
            {rows.length === 0
              ? "No products yet - create the first one."
              : "No products match your filters."}
          </p>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            Each product gets a unique internal code assembled from shape, grade and size.
          </p>
        </div>
      ) : (
        <div
          className="mt-3 overflow-x-auto rounded-section border-2 border-[#b3b7dd] bg-surface-card"
          style={{ boxShadow: "0 2px 10px rgba(15, 23, 42, 0.08)" }}
        >
          <table className="w-full min-w-[1240px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-[#b9bce0] bg-[#e9ebfb]">
                <Th sticky="left">Item Code</Th>
                <Th>Status</Th>
                <Th>Shape</Th>
                <Th>Grade</Th>
                <Th>Tolerance</Th>
                <Th>Condition</Th>
                <Th>Size</Th>
                <Th>Dimensions</Th>
                <Th>Customer</Th>
                <Th>Product</Th>
                <Th>HSN</Th>
                <Th>UoM</Th>
                <Th>Created</Th>
                <Th sticky="right" className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <ProductRow
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  onQuickView={() => setQuickView(item)}
                  onToggle={() => void toggleActive(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {quickView && (
        <ItemQuickView
          item={quickView}
          isAdmin={isAdmin}
          onClose={() => setQuickView(null)}
        />
      )}
    </>
  );
}

/* ── Filter dropdown ───────────────────────────────────────────────────── */

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const active = value !== "";
  return (
    <label
      className={
        "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 transition-colors " +
        (active
          ? "border-brand bg-brand/6"
          : "border-hairline bg-surface-card hover:border-hairline-strong")
      }
    >
      <span className="text-[9.5px] font-bold uppercase tracking-[0.02em] text-ink-subtle">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Filter by ${label}`}
        // field-sizing:content makes the select hug its CURRENT value (not the
        // widest option), so short values like "All" don't leave an empty gap
        // before the arrow. max-w caps long values; falls back gracefully where
        // field-sizing is unsupported.
        style={{ fieldSizing: "content" } as React.CSSProperties}
        className={
          "max-w-[130px] cursor-pointer truncate bg-transparent text-[12px] font-bold outline-none " +
          (active ? "text-brand" : "text-ink-strong")
        }
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ── Table header cell ─────────────────────────────────────────────────── */

function Th({
  children,
  sticky,
  className = "",
}: {
  children: React.ReactNode;
  sticky?: "left" | "right";
  className?: string;
}) {
  const stick =
    sticky === "left"
      ? "sticky left-0 z-20 bg-[#e9ebfb]"
      : sticky === "right"
        ? "sticky right-0 z-20 bg-[#e9ebfb]"
        : "";
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-r border-[#c7cae6] px-4 py-3 text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-[#3f3f94] last:border-r-0 ${stick} ${className}`}
    >
      {children}
    </th>
  );
}

/* ── One product row ───────────────────────────────────────────────────── */

function ProductRow({
  item,
  isAdmin,
  onQuickView,
  onToggle,
}: {
  item: ItemListItem;
  isAdmin: boolean;
  onQuickView: () => void;
  onToggle: () => void;
}) {
  const dims = composeDims(item);
  const td =
    "whitespace-nowrap border-r border-[#e6e8f0] px-4 py-3 align-middle text-[14px] text-ink-strong last:border-r-0";
  const muted = "text-ink-subtle";

  return (
    <tr className="group border-b border-[#d7dae4] transition-colors last:border-b-0 hover:bg-[#f4f5fe]">
      {/* Item Code - sticky left, hero. */}
      <td className={`${td} sticky left-0 z-10 bg-surface-card group-hover:bg-[#f4f5fe]`}>
        <Link
          href={`/items/${item.id}` as Route}
          title={item.itemCode}
          className="block max-w-[300px] truncate font-bold tracking-tight text-[#3f3f94] hover:underline"
          style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}
        >
          {item.itemCode}
        </Link>
      </td>

      {/* Status. */}
      <td className={td}>
        {item.isActive ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-[var(--color-green-deep)]">
            <span className="size-1.5 rounded-full bg-[var(--color-green-deep)]" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-[rgba(15,23,42,0.05)] px-2 py-0.5 text-[12px] font-bold text-ink-subtle">
            Inactive
          </span>
        )}
      </td>

      <td className={`${td} font-semibold`}>{item.shapeName ?? <Dash />}</td>
      <td className={`${td} font-semibold`}>{item.gradeName ?? <Dash />}</td>
      <td className={`${td} font-semibold`}>{item.toleranceName ?? <Dash />}</td>
      <td className={`${td} font-semibold`}>{item.conditionName ?? <Dash />}</td>
      <td className={`${td} font-semibold`}>{item.sizeCode ?? <Dash />}</td>

      {/* Dimensions - mono. */}
      <td className={td}>
        {dims ? (
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{dims}</span>
        ) : (
          <Dash />
        )}
      </td>

      {/* Customer + Product - may be longer, allow up to a cap. */}
      <td className={`${td} max-w-[220px] truncate font-semibold`} title={item.customerName ?? undefined}>
        {item.customerName ?? <Dash />}
      </td>
      <td className={`${td} max-w-[240px] truncate`} title={item.custProductName ?? undefined}>
        {item.custProductName ?? <Dash />}
      </td>

      <td className={`${td} ${muted} tabular-nums`}>{item.hsnCode ?? <Dash />}</td>
      <td className={`${td} ${muted}`}>{item.uom ?? <Dash />}</td>
      <td className={`${td} ${muted} tabular-nums`}>{formatDate(item.createdAt)}</td>

      {/* Actions - sticky right. */}
      <td
        className={`${td} sticky right-0 z-10 bg-surface-card text-right group-hover:bg-[#f4f5fe]`}
      >
        <RowMenu item={item} isAdmin={isAdmin} onQuickView={onQuickView} onToggle={onToggle} />
      </td>
    </tr>
  );
}

function Dash() {
  return <span className="text-ink-subtle">-</span>;
}

function RowMenu({
  item,
  isAdmin,
  onQuickView,
  onToggle,
}: {
  item: ItemListItem;
  isAdmin: boolean;
  onQuickView: () => void;
  onToggle: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Product actions"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-soft transition-all hover:border-brand hover:text-brand"
        >
          <MoreHorizontal size={16} strokeWidth={2.4} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickView(); }}>
          <Eye size={14} strokeWidth={2.2} /> Quick view
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/items/${item.id}` as Route}>
            <FileText size={14} strokeWidth={2.2} /> Full record
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/items/${item.id}/edit` as Route}>
            <Pencil size={14} strokeWidth={2.2} /> Edit
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem
            danger={item.isActive}
            onSelect={(e) => { e.preventDefault(); onToggle(); }}
          >
            <Power size={14} strokeWidth={2.2} />
            {item.isActive ? "Deactivate" : "Reactivate"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function composeDims(item: ItemListItem): string | null {
  const u = item.dimensionUnit ?? "mm";
  const parts: string[] = [];
  if (item.outerDia) parts.push(`OD ${item.outerDia}`);
  if (item.innerDia) parts.push(`ID ${item.innerDia}`);
  if (item.length) parts.push(`L ${item.length}`);
  if (item.width) parts.push(`W ${item.width}`);
  if (item.thickness) parts.push(`T ${item.thickness}`);
  return parts.length > 0 ? `${parts.join(" · ")} ${u}` : null;
}
