"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useQueryState } from "nuqs";
import { Search } from "lucide-react";
import {
  MEETING_PURPOSES,
  MEETING_PURPOSE_LABELS,
  MEETING_PURPOSE_COLORS,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import type { ClientMeetingListItem } from "@/lib/queries/client-meetings";
import type { EmployeeOption } from "@/lib/queries/employees";

export const NEW_MEETING_ROUTE: Route = "/meetings/new";

/** Server-validated filter state — distinguishes "no meetings at all" from
 *  "no rows match the current filters" in the empty state. */
export interface MeetingActiveFilters {
  purpose: string | null;
  salesPersonId: string | null;
  q: string | null;
}

interface Props {
  rows: ClientMeetingListItem[];
  employees: EmployeeOption[];
  activeFilters: MeetingActiveFilters;
}

/** Midnight-today, local — a follow-up dated strictly before this reads as
 *  overdue (the date column carries no wall-clock the user set). */
function isPastDue(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

/**
 * Daily-meeting register table — mirrors the sample register (plain table,
 * nuqs filters with `shallow: false` so listClientMeetings re-runs server-side).
 * Next Follow-Up renders in red/semibold when it's already in the past, an
 * at-a-glance "you owe this client a call" cue.
 */
export function MeetingTable({ rows, employees, activeFilters }: Props) {
  const [purpose, setPurpose] = useQueryState("purpose", {
    defaultValue: "",
    shallow: false,
  });
  const [sp, setSp] = useQueryState("sp", {
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
    activeFilters.purpose || activeFilters.salesPersonId || activeFilters.q,
  );

  function clearFilters() {
    setText("");
    void setPurpose(null);
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
            placeholder="Search meeting number, company or contact…"
            aria-label="Search meetings"
            className="w-full rounded-chip border border-hairline bg-surface-card pl-9 pr-3.5 py-2 text-[14px] text-ink-strong placeholder:text-ink-subtle"
            style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
          />
        </label>
        <select
          value={purpose}
          onChange={(e) => void setPurpose(e.target.value || null)}
          aria-label="Filter by purpose"
          className="rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong"
          style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
        >
          <option value="">All purposes</option>
          {MEETING_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {MEETING_PURPOSE_LABELS[p]}
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
                <th className="px-5 py-4">Meeting No</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Company</th>
                <th className="px-5 py-4">Contact</th>
                <th className="px-5 py-4">Sales Person</th>
                <th className="px-5 py-4">Purpose</th>
                <th className="px-5 py-4">Next Follow-Up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const overdue =
                  row.nextFollowUpDate !== null &&
                  isPastDue(row.nextFollowUpDate);
                return (
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
                        href={`/meetings/${row.id}` as Route}
                        className="font-semibold text-ink-strong hover:underline"
                        style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
                      >
                        {row.meetingNo}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap tabular-nums text-ink-soft">
                      {formatDate(row.meetingDate)}
                    </td>
                    <td className="px-5 py-3.5 text-ink-strong font-medium">
                      {row.companyName}
                    </td>
                    <td className="px-5 py-3.5 text-ink-soft">
                      {row.contactPersonName}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                      {row.salesPersonName ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <Chip
                        label={MEETING_PURPOSE_LABELS[row.purpose]}
                        tone={MEETING_PURPOSE_COLORS[row.purpose]}
                      />
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap tabular-nums">
                      {row.nextFollowUpDate ? (
                        <span
                          className={
                            overdue
                              ? "font-semibold"
                              : "text-ink-soft"
                          }
                          style={
                            overdue
                              ? { color: "var(--color-red-deep)" }
                              : undefined
                          }
                          title={overdue ? "Follow-up overdue" : undefined}
                        >
                          {formatDate(row.nextFollowUpDate)}
                        </span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
          ? "No meetings match these filters."
          : "No meetings logged yet — record the first client visit."}
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
            href={NEW_MEETING_ROUTE}
            className="font-semibold underline underline-offset-2 hover:text-ink-strong transition-colors"
          >
            New Meeting
          </Link>
        )}
      </p>
    </div>
  );
}
