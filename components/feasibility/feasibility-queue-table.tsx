"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ACTIVE_FEASIBILITY_STATUSES,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  INQUIRY_PRIORITIES,
  INQUIRY_PRIORITY_LABELS,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import { setFeasibilityStatusBulk } from "@/app/(app)/feasibility/actions";
import type { FeasibilityQueueItem } from "@/lib/queries/feasibility";

/** Days a row has waited in the queue (from createdAt to now, floored). */
function ageInDays(createdAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 864e5));
}

/** Plain "done/total" checks readout (green once all five are marked). */
function ChecksBar({ done, total }: { done: number; total: number }) {
  const complete = done >= total && total > 0;
  return (
    <span
      className="tabular-nums font-bold"
      style={{ fontSize: 13, color: complete ? "var(--color-green-deep)" : "var(--color-ink-strong)" }}
    >
      {done}/{total}
    </span>
  );
}

export function FeasibilityQueueTable({ rows }: { rows: FeasibilityQueueItem[] }) {
  const hrefFor = React.useCallback((id: string): Route => `/feasibility/${id}` as Route, []);

  const columns = React.useMemo<RegisterColumn<FeasibilityQueueItem>[]>(
    () => [
      {
        id: "smNumber",
        header: "SM No.",
        width: "94px",
        pinnedLeft: true,
        searchable: true,
        sortValue: (r) => r.smNumber,
        cell: (r) => (
          <Link
            href={hrefFor(r.id)}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.smNumber}
          </Link>
        ),
      },
      {
        id: "companyName",
        header: "Company",
        width: "190px",
        pinnedLeft: true,
        truncate: true,
        searchable: true,
        sortValue: (r) => r.companyName,
        cell: (r) => <span className="font-semibold text-ink-strong">{r.companyName}</span>,
      },
      {
        id: "priority",
        header: "Priority",
        width: "104px",
        sortValue: (r) => INQUIRY_PRIORITY_LABELS[r.priority],
        exportValue: (r) => INQUIRY_PRIORITY_LABELS[r.priority],
        cell: (r) => <Chip label={INQUIRY_PRIORITY_LABELS[r.priority]} tone={PRIORITY_TONES[r.priority]} />,
      },
      {
        id: "export",
        header: "Export",
        width: "92px",
        sortValue: (r) => (r.export ? "Export" : "Domestic"),
        exportValue: (r) => (r.export ? "Export" : "Domestic"),
        cell: (r) =>
          r.export ? <Chip label="Export" tone="green" /> : <Chip label="Domestic" tone="slate" />,
      },
      {
        id: "productCount",
        header: "Items",
        width: "62px",
        align: "right",
        sortValue: (r) => r.productCount,
        cell: (r) => <span className="tabular-nums font-semibold text-ink-strong">{r.productCount || "-"}</span>,
      },
      {
        id: "checks",
        header: "Checks",
        width: "96px",
        align: "right",
        sortValue: (r) => r.checksDone,
        exportValue: (r) => `${r.checksDone}/${r.checksTotal}`,
        cell: (r) => <ChecksBar done={r.checksDone} total={r.checksTotal} />,
      },
      {
        // Lines of this SM whose spec drifted from the frozen Primary baseline.
        // Which fields differ is per LINE, so the detail is on the Secondary
        // register / review — here it is a "go look" signal only.
        id: "variance",
        header: "Variance",
        width: "104px",
        align: "right",
        sortValue: (r) => r.varianceLines,
        exportValue: (r) => (r.comparableLines === 0 ? "" : r.varianceLines),
        cell: (r) => {
          if (r.comparableLines === 0) {
            return (
              <span className="text-[12px] font-semibold text-ink-subtle" title="No line has a frozen Primary baseline yet.">
                n/a
              </span>
            );
          }
          if (r.varianceLines === 0) {
            return <span className="text-[12px] font-semibold text-ink-subtle">Match</span>;
          }
          return (
            <span
              className="tabular-nums font-bold"
              style={{ color: "var(--color-amber-deep)" }}
              title={`${r.varianceLines} of ${r.comparableLines} comparable line(s) differ from the frozen Primary baseline.`}
            >
              {r.varianceLines}/{r.comparableLines}
            </span>
          );
        },
      },
      {
        id: "checkedByName",
        header: "Checked By",
        width: "150px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.checkedByName ?? "",
        cell: (r) => <span className="text-ink-soft">{r.checkedByName ?? "-"}</span>,
      },
      {
        id: "status",
        header: "Status",
        width: "170px",
        sortValue: (r) => FEASIBILITY_STATUS_LABELS[r.status],
        cell: (r) => <Chip label={FEASIBILITY_STATUS_LABELS[r.status]} tone={FEASIBILITY_STATUS_COLORS[r.status]} />,
      },
      {
        id: "enquiryDate",
        header: "Enquiry Date",
        width: "116px",
        defaultHidden: true,
        sortValue: (r) => r.enquiryDate,
        cell: (r) => <span className="tabular-nums text-ink-soft">{formatDate(r.enquiryDate)}</span>,
      },
      {
        id: "age",
        header: "Age",
        width: "80px",
        align: "right",
        sortValue: (r) => ageInDays(r.createdAt),
        exportValue: (r) => ageInDays(r.createdAt),
        cell: (r) => {
          const d = ageInDays(r.createdAt);
          return (
            <span className="tabular-nums text-ink-soft" title={formatDate(r.createdAt)}>
              {d}d
            </span>
          );
        },
      },
    ],
    [hrefFor],
  );

  const filters = React.useMemo<FilterConfig<FeasibilityQueueItem>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        type: "select",
        options: ACTIVE_FEASIBILITY_STATUSES.map((s) => ({
          value: FEASIBILITY_STATUS_LABELS[s],
          label: FEASIBILITY_STATUS_LABELS[s],
        })),
        accessor: (r) => FEASIBILITY_STATUS_LABELS[r.status],
      },
      {
        id: "priority",
        label: "Priority",
        type: "select",
        options: INQUIRY_PRIORITIES.map((p) => ({
          value: INQUIRY_PRIORITY_LABELS[p],
          label: INQUIRY_PRIORITY_LABELS[p],
        })),
        accessor: (r) => INQUIRY_PRIORITY_LABELS[r.priority],
      },
      {
        id: "enquiryDate",
        label: "Period",
        type: "period",
        accessor: (r) => r.enquiryDate,
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<FeasibilityQueueItem>
      tableKey="feasibility"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => hrefFor(r.id)}
      filters={filters}
      exportFilename="feasibility"
      bulkActions={[
        {
          label: "Set status",
          options: ACTIVE_FEASIBILITY_STATUSES.map((s) => ({ value: s, label: FEASIBILITY_STATUS_LABELS[s] })),
          onApply: (ids: string[], value: string) => setFeasibilityStatusBulk(ids, value),
        },
      ]}
      emptyTitle="No enquiries to review yet."
      emptyHint="Enquiries appear here for their Primary Feasibility review."
    />
  );
}
