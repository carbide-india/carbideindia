"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useQueryState } from "nuqs";
import { Search } from "lucide-react";
import {
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
} from "@/db/enums";
import { formatInr } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import type { QuotationListItem } from "@/lib/queries/quotations";

export const NEW_QUOTATION_ROUTE: Route = "/quotations/new";

/** Server-validated filter state — distinguishes "no quotations at all" from
 *  "no rows match the current filters" in the empty state. */
export interface QuotationActiveFilters {
  costingDoneStatus: string | null;
  q: string | null;
}

interface Props {
  rows: QuotationListItem[];
  activeFilters: QuotationActiveFilters;
}

/** Render a numeric-string money column as ₹ (Indian grouping), em-dash when
 *  unset or unparseable. */
function money(value: string | null): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "—";
}

/**
 * Quotation (Quote Master) register table — mirrors the sample register (plain
 * table, nuqs filters with `shallow: false` so listQuotations re-runs
 * server-side). Quote Sent renders as a Yes/No badge; Costing Done as a shared
 * Chip toned by COSTING_DONE_STATUS_COLORS.
 */
export function QuotationTable({ rows, activeFilters }: Props) {
  const [cds, setCds] = useQueryState("cds", {
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

  const hasActiveFilters = Boolean(
    activeFilters.costingDoneStatus || activeFilters.q,
  );

  function clearFilters() {
    setText("");
    void setCds(null);
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
            placeholder="Search quote number or company…"
            aria-label="Search quotations"
            className="w-full rounded-chip border border-hairline bg-surface-card pl-9 pr-3.5 py-2 text-[14px] text-ink-strong placeholder:text-ink-subtle"
            style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
          />
        </label>
        <select
          value={cds}
          onChange={(e) => void setCds(e.target.value || null)}
          aria-label="Filter by costing-done status"
          className="rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong"
          style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
        >
          <option value="">All costing</option>
          {COSTING_DONE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {COSTING_DONE_STATUS_LABELS[s]}
            </option>
          ))}
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
                <th className="px-5 py-4">Quote No</th>
                <th className="px-5 py-4">Company</th>
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4 text-right">Quote Price</th>
                <th className="px-5 py-4">Costing Done</th>
                <th className="px-5 py-4">Quote Sent</th>
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
                      href={`/quotations/${row.id}` as Route}
                      className="font-semibold text-ink-strong hover:underline"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
                    >
                      {row.quoteNo}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-ink-strong font-medium">
                    {row.companyName ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-ink-soft">
                    <span className="block max-w-[280px] truncate">
                      {row.custProductName ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right tabular-nums text-ink-strong font-medium">
                    {money(row.quotePrice)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <Chip
                      label={COSTING_DONE_STATUS_LABELS[row.costingDoneStatus]}
                      tone={COSTING_DONE_STATUS_COLORS[row.costingDoneStatus]}
                    />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {row.quoteSent ? (
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
          ? "No quotations match these filters."
          : "No quotations yet — build the first one."}
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
            href={NEW_QUOTATION_ROUTE}
            className="font-semibold underline underline-offset-2 hover:text-ink-strong transition-colors"
          >
            New Quotation
          </Link>
        )}
      </p>
    </div>
  );
}
