"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useQueryState } from "nuqs";
import { Search } from "lucide-react";
import { formatInr } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import type { SalesOrderListItem } from "@/lib/queries/sales-orders";

export const NEW_SALES_ORDER_ROUTE: Route = "/sales-orders/new";

/** Server-validated filter state — distinguishes "no sales orders at all" from
 *  "no rows match the current filters" in the empty state. */
export interface SalesOrderActiveFilters {
  sent: string | null;
  q: string | null;
}

interface Props {
  rows: SalesOrderListItem[];
  activeFilters: SalesOrderActiveFilters;
}

/** Render a numeric-string money column as ₹ (Indian grouping), em-dash when
 *  unset or unparseable. */
function money(value: string | null): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "—";
}

/**
 * Sales Order register table — mirrors the quotation register (plain table,
 * nuqs filters with `shallow: false` so listSalesOrders re-runs server-side).
 * SO Sent renders as a Yes/No badge (the SO's only state toggle).
 */
export function SoTable({ rows, activeFilters }: Props) {
  const [sent, setSent] = useQueryState("sent", {
    defaultValue: "",
    shallow: false,
  });
  const [q, setQ] = useQueryState("q", { defaultValue: "", shallow: false });

  // Debounced search — local echo state, pushed to the URL after 350ms of
  // quiet so fast typing doesn't fire a server roundtrip per keystroke.
  const [text, setText] = React.useState(q);
  React.useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === q) return;
    const t = setTimeout(() => void setQ(trimmed || null), 350);
    return () => clearTimeout(t);
  }, [text, q, setQ]);

  const hasActiveFilters = Boolean(activeFilters.sent || activeFilters.q);

  function clearFilters() {
    setText("");
    void setSent(null);
    void setQ(null);
  }

  return (
    <div>
      {/* Filter row */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={15}
            strokeWidth={2.2}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
          />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search SO number or company…"
            aria-label="Search sales orders"
            className="w-full rounded-chip border border-hairline bg-surface-card pl-9 pr-3.5 py-2 text-[14px] text-ink-strong placeholder:text-ink-subtle"
            style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
          />
        </label>
        <select
          value={sent}
          onChange={(e) => void setSent(e.target.value || null)}
          aria-label="Filter by SO sent"
          className="rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong"
          style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
        >
          <option value="">All SO sent</option>
          <option value="yes">Sent — Yes</option>
          <option value="no">Sent — No</option>
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[13px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors px-2 py-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState filtered={hasActiveFilters} onClear={clearFilters} />
      ) : (
        <div
          className="overflow-x-auto rounded-section border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <table className="w-full text-[14px]">
            <thead>
              <tr
                className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
                style={{ background: "var(--color-surface-soft)" }}
              >
                <th className="px-5 py-4">SO No</th>
                <th className="px-5 py-4">Company</th>
                <th className="px-5 py-4 text-right">Quote Price</th>
                <th className="px-5 py-4">Customer PO No</th>
                <th className="px-5 py-4">SO Sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
                  style={{
                    background:
                      i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
                  }}
                >
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <Link
                      href={`/sales-orders/${row.id}` as Route}
                      className="font-semibold text-ink-strong hover:underline"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
                    >
                      {row.soNo}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-ink-strong font-medium">
                    {row.companyName ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right tabular-nums text-ink-strong font-medium">
                    {money(row.quotePrice)}
                  </td>
                  <td className="px-5 py-3.5 text-ink-soft">
                    <span className="block max-w-[220px] truncate">
                      {row.customerPoNo ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {row.customerSoSent ? (
                      <Chip label="Yes" tone="green" />
                    ) : (
                      <span className="text-[13px] font-semibold text-ink-subtle">
                        No
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  filtered,
  onClear,
}: {
  filtered: boolean;
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
        {filtered
          ? "No sales orders match these filters."
          : "No sales orders yet — record the first one."}
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
          <Link
            href={NEW_SALES_ORDER_ROUTE}
            className="font-semibold underline underline-offset-2 hover:text-ink-strong transition-colors"
          >
            New Sales Order
          </Link>
        )}
      </p>
    </div>
  );
}
