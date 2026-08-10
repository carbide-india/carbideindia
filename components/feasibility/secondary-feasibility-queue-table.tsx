"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { GitCompareArrows } from "lucide-react";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import {
  SECONDARY_FEASIBILITY_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STATUS_COLORS,
  SECONDARY_FEASIBILITY_STATUS_LABELS,
} from "@/db/enums";
import { SECONDARY_SETTABLE_BUCKETS } from "@/lib/feasibility/stage-buckets";
import { setSecondaryFeasibilityStatusBulk } from "@/app/(app)/secondary-feasibility/actions";
import { VarianceReport } from "@/components/feasibility/variance-report";
import type { SecondaryFeasibilityQueueRow } from "@/lib/queries/feasibility";

/**
 * Secondary / Technical Feasibility queue — every product LINE whose parent
 * enquiry has cleared Primary Feasibility. Each row links to
 * `/secondary-feasibility/[inquiryId]`, where the Secondary/Technical
 * Feasibility section lives.
 *
 * Status is the line's HOUSE bucket (the same vocabulary Primary uses), and the
 * Variance column opens the shared spec-variance report for lines whose current
 * spec drifted from the frozen Primary Feasibility baseline — "in which ones was
 * there a difference between the two".
 */
export function SecondaryFeasibilityQueueTable({
  rows,
}: {
  rows: SecondaryFeasibilityQueueRow[];
}) {
  const [varianceRow, setVarianceRow] = React.useState<SecondaryFeasibilityQueueRow | null>(null);

  const hrefFor = React.useCallback(
    (inquiryId: string): Route => `/secondary-feasibility/${inquiryId}` as Route,
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
        width: "190px",
        pinnedLeft: true,
        truncate: true,
        searchable: true,
        sortValue: (r) => r.companyName,
        cell: (r) => <span className="font-semibold text-ink-strong">{r.companyName}</span>,
      },
      {
        id: "productName",
        header: "Product",
        width: "260px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.productName ?? "",
        exportValue: (r) => r.productName ?? "",
        cell: (r) => <span className="text-ink-soft">{r.productName ?? "—"}</span>,
      },
      {
        id: "secondaryStatus",
        header: "Secondary Status",
        width: "196px",
        sortValue: (r) => SECONDARY_FEASIBILITY_STATUS_LABELS[r.bucket],
        exportValue: (r) => SECONDARY_FEASIBILITY_STATUS_LABELS[r.bucket],
        cell: (r) => (
          <Chip
            label={SECONDARY_FEASIBILITY_STATUS_LABELS[r.bucket]}
            tone={SECONDARY_FEASIBILITY_STATUS_COLORS[r.bucket]}
          />
        ),
      },
      {
        id: "variance",
        header: "Variance",
        width: "128px",
        sortValue: (r) => r.varianceCount,
        exportValue: (r) => (r.hasBaseline ? r.varianceCount : ""),
        cell: (r) => {
          if (!r.hasBaseline) {
            return (
              <span className="text-[12px] font-semibold text-ink-subtle" title="No frozen Primary baseline yet — nothing to compare.">
                n/a
              </span>
            );
          }
          if (r.varianceCount === 0) {
            return (
              <span className="text-[12px] font-semibold text-ink-subtle" title="Matches the frozen Primary Feasibility baseline.">
                Match
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={() => setVarianceRow(r)}
              className="inline-flex items-center gap-1.5 rounded-pill border border-[#f3d9a6] bg-[#fdf6e7] px-2.5 py-1 text-[12px] font-bold text-[#b45309] transition-colors hover:border-[#e0a94a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f94]"
            >
              <GitCompareArrows size={13} strokeWidth={2.6} />
              {r.varianceCount} field{r.varianceCount === 1 ? "" : "s"}
            </button>
          );
        },
      },
      {
        id: "secVerdict",
        header: "Technical Verdict",
        width: "150px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.secVerdict ?? "",
        exportValue: (r) => r.secVerdict ?? "",
        cell: (r) => <span className="text-ink-soft">{r.secVerdict ?? "—"}</span>,
      },
      {
        id: "confirmed",
        header: "Confirmed",
        width: "124px",
        sortValue: (r) => (r.feasibilityConfirmed ? 1 : 0),
        exportValue: (r) => (r.feasibilityConfirmed ? "Confirmed" : "—"),
        cell: (r) =>
          r.feasibilityConfirmed ? (
            <Chip label="Confirmed" tone="green" />
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
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
        options: SECONDARY_FEASIBILITY_STAGE_BUCKETS.map((b) => ({
          value: SECONDARY_FEASIBILITY_STATUS_LABELS[b],
          label: SECONDARY_FEASIBILITY_STATUS_LABELS[b],
        })),
        accessor: (r) => SECONDARY_FEASIBILITY_STATUS_LABELS[r.bucket],
      },
      {
        id: "variance",
        label: "Variance",
        type: "select",
        options: [
          { value: "Differs", label: "Differs" },
          { value: "Match", label: "Match" },
          { value: "n/a", label: "Not comparable" },
        ],
        accessor: (r) => (!r.hasBaseline ? "n/a" : r.varianceCount > 0 ? "Differs" : "Match"),
      },
    ],
    [],
  );

  return (
    <>
      <RegisterDataTable<SecondaryFeasibilityQueueRow>
        tableKey="feasibility-secondary"
        rows={rows}
        getRowId={(r) => r.inquiryItemId}
        columns={columns}
        getOpenHref={(r) => hrefFor(r.inquiryId)}
        filters={filters}
        exportFilename="secondary-feasibility"
        bulkActions={[
          {
            // Only the workflow buckets — Approved / Not Feasible also lock and
            // confirm the line, which only "Mark Secondary Feasibility Done" does.
            label: "Set status",
            options: SECONDARY_SETTABLE_BUCKETS.map((b) => ({
              value: b,
              label: SECONDARY_FEASIBILITY_STATUS_LABELS[b],
            })),
            onApply: (ids: string[], value: string) => setSecondaryFeasibilityStatusBulk(ids, value),
          },
        ]}
        emptyTitle="No lines awaiting Secondary Feasibility."
        emptyHint="Product lines appear here once their enquiry starts or clears Primary Feasibility."
      />

      {varianceRow?.varianceRows && (
        <VarianceReport
          rows={varianceRow.varianceRows}
          heading="Variance · Primary vs Secondary"
          baselineLabel="Primary (frozen)"
          currentLabel="Current"
          title={varianceRow.productName ?? varianceRow.smNumber}
          subtitle={`${varianceRow.smNumber} · ${varianceRow.companyName}`}
          onClose={() => setVarianceRow(null)}
        />
      )}
    </>
  );
}
