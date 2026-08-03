"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import type { SecondaryFeasibilityQueueRow } from "@/lib/queries/feasibility";

/**
 * Secondary / Technical Feasibility queue — every product LINE whose parent
 * enquiry has cleared Primary Feasibility. Each row links to
 * `/feasibility/[inquiryId]`, where the Secondary/Technical Feasibility section
 * lives. Status is a simple Pending/Done readout of the line's Secondary stamp.
 */
export function SecondaryFeasibilityQueueTable({
  rows,
}: {
  rows: SecondaryFeasibilityQueueRow[];
}) {
  const hrefFor = React.useCallback(
    (inquiryId: string): Route => `/feasibility/secondary/${inquiryId}` as Route,
    [],
  );

  const columns = React.useMemo<RegisterColumn<SecondaryFeasibilityQueueRow>[]>(
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
            href={hrefFor(r.inquiryId)}
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
        width: "200px",
        pinnedLeft: true,
        truncate: true,
        searchable: true,
        sortValue: (r) => r.companyName,
        cell: (r) => <span className="font-semibold text-ink-strong">{r.companyName}</span>,
      },
      {
        id: "productName",
        header: "Product",
        width: "280px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.productName ?? "",
        exportValue: (r) => r.productName ?? "",
        cell: (r) => <span className="text-ink-soft">{r.productName ?? "—"}</span>,
      },
      {
        id: "secondaryStatus",
        header: "Secondary Status",
        width: "150px",
        sortValue: (r) => (r.secondaryDone ? 1 : 0),
        exportValue: (r) => (r.secondaryDone ? "Done" : "Pending"),
        cell: (r) =>
          r.secondaryDone ? <Chip label="Done" tone="green" /> : <Chip label="Pending" tone="amber" />,
      },
      {
        id: "secVerdict",
        header: "Verdict",
        width: "160px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.secVerdict ?? "",
        exportValue: (r) => r.secVerdict ?? "",
        cell: (r) => <span className="text-ink-soft">{r.secVerdict ?? "—"}</span>,
      },
      {
        id: "confirmed",
        header: "Confirmed",
        width: "128px",
        sortValue: (r) => (r.feasibilityConfirmed ? 1 : 0),
        exportValue: (r) => (r.feasibilityConfirmed ? "Confirmed" : "—"),
        cell: (r) =>
          r.feasibilityConfirmed ? <Chip label="Confirmed" tone="green" /> : <span className="text-ink-subtle">—</span>,
      },
    ],
    [hrefFor],
  );

  const filters = React.useMemo<FilterConfig<SecondaryFeasibilityQueueRow>[]>(
    () => [
      {
        id: "secondaryStatus",
        label: "Secondary",
        type: "select",
        options: [
          { value: "Pending", label: "Pending" },
          { value: "Done", label: "Done" },
        ],
        accessor: (r) => (r.secondaryDone ? "Done" : "Pending"),
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<SecondaryFeasibilityQueueRow>
      tableKey="feasibility-secondary"
      rows={rows}
      getRowId={(r) => r.inquiryItemId}
      columns={columns}
      getOpenHref={(r) => hrefFor(r.inquiryId)}
      filters={filters}
      exportFilename="secondary-feasibility"
      emptyTitle="No lines awaiting Secondary Feasibility."
      emptyHint="Product lines appear here once their enquiry clears Primary Feasibility."
    />
  );
}
