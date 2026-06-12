"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useQueryState } from "nuqs";
import { Search } from "lucide-react";
import {
  SAMPLE_STATUSES,
  SAMPLE_STATUS_LABELS,
  SAMPLE_STATUS_COLORS,
  STAGE_STATUS_LABELS,
  STAGE_STATUS_COLORS,
  type StageStatus,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import type { SampleListItem } from "@/lib/queries/samples";
import type { EmployeeOption } from "@/lib/queries/employees";

export const NEW_SAMPLE_ROUTE: Route = "/samples/new";

/** Server-validated filter state — distinguishes "no samples at all" from
 *  "no rows match the current filters" in the empty state. */
export interface SampleActiveFilters {
  status: string | null;
  responsibleId: string | null;
  q: string | null;
}

interface Props {
  rows: SampleListItem[];
  employees: EmployeeOption[];
  activeFilters: SampleActiveFilters;
}

/** The 4 tracked stages, in register order (Dim / Chem / Drw / Cost). */
const STAGE_DOTS = [
  ["Dimension", "dimensionStatus"],
  ["Chemical Analysis", "chemicalStatus"],
  ["Drawing", "drawingStatus"],
  ["Costing", "costingStatus"],
] as const;

/**
 * Sample register table — mirrors the inquiry register (plain table, nuqs
 * filters with `shallow: false` so listSamples re-runs server-side). The
 * "Stages" column is Manan's at-a-glance incompleteness view: four colour
 * dots, one per stage, toned by STAGE_STATUS_COLORS.
 */
export function SampleTable({ rows, employees, activeFilters }: Props) {
  const [status, setStatus] = useQueryState("status", {
    defaultValue: "",
    shallow: false,
  });
  const [resp, setResp] = useQueryState("resp", {
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
    activeFilters.status || activeFilters.responsibleId || activeFilters.q,
  );

  function clearFilters() {
    setText("");
    void setStatus(null);
    void setResp(null);
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
            placeholder="Search sample number or notes…"
            aria-label="Search samples"
            className="w-full rounded-chip border border-hairline bg-surface-card pl-9 pr-3.5 py-2 text-[14px] text-ink-strong placeholder:text-ink-subtle"
            style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
          />
        </label>
        <select
          value={status}
          onChange={(e) => void setStatus(e.target.value || null)}
          aria-label="Filter by sample status"
          className="rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong"
          style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
        >
          <option value="">All statuses</option>
          {SAMPLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SAMPLE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={resp}
          onChange={(e) => void setResp(e.target.value || null)}
          aria-label="Filter by responsible person"
          className="rounded-chip border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong"
          style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
        >
          <option value="">All responsible</option>
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
                <th className="px-5 py-4">Sample No</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Company</th>
                <th className="px-5 py-4">Location</th>
                <th className="px-5 py-4">Responsible</th>
                <th className="px-5 py-4">Sample Status</th>
                <th className="px-5 py-4">Stages</th>
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
                      href={`/samples/${row.id}` as Route}
                      className="font-semibold text-ink-strong hover:underline"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
                    >
                      {row.sampleNo}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap tabular-nums text-ink-soft">
                    {formatDate(row.sampleDate)}
                  </td>
                  <td className="px-5 py-3.5 text-ink-strong font-medium">
                    {row.companyName ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                    {row.location}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                    {row.responsibleName ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <Chip
                      label={SAMPLE_STATUS_LABELS[row.sampleStatus]}
                      tone={SAMPLE_STATUS_COLORS[row.sampleStatus]}
                    />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <StageDots row={row} />
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

/**
 * Four 8px dots, one per stage (Dim / Chem / Drw / Cost), toned by
 * STAGE_STATUS_COLORS. Hover/title gives "Dimension: In Process" — the
 * incomplete stages read as muted dots at a glance.
 */
function StageDots({ row }: { row: SampleListItem }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {STAGE_DOTS.map(([label, key]) => {
        const status: StageStatus = row[key];
        const tone = STAGE_STATUS_COLORS[status];
        const title = `${label}: ${STAGE_STATUS_LABELS[status]}`;
        return (
          <span
            key={key}
            role="img"
            aria-label={title}
            title={title}
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              background: `var(--color-${tone})`,
              boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.12)",
            }}
          />
        );
      })}
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
          ? "No samples match these filters."
          : "No samples yet — register the first one."}
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
            href={NEW_SAMPLE_ROUTE}
            className="font-semibold underline underline-offset-2 hover:text-ink-strong transition-colors"
          >
            New Sample
          </Link>
        )}
      </p>
    </div>
  );
}
