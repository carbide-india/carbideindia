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

/**
 * Product Master (Item Master) — a card grid. Each product is a self-contained,
 * glanceable card: the internal code as the hero, the decoded spec (shape /
 * grade / tolerance / condition / size) and dimensions on show, then customer &
 * product. A soft per-shape colour accent makes products read as distinct. No
 * horizontal scroll, no expand-to-see.
 */
export function ItemTable({ rows, isAdmin }: Props) {
  const router = useRouter();
  const [quickView, setQuickView] = React.useState<ItemListItem | null>(null);
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("recent");

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

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
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
  }, [rows, search, sort]);

  return (
    <>
      {/* Page header — title, search (beside the title), and primary actions. */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Product Master
          </h1>
          <label className="relative w-[320px] max-w-full">
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
          {/* Sort — sits beside the search bar. */}
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
              background:
                "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Product
          </Link>
        </div>
      </header>

      {shown.length === 0 ? (
        <div
          className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-16 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p className="text-[15px] font-semibold text-ink-strong">
            {rows.length === 0
              ? "No products yet — create the first one."
              : "No products match your search."}
          </p>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            Each product gets a unique internal code assembled from shape, grade and size.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              onQuickView={() => setQuickView(item)}
              onToggle={() => void toggleActive(item)}
            />
          ))}
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

/* ── Product card ──────────────────────────────────────────────────────── */

// Soft, varied accent palette — a product's shape picks its stripe colour so
// cards read as visually distinct at a glance.
const ACCENTS = [
  "#3f3f94",
  "#0e7490",
  "#b45309",
  "#15803d",
  "#7c3aed",
  "#be123c",
  "#0369a1",
];
function accentFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length]!;
}

function ProductCard({
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
  const accent = accentFor(item.shapeName ?? item.itemCode);
  const dims = composeDims(item);

  const specs: ReadonlyArray<readonly [string, string | null]> = [
    ["Shape", item.shapeName],
    ["Grade", item.gradeName],
    ["Tolerance", item.toleranceName],
    ["Condition", item.conditionName],
    ["Size", item.sizeCode],
    ["Dimensions", dims],
  ];
  const shownSpecs = specs.filter(([, v]) => v);

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card p-5 pl-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c7ccf5] hover:shadow-[0_14px_30px_rgba(63,63,148,0.13)]"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      {/* Left shape-colour accent stripe. */}
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: accent }}
        aria-hidden
      />

      {/* Top: status + actions menu. */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        {item.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--color-green-deep)]">
            <span className="size-1.5 rounded-full bg-[var(--color-green-deep)]" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-[rgba(15,23,42,0.05)] px-2 py-0.5 text-[11px] font-bold text-ink-subtle">
            Inactive
          </span>
        )}
        <CardMenu item={item} isAdmin={isAdmin} onQuickView={onQuickView} onToggle={onToggle} />
      </div>

      {/* Hero: the internal item code. */}
      <Link
        href={`/items/${item.id}` as Route}
        className="font-bold leading-snug tracking-tight text-[#3f3f94] hover:underline break-all"
        style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}
      >
        {item.itemCode}
      </Link>

      {/* Decoded spec — each attribute in its own tile so the card reads
          cleanly and every value is easy to scan. */}
      {shownSpecs.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          {shownSpecs.map(([label, value]) => (
            <div
              key={label}
              className={
                "rounded-lg border border-hairline bg-surface-soft px-3 py-2" +
                (label === "Dimensions" ? " col-span-2" : "")
              }
            >
              <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                {label}
              </dt>
              <dd
                className="mt-0.5 text-[13px] font-bold text-ink-strong break-words"
                style={label === "Dimensions" ? { fontFamily: "var(--font-mono)", fontWeight: 700 } : undefined}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Customer + product — boxed, with the product name made prominent. */}
      <div className="mt-2 grid grid-cols-1 gap-2">
        <div className="rounded-lg border border-hairline bg-surface-card px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            Customer
          </div>
          <div className="mt-0.5 text-[13.5px] font-semibold text-ink-strong break-words">
            {item.customerName ?? "—"}
          </div>
        </div>
        <div className="rounded-lg border border-hairline bg-surface-card px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            Product
          </div>
          <div className="mt-0.5 text-[14px] font-bold leading-snug text-ink-strong break-words">
            {item.custProductName ?? "—"}
          </div>
        </div>
      </div>

      {/* Meta footer. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] font-medium text-ink-subtle">
        <MetaChip>UoM {item.uom ?? "—"}</MetaChip>
        <MetaChip>HSN {item.hsnCode ?? "—"}</MetaChip>
        {item.partNo && <MetaChip>Part {item.partNo}</MetaChip>}
        {item.costingType && <MetaChip>{COSTING_TYPE_LABELS[item.costingType]}</MetaChip>}
        <span className="ml-auto tabular-nums">{formatDate(item.createdAt)}</span>
      </div>
    </div>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-soft px-1.5 py-0.5 tabular-nums">
      {children}
    </span>
  );
}

function CardMenu({
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
