"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import type {
  ConfirmedFeasibilityRow,
  SecondaryEligibility,
} from "@/lib/queries/feasibility";

const SECONDARY_LABEL: Record<SecondaryEligibility, string> = {
  done: "Done",
  partial: "Partial",
  pending: "Pending",
};
const SECONDARY_TONE: Record<SecondaryEligibility, string> = {
  done: "green",
  partial: "amber",
  pending: "slate",
};
const SECONDARY_RANK: Record<SecondaryEligibility, number> = {
  done: 2,
  partial: 1,
  pending: 0,
};

/**
 * Confirmed Feasibility Register — every enquiry whose Primary Feasibility is
 * confirmed (proceed_to_costing) and therefore ready for Costing. ONE un-split
 * register: each row links to the feasibility review and carries three status
 * columns — Primary / Secondary / Confirmed eligibility.
 */
export function ConfirmedFeasibilityTable({ rows }: { rows: ConfirmedFeasibilityRow[] }) {
  const hrefFor = React.useCallback((id: string): Route => `/feasibility/${id}` as Route, []);

  const columns = React.useMemo<RegisterColumn<ConfirmedFeasibilityRow>[]>(
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
        width: "200px",
        pinnedLeft: true,
        truncate: true,
        searchable: true,
        sortValue: (r) => r.companyName,
        cell: (r) => <span className="font-semibold text-ink-strong">{r.companyName}</span>,
      },
      {
        id: "productDesc",
        header: "Product",
        width: "260px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.productDesc ?? "",
        exportValue: (r) => r.productDesc ?? "",
        cell: (r) => <span className="text-ink-soft">{r.productDesc ?? "—"}</span>,
      },
      {
        id: "productCount",
        header: "Items",
        width: "96px",
        align: "right",
        sortValue: (r) => r.productCount,
        cell: (r) => (
          <span className="tabular-nums font-semibold text-ink-strong">{r.productCount || "-"}</span>
        ),
      },
      {
        id: "primaryEligibility",
        header: "Primary Eligibility",
        width: "200px",
        enableSorting: false,
        exportValue: () => "Done",
        // These rows are confirmed enquiries — Primary Feasibility is by
        // definition Done.
        cell: () => <Chip label="Done" tone="green" />,
      },
      {
        id: "secondaryEligibility",
        header: "Secondary Eligibility",
        width: "224px",
        sortValue: (r) => SECONDARY_RANK[r.secondaryEligibility],
        exportValue: (r) =>
          r.secondaryEligibility === "partial"
            ? `Partial (${r.secondaryDoneCount}/${r.productCount})`
            : SECONDARY_LABEL[r.secondaryEligibility],
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5">
            <Chip
              label={SECONDARY_LABEL[r.secondaryEligibility]}
              tone={SECONDARY_TONE[r.secondaryEligibility]}
            />
            {r.secondaryEligibility === "partial" && (
              <span className="text-[11px] font-semibold tabular-nums text-ink-subtle">
                {r.secondaryDoneCount}/{r.productCount}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "confirmedEligibility",
        header: "Confirmed Eligibility",
        width: "224px",
        sortValue: (r) => r.confirmedAt,
        exportValue: (r) => `Confirmed · ${formatDate(r.confirmedAt)}`,
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            <Chip label="Confirmed" tone="green" />
            <span className="tabular-nums text-[12px] text-ink-soft">{formatDate(r.confirmedAt)}</span>
          </span>
        ),
      },
    ],
    [hrefFor],
  );

  const filters = React.useMemo<FilterConfig<ConfirmedFeasibilityRow>[]>(
    () => [
      {
        id: "confirmedAt",
        label: "Period",
        type: "period",
        accessor: (r) => r.confirmedAt,
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<ConfirmedFeasibilityRow>
      tableKey="feasibility-confirmed"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => hrefFor(r.id)}
      filters={filters}
      exportFilename="confirmed-feasibility"
      emptyTitle="No confirmed feasibility yet."
      emptyHint="Enquiries appear here once their Primary Feasibility is confirmed and ready for costing."
    />
  );
}
