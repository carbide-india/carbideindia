"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useQueryState,
  parseAsString,
  parseAsArrayOf,
} from "nuqs";
import {
  MoreVertical,
  Eye,
  FileText,
  Pencil,
  Power,
  Search,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MultiSelect } from "@/components/ui/multi-select";
import { ClientQuickView } from "@/components/clients/client-quick-view";
import { fireToast } from "@/lib/toast";
import {
  deleteClient,
  reactivateClient,
} from "@/app/(admin)/admin/clients/actions";
import type { ClientRegisterRow } from "@/lib/queries/clients";
import type { ClientGrade } from "@/db/enums";

interface Props {
  rows: ClientRegisterRow[];
  isAdmin: boolean;
}

// ── Frozen-column geometry (px). Left offsets are derived from these widths so
//    the three pinned columns (Actions · Company · Contact Person) tile without
//    gaps or overlap while the rest of the table scrolls horizontally. ──
const W_ACTIONS = 46;
const W_COMPANY = 200;
const W_CONTACT = 168;
const LEFT_COMPANY = W_ACTIONS;
const LEFT_CONTACT = W_ACTIONS + W_COMPANY;

/**
 * Client Master register — a bespoke dense table (not the shared
 * RegisterDataTable) so it can carry the three product-owner requirements the
 * generic table can't: a left-pinned ⋮ row-action menu, three frozen columns
 * (Actions · Company · Contact Person) that stay put during horizontal scroll,
 * and wrapping 13px cells. Filtering is URL-driven (nuqs) over the already-
 * loaded rows; a KPI row (incl. the Domestic Client Master count) sits above.
 */
export function ClientRegister({ rows, isAdmin }: Props) {
  const [quickView, setQuickView] = React.useState<ClientRegisterRow | null>(
    null,
  );

  // ── KPI stats ──
  const stats = React.useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.isActive).length;
    const withGstin = rows.filter((r) => Boolean(r.gstin)).length;
    const exportClients = rows.filter((r) => r.isExport === true).length;
    // Domestic = export explicitly false OR unset (null) — anything not export.
    const domestic = rows.filter((r) => r.isExport !== true).length;
    return { total, active, withGstin, exportClients, domestic };
  }, [rows]);

  // ── URL-driven filter state (nuqs) ──
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [grade, setGrade] = useQueryState("grade", parseAsString.withDefault(""));
  const [salesPerson, setSalesPerson] = useQueryState(
    "sales",
    parseAsString.withDefault(""),
  );
  const [customerType, setCustomerType] = useQueryState(
    "ctype",
    parseAsString.withDefault(""),
  );
  const [industryType, setIndustryType] = useQueryState(
    "itype",
    parseAsString.withDefault(""),
  );
  const [trade, setTrade] = useQueryState("trade", parseAsString.withDefault(""));
  const [tags, setTags] = useQueryState(
    "tags",
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  // ── Filter option lists derived from the loaded rows (only relevant values). ──
  const options = React.useMemo(() => {
    const salesPeople = new Map<string, string>();
    const ctypes = new Set<string>();
    const itypes = new Set<string>();
    const tagSet = new Set<string>();
    for (const r of rows) {
      if (r.salesPersonId && r.salesPersonName)
        salesPeople.set(r.salesPersonId, r.salesPersonName);
      r.customerTypeNames.forEach((n) => ctypes.add(n));
      r.industryTypeNames.forEach((n) => itypes.add(n));
      r.tags.forEach((t) => tagSet.add(t));
    }
    const byName = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: "base" });
    return {
      salesPeople: [...salesPeople.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => byName(a.name, b.name)),
      customerTypes: [...ctypes].sort(byName),
      industryTypes: [...itypes].sort(byName),
      tags: [...tagSet].sort(byName),
    };
  }, [rows]);

  // ── Apply filters (client-side over the loaded set) ──
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle) {
        const hay = [
          r.name,
          r.clientCode,
          r.contactName,
          r.gstin,
          r.city,
          r.state,
          ...r.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (grade && r.grade !== grade) return false;
      if (salesPerson && r.salesPersonId !== salesPerson) return false;
      if (customerType && !r.customerTypeNames.includes(customerType))
        return false;
      if (industryType && !r.industryTypeNames.includes(industryType))
        return false;
      if (trade === "export" && r.isExport !== true) return false;
      if (trade === "domestic" && r.isExport === true) return false;
      // Tags: match rows carrying ANY of the selected tags.
      if (tags.length > 0 && !tags.some((t) => r.tags.includes(t)))
        return false;
      return true;
    });
  }, [rows, q, grade, salesPerson, customerType, industryType, trade, tags]);

  const hasFilters =
    Boolean(q) ||
    Boolean(grade) ||
    Boolean(salesPerson) ||
    Boolean(customerType) ||
    Boolean(industryType) ||
    Boolean(trade) ||
    tags.length > 0;

  function clearFilters() {
    setQ("");
    setGrade("");
    setSalesPerson("");
    setCustomerType("");
    setIndustryType("");
    setTrade("");
    setTags([]);
  }

  const selectClass =
    "rounded-chip border border-[#dcdce8] bg-white px-3 py-2 text-[13px] font-semibold text-[#3a4152] outline-none focus:border-[#3f3f94]";

  return (
    <>
      {/* KPI cards ---------------------------------------------------------- */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Clients" value={stats.total} accent />
        <StatCard label="Domestic Client Master" value={stats.domestic} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Export Clients" value={stats.exportClients} />
        <StatCard label="With GSTIN" value={stats.withGstin} />
      </div>

      {/* Filter bar --------------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 max-w-md">
          <Search
            size={15}
            strokeWidth={2.2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa0ab]"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value || "")}
            placeholder="Search company, code, contact, GSTIN…"
            aria-label="Search clients"
            className="w-full rounded-chip border border-[#dcdce8] bg-white py-2 pl-9 pr-8 text-[13px] text-[#3a4152] outline-none placeholder:text-[#9aa0ab] focus:border-[#3f3f94]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9aa0ab] hover:text-[#3a4152]"
            >
              <X size={15} strokeWidth={2.4} />
            </button>
          )}
        </label>

        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value || "")}
          aria-label="Grade"
          className={selectClass}
        >
          <option value="">All grades</option>
          <option value="A">Grade A</option>
          <option value="B">Grade B</option>
          <option value="C">Grade C</option>
        </select>

        <select
          value={salesPerson}
          onChange={(e) => setSalesPerson(e.target.value || "")}
          aria-label="Sales person"
          className={selectClass}
        >
          <option value="">All sales persons</option>
          {options.salesPeople.map((sp) => (
            <option key={sp.id} value={sp.id}>
              {sp.name}
            </option>
          ))}
        </select>

        <select
          value={customerType}
          onChange={(e) => setCustomerType(e.target.value || "")}
          aria-label="Customer type"
          className={selectClass}
        >
          <option value="">All customer types</option>
          {options.customerTypes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <select
          value={industryType}
          onChange={(e) => setIndustryType(e.target.value || "")}
          aria-label="Industry type"
          className={selectClass}
        >
          <option value="">All industry types</option>
          {options.industryTypes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <select
          value={trade}
          onChange={(e) => setTrade(e.target.value || "")}
          aria-label="Export or domestic"
          className={selectClass}
        >
          <option value="">Export &amp; domestic</option>
          <option value="domestic">Domestic</option>
          <option value="export">Export</option>
        </select>

        {options.tags.length > 0 && (
          <div className="rounded-chip border border-[#dcdce8] bg-white px-3 py-2">
            <MultiSelect
              options={options.tags.map((t) => ({ value: t, label: t }))}
              selected={tags}
              onChange={(next) => setTags(next.length ? next : [])}
              placeholder="All tags"
              className="min-w-[8rem] text-[13px] font-semibold text-[#3a4152]"
            />
          </div>
        )}

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-2 py-2 text-[13px] font-semibold text-[#6b7280] transition-colors hover:text-[#3a4152]"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {/* Table -------------------------------------------------------------- */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d5d8e2] bg-white px-6 py-14 text-center">
          <p className="text-[15px] font-bold text-[#3a4152]">
            {hasFilters
              ? "No clients match these filters."
              : "No clients yet — onboard the first one."}
          </p>
          <p className="mt-1.5 text-[13px] text-[#6b7280]">
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="font-semibold text-[#3f3f94] underline underline-offset-2"
              >
                Clear filters
              </button>
            ) : (
              "Use New client to capture KYC, or Bulk Import to bring in a sheet."
            )}
          </p>
        </div>
      ) : (
        <div
          className="overflow-auto rounded-2xl border border-[#e5e7eb] bg-white"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)", maxHeight: "calc(100vh - 300px)" }}
        >
          <table
            className="w-full border-separate text-[13px]"
            style={{ borderSpacing: 0, minWidth: 1180 }}
          >
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-[#6b7280]">
                <Th sticky left={0} width={W_ACTIONS} corner>
                  <span className="sr-only">Actions</span>
                </Th>
                <Th sticky left={LEFT_COMPANY} width={W_COMPANY} corner>
                  Company
                </Th>
                <Th sticky left={LEFT_CONTACT} width={W_CONTACT} corner lastFrozen>
                  Contact Person
                </Th>
                <Th width={64}>Grade</Th>
                <Th width={110}>Client Code</Th>
                <Th width={150}>Customer Type</Th>
                <Th width={150}>Industry Type</Th>
                <Th width={150}>Tags</Th>
                <Th width={140}>Sales Person</Th>
                <Th width={130}>Location</Th>
                <Th width={150}>GSTIN</Th>
                <Th width={80}>Trade</Th>
                <Th width={72} align="right">
                  Credit
                </Th>
                <Th width={96}>Status</Th>
                <Th width={100}>Created</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="group/row">
                  <Td sticky left={0} width={W_ACTIONS} className="align-top">
                    <RowMenu
                      row={r}
                      isAdmin={isAdmin}
                      onQuickView={() => setQuickView(r)}
                    />
                  </Td>
                  <Td sticky left={LEFT_COMPANY} width={W_COMPANY} className="align-top">
                    <Link
                      href={`/clients/${r.id}` as Route}
                      className="font-semibold text-[#1f2430] hover:text-[#3f3f94] hover:underline"
                    >
                      {r.name}
                    </Link>
                  </Td>
                  <Td
                    sticky
                    left={LEFT_CONTACT}
                    width={W_CONTACT}
                    lastFrozen
                    className="align-top"
                  >
                    {r.contactName ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-[#3a4152]">
                          {r.contactName}
                        </span>
                        {r.contactDesignation && (
                          <span className="text-[11.5px] text-[#8a90a0]">
                            {r.contactDesignation}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[#b3b8c2]">—</span>
                    )}
                  </Td>
                  <Td className="align-top">
                    <GradeBadge grade={r.grade} />
                  </Td>
                  <Td className="align-top">
                    <span
                      className="text-[#6b7280]"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
                    >
                      {r.clientCode ?? "—"}
                    </span>
                  </Td>
                  <Td className="align-top text-[#6b7280]">
                    {r.customerTypeNames.length ? (
                      r.customerTypeNames.join(", ")
                    ) : (
                      <span className="text-[#b3b8c2]">—</span>
                    )}
                  </Td>
                  <Td className="align-top text-[#6b7280]">
                    {r.industryTypeNames.length ? (
                      r.industryTypeNames.join(", ")
                    ) : (
                      <span className="text-[#b3b8c2]">—</span>
                    )}
                  </Td>
                  <Td className="align-top">
                    {r.tags.length ? (
                      <span className="flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center rounded-full bg-[#eef0ff] px-2 py-0.5 text-[11px] font-semibold text-[#3f3f94]"
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-[#b3b8c2]">—</span>
                    )}
                  </Td>
                  <Td className="align-top text-[#6b7280]">
                    {r.salesPersonName ?? <span className="text-[#b3b8c2]">—</span>}
                  </Td>
                  <Td className="align-top text-[#6b7280]">
                    {[r.city, r.state].filter(Boolean).join(", ") || (
                      <span className="text-[#b3b8c2]">—</span>
                    )}
                  </Td>
                  <Td className="align-top">
                    <span className="tabular-nums text-[#6b7280]" style={{ fontSize: 12 }}>
                      {r.gstin ?? <span className="text-[#b3b8c2]">—</span>}
                    </span>
                  </Td>
                  <Td className="align-top">
                    {r.isExport === true ? (
                      <span className="inline-flex items-center rounded-full bg-[#eaf3ff] px-2 py-0.5 text-[11px] font-semibold text-[#1d4ed8]">
                        Export
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-[#6b7280]">Domestic</span>
                    )}
                  </Td>
                  <Td align="right" className="align-top">
                    <span className="tabular-nums text-[#6b7280]">
                      {r.creditDays != null ? r.creditDays : "—"}
                    </span>
                  </Td>
                  <Td className="align-top">
                    {r.isActive ? (
                      <span className="text-[12.5px] text-[#6b7280]">Active</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[rgba(15,23,42,0.05)] px-2 py-0.5 text-[11px] font-semibold text-[#8a90a0]">
                        Inactive
                      </span>
                    )}
                  </Td>
                  <Td className="align-top">
                    <span className="tabular-nums text-[12.5px] text-[#6b7280]">
                      {formatDate(r.createdAt)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

// ---------------------------------------------------------------------------
// Table cell primitives — frozen-column bookkeeping in one place.
// ---------------------------------------------------------------------------

/** Shared sticky styling for a frozen header/body cell. */
function frozenStyle(
  left: number,
  width: number,
  lastFrozen?: boolean,
): React.CSSProperties {
  return {
    position: "sticky",
    left,
    width,
    minWidth: width,
    maxWidth: width,
    zIndex: 2,
    boxShadow: lastFrozen ? "1px 0 0 rgba(15,23,42,0.10)" : undefined,
  };
}

function Th({
  children,
  width,
  align,
  sticky,
  left,
  corner,
  lastFrozen,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  sticky?: boolean;
  left?: number;
  corner?: boolean;
  lastFrozen?: boolean;
}) {
  const style: React.CSSProperties = sticky
    ? {
        ...frozenStyle(left ?? 0, width ?? 0, lastFrozen),
        // Corner cells (sticky on both axes) must sit above the rest of the
        // header row while it scrolls horizontally.
        zIndex: corner ? 4 : 3,
      }
    : { width, minWidth: width };
  return (
    <th
      className={`sticky top-0 z-[2] whitespace-nowrap px-3 py-2.5 ${
        align === "right" ? "text-right" : "text-left"
      }`}
      style={{ background: "#f4f5f9", ...style }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  width,
  align,
  sticky,
  left,
  lastFrozen,
  className = "",
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  sticky?: boolean;
  left?: number;
  lastFrozen?: boolean;
  className?: string;
}) {
  const style: React.CSSProperties = sticky
    ? frozenStyle(left ?? 0, width ?? 0, lastFrozen)
    : { width, minWidth: width };
  return (
    <td
      className={`break-words border-t border-[#eef0f3] px-3 py-2 ${
        align === "right" ? "text-right" : "text-left"
      } ${
        sticky
          ? "bg-white group-hover/row:bg-[#f7f7fb]"
          : "group-hover/row:bg-[#f7f7fb]"
      } ${className}`}
      style={{ whiteSpace: "normal", ...style }}
    >
      {children}
    </td>
  );
}

function GradeBadge({ grade }: { grade: ClientGrade | null }) {
  if (!grade) return <span className="text-[#b3b8c2]">—</span>;
  const tone =
    grade === "A"
      ? { bg: "#eef0ff", fg: "#3f3f94" }
      : grade === "B"
        ? { bg: "#fff4e5", fg: "#b26a00" }
        : { bg: "#f1f3f5", fg: "#556070" };
  return (
    <span
      className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {grade}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row action ⋮ menu — actions live in a plain array so new ones just append.
// ---------------------------------------------------------------------------

function RowMenu({
  row,
  isAdmin,
  onQuickView,
}: {
  row: ClientRegisterRow;
  isAdmin: boolean;
  onQuickView: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function toggleActive() {
    setPending(true);
    try {
      const res = row.isActive
        ? await deleteClient(row.id)
        : await reactivateClient(row.id);
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
    } finally {
      setPending(false);
    }
  }

  // Each entry is either a navigation (href) or an action (onSelect). Append to
  // this array to add a new row action.
  type MenuItem = {
    key: string;
    label: string;
    icon: React.ReactNode;
    href?: Route;
    onSelect?: () => void;
    danger?: boolean;
  };
  const items: MenuItem[] = [
    {
      key: "view",
      label: "Quick view",
      icon: <Eye size={15} strokeWidth={2.2} />,
      onSelect: onQuickView,
    },
    {
      key: "record",
      label: "Full record",
      icon: <FileText size={15} strokeWidth={2.2} />,
      href: `/clients/${row.id}` as Route,
    },
    {
      key: "edit",
      label: "Edit",
      icon: <Pencil size={15} strokeWidth={2.2} />,
      href: `/clients/${row.id}/edit` as Route,
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${row.name}`}
          className="grid h-8 w-8 place-items-center rounded-lg text-[#6b7280] transition hover:bg-[#efeffb] hover:text-[#3f3f94] data-[state=open]:bg-[#efeffb] data-[state=open]:text-[#3f3f94]"
        >
          <MoreVertical size={17} strokeWidth={2.2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        {items.map((it) =>
          it.href ? (
            <DropdownMenuItem key={it.key} asChild className="text-[14px]">
              <Link href={it.href} className="flex items-center gap-2.5">
                {it.icon}
                {it.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={it.key}
              className="text-[14px]"
              onSelect={(e) => {
                e.preventDefault();
                it.onSelect?.();
              }}
            >
              {it.icon}
              {it.label}
            </DropdownMenuItem>
          ),
        )}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              danger={row.isActive}
              disabled={pending}
              className="text-[14px]"
              onSelect={(e) => {
                e.preventDefault();
                void toggleActive();
              }}
            >
              <Power size={15} strokeWidth={2.2} />
              {row.isActive ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
      className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.10em] text-[#9aa0ab]">
        {label}
      </div>
      <div
        className="mt-1.5 text-[28px] font-bold leading-none tabular-nums"
        style={{ color: accent ? "#3f3f94" : "#1f2430" }}
      >
        {value}
      </div>
    </div>
  );
}
