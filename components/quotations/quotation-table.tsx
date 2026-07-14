"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
} from "@/db/enums";
import { formatInr, formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import { setQuotationStatusBulk } from "@/app/(app)/quotations/actions";
import type { QuotationListItem } from "@/lib/queries/quotations";

export const NEW_QUOTATION_ROUTE: Route = "/quotations/new";

interface Props {
  rows: QuotationListItem[];
}

/** Parse a numeric-string money column to a number for right-aligned ₹ display
 *  and numeric sorting; em-dash when unset or unparseable. */
function moneyText(value: string | null): string {
  if (value == null || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "-";
}

function moneyNumber(value: string | null): number {
  if (value == null || value === "") return -Infinity;
  const n = Number(value);
  return Number.isFinite(n) ? n : -Infinity;
}

/** The quote carries an SM snapshot of the enquiry date; legacy rows may lack
 *  it, so date sorting / filtering falls back to createdAt. */
function quoteDate(r: QuotationListItem): Date {
  return r.enquiryDate ?? r.createdAt;
}

/**
 * Quotation (Quote Master) register table - a thin config wrapper over the
 * shared RegisterDataTable. All sort / search / faceted-filter / export /
 * bulk-status runs client-side over the rows the page loads.
 */
export function QuotationTable({ rows }: Props) {
  const columns = React.useMemo<RegisterColumn<QuotationListItem>[]>(
    () => [
      {
        id: "quoteNo",
        header: "Quote No",
        searchable: true,
        sortValue: (r) => r.quoteNo,
        cell: (r) => (
          <Link
            href={`/quotations/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.quoteNo}
          </Link>
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
            {r.companyName ?? "-"}
          </span>
        ),
      },
      {
        id: "custProductName",
        header: "Product",
        searchable: true,
        sortValue: (r) => r.custProductName ?? "",
        exportValue: (r) => r.custProductName ?? "",
        cell: (r) => (
          <span
            className="block max-w-[280px] truncate text-ink-soft"
            title={r.custProductName ?? undefined}
          >
            {r.custProductName ?? "-"}
          </span>
        ),
      },
      {
        id: "quotePrice",
        header: "Quote Price",
        align: "right",
        sortValue: (r) => moneyNumber(r.quotePrice),
        exportValue: (r) => (r.quotePrice == null ? null : Number(r.quotePrice)),
        cell: (r) => (
          <span className="tabular-nums text-ink-strong font-medium">
            {moneyText(r.quotePrice)}
          </span>
        ),
      },
      {
        id: "costingDoneStatus",
        header: "Costing Done",
        sortValue: (r) => COSTING_DONE_STATUS_LABELS[r.costingDoneStatus],
        cell: (r) => (
          <Chip
            label={COSTING_DONE_STATUS_LABELS[r.costingDoneStatus]}
            tone={COSTING_DONE_STATUS_COLORS[r.costingDoneStatus]}
          />
        ),
      },
      {
        id: "quoteSent",
        header: "Quote Sent",
        sortValue: (r) => (r.quoteSent ? 1 : 0),
        exportValue: (r) => (r.quoteSent ? "Yes" : "No"),
        cell: (r) =>
          r.quoteSent ? (
            <Chip label="Yes" tone="green" />
          ) : (
            <span className="text-[13px] font-semibold text-ink-subtle">No</span>
          ),
      },
      {
        id: "enquiryDate",
        header: "Enquiry Date",
        defaultHidden: true,
        sortValue: (r) => quoteDate(r),
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {formatDate(quoteDate(r))}
          </span>
        ),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<QuotationListItem>[]>(
    () => [
      {
        id: "costingDoneStatus",
        label: "Costing",
        type: "select",
        options: COSTING_DONE_STATUSES.map((s) => ({
          value: COSTING_DONE_STATUS_LABELS[s],
          label: COSTING_DONE_STATUS_LABELS[s],
        })),
      },
      {
        id: "quoteSent",
        label: "Quote sent",
        type: "select",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
        ],
        accessor: (r) => (r.quoteSent ? "Yes" : "No"),
      },
      {
        id: "enquiryDate",
        label: "Enquiry date",
        type: "dateRange",
        accessor: (r) => quoteDate(r),
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<QuotationListItem>
      tableKey="quotations"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/quotations/${r.id}` as Route}
      filters={filters}
      exportFilename="quotations"
      bulkAction={{
        label: "Set costing status",
        options: COSTING_DONE_STATUSES.map((s) => ({
          value: s,
          label: COSTING_DONE_STATUS_LABELS[s],
        })),
        onApply: (ids, value) => setQuotationStatusBulk(ids, value),
      }}
      emptyTitle="No quotations yet - build the first one."
      emptyHint="Priced quotes built from an enquiry appear here, with costing status and validity."
    />
  );
}
