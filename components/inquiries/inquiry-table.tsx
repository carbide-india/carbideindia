"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useQueryState } from "nuqs";
import { Search } from "lucide-react";
import {
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_COLORS,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  INQUIRY_PRIORITY_LABELS,
  type InquiryPriority,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import type { InquiryListItem } from "@/lib/queries/inquiries";
import type { EmployeeOption } from "@/lib/queries/employees";

/** The new-inquiry form ships in the next task; typedRoutes can't see the
 *  route yet, so widen to string before the Route cast. */
export const NEW_INQUIRY_ROUTE = "/inquiries/new" as string as Route;

/** Server-validated filter state — used to distinguish "no inquiries at all"
 *  from "no rows match the current filters" in the empty state. */
export interface InquiryActiveFilters {
  status: string | null;
  salesPersonId: string | null;
  q: string | null;
}

interface Props {
  rows: InquiryListItem[];
  employees: EmployeeOption[];
  activeFilters: InquiryActiveFilters;
}

/** Priority chips reuse the status colour tokens (globals.css --color-*). */
const PRIORITY_TONES: Record<InquiryPriority, string> = {
  high_profile: "purple",
  critical: "red",
  urgent: "orange",
  important: "amber",
  normal: "slate",
};

/**
 * Inquiry register table. Plain table (no virtualization — the register is a
 * few hundred rows at most). Filters write URL params via nuqs with
 * `shallow: false` so the Server Component re-runs `listInquiries` with the
 * new filter set on every change.
 */
export function InquiryTable({ rows, employees, activeFilters }: Props) {
  const [status, setStatus] = useQueryState("status", {
    defaultValue: "",
    shallow: false,
  });
  const [sp, setSp] = useQueryState("sp", { defaultValue: "", shallow: false });
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
    activeFilters.status || activeFilters.salesPersonId || activeFilters.q,
  );

  function clearFilters() {
    setText("");
    void setStatus(null);
    void setSp(null);
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
            placeholder="Search company or SM number…"
            aria-label="Search inquiries"
            className="w-full rounded-chip border border-hairline bg-surface-card pl-9 pr-3.5 py-2 text-[14px] text-ink-strong placeholder:text-ink-subtle"
            style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
          />
        </label>
        <select
          value={status}
          onChange={(e) => void setStatus(e.target.value || null)}
          aria-label="Filter by enquiry status"
          className="rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong"
          style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
        >
          <option value="">All statuses</option>
          {ENQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ENQUIRY_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={sp}
          onChange={(e) => void setSp(e.target.value || null)}
          aria-label="Filter by sales person"
          className="rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong"
          style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
        >
          <option value="">All sales persons</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
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
                <th className="px-5 py-4">SM Number</th>
                <th className="px-5 py-4">Enquiry Date</th>
                <th className="px-5 py-4">Company</th>
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">Priority</th>
                <th className="px-5 py-4">Sales Person</th>
                <th className="px-5 py-4">Enquiry Status</th>
                <th className="px-5 py-4">Feasibility</th>
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
                      href={`/inquiries/${row.id}` as Route}
                      className="font-semibold text-ink-strong hover:underline"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
                    >
                      {row.smNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap tabular-nums text-ink-soft">
                    {formatDate(row.enquiryDate)}
                  </td>
                  <td className="px-5 py-3.5 text-ink-strong font-medium">
                    {row.companyName}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="block max-w-[60ch] truncate text-ink-soft"
                      title={row.productDescription}
                    >
                      {row.productDescription}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <Chip
                      label={INQUIRY_PRIORITY_LABELS[row.priority]}
                      tone={PRIORITY_TONES[row.priority]}
                    />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                    {row.salesPersonName ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <Chip
                      label={ENQUIRY_STATUS_LABELS[row.enquiryStatus]}
                      tone={ENQUIRY_STATUS_COLORS[row.enquiryStatus]}
                    />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <Chip
                      label={FEASIBILITY_STATUS_LABELS[row.feasibilityStatus]}
                      tone={FEASIBILITY_STATUS_COLORS[row.feasibilityStatus]}
                    />
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

/** Read-only status pill on the shared colour-token system — same
 *  color-mix treatment as the tasks table's InlineStatusCell. */
function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-pill text-[12px] font-bold whitespace-nowrap"
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
        color: `var(--color-${tone}-deep)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
      }}
    >
      {label}
    </span>
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
          ? "No inquiries match these filters."
          : "No inquiries yet — create the first one."}
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
            href={NEW_INQUIRY_ROUTE}
            className="font-semibold underline underline-offset-2 hover:text-ink-strong transition-colors"
          >
            New Inquiry
          </Link>
        )}
      </p>
    </div>
  );
}
