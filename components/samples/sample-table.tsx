"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
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
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import { setSampleStatusBulk } from "@/app/(app)/samples/actions";
import type { SampleListItem } from "@/lib/queries/samples";
import type { EmployeeOption } from "@/lib/queries/employees";

export const NEW_SAMPLE_ROUTE: Route = "/samples/new";

interface Props {
  rows: SampleListItem[];
  employees: EmployeeOption[];
}

/** The 4 tracked stages, in register order (Dim / Chem / Drw / Cost). */
const STAGE_DOTS = [
  ["Dim", "Dimension", "dimensionStatus"],
  ["Chem", "Chemical Analysis", "chemicalStatus"],
  ["Drw", "Drawing", "drawingStatus"],
  ["Cost", "Costing", "costingStatus"],
] as const;

/**
 * Sample register table — a thin config wrapper over the shared
 * RegisterDataTable. The non-sortable "Stages" column is Manan's at-a-glance
 * incompleteness view: four colour dots, one per stage. Export collapses the
 * four stages into a single "Dim:… · Chem:… · Drw:… · Cost:…" string.
 */
export function SampleTable({ rows, employees }: Props) {
  const columns = React.useMemo<RegisterColumn<SampleListItem>[]>(
    () => [
      {
        id: "sampleNo",
        header: "Sample No",
        searchable: true,
        sortValue: (r) => r.sampleNo,
        cell: (r) => (
          <Link
            href={`/samples/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.sampleNo}
          </Link>
        ),
      },
      {
        id: "sampleDate",
        header: "Date",
        sortValue: (r) => r.sampleDate,
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {formatDate(r.sampleDate)}
          </span>
        ),
      },
      {
        id: "companyName",
        header: "Company",
        searchable: true,
        sortValue: (r) => r.companyName ?? "",
        exportValue: (r) => r.companyName ?? "",
        cell: (r) => (
          <span className="text-ink-strong font-medium">
            {r.companyName ?? "—"}
          </span>
        ),
      },
      {
        id: "location",
        header: "Location",
        searchable: true,
        sortValue: (r) => r.location,
        cell: (r) => <span className="text-ink-soft">{r.location}</span>,
      },
      {
        id: "responsibleName",
        header: "Responsible",
        searchable: true,
        sortValue: (r) => r.responsibleName ?? "",
        exportValue: (r) => r.responsibleName ?? "",
        cell: (r) => (
          <span className="text-ink-soft">{r.responsibleName ?? "—"}</span>
        ),
      },
      {
        id: "sampleStatus",
        header: "Sample Status",
        sortValue: (r) => SAMPLE_STATUS_LABELS[r.sampleStatus],
        cell: (r) => (
          <Chip
            label={SAMPLE_STATUS_LABELS[r.sampleStatus]}
            tone={SAMPLE_STATUS_COLORS[r.sampleStatus]}
          />
        ),
      },
      {
        id: "stages",
        header: "Stages",
        enableSorting: false,
        exportValue: (r) =>
          STAGE_DOTS.map(
            ([short, , key]) => `${short}:${STAGE_STATUS_LABELS[r[key]]}`,
          ).join(" · "),
        cell: (r) => <StageDots row={r} />,
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<SampleListItem>[]>(
    () => [
      {
        id: "sampleStatus",
        label: "Status",
        type: "select",
        options: SAMPLE_STATUSES.map((s) => ({
          value: SAMPLE_STATUS_LABELS[s],
          label: SAMPLE_STATUS_LABELS[s],
        })),
      },
      {
        id: "responsibleName",
        label: "Responsible",
        type: "select",
        options: employees.map((e) => ({ value: e.name, label: e.name })),
        accessor: (r) => r.responsibleName ?? "",
      },
      {
        id: "sampleDate",
        label: "Sample date",
        type: "dateRange",
        accessor: (r) => r.sampleDate,
      },
    ],
    [employees],
  );

  return (
    <RegisterDataTable<SampleListItem>
      tableKey="samples"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/samples/${r.id}` as Route}
      filters={filters}
      exportFilename="samples"
      bulkAction={{
        label: "Set status",
        options: SAMPLE_STATUSES.map((s) => ({
          value: s,
          label: SAMPLE_STATUS_LABELS[s],
        })),
        onApply: (ids, value) => setSampleStatusBulk(ids, value),
      }}
      emptyTitle="No samples yet — register the first one."
      emptyHint="Physical samples appear here, tracked through each stage."
    />
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
      {STAGE_DOTS.map(([, label, key]) => {
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
