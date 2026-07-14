"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  NEGOTIATION_STATUSES,
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUS_COLORS,
} from "@/db/enums";
import { formatInr, formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import { setNegotiationStatusBulk } from "@/app/(app)/negotiations/actions";
import type { NegotiationListItem } from "@/lib/queries/negotiations";

export const NEW_NEGOTIATION_ROUTE: Route = "/negotiations/new";

interface Props {
  rows: NegotiationListItem[];
}

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

/** SM snapshot of the enquiry date; legacy rows fall back to createdAt. */
function negotiationDate(r: NegotiationListItem): Date {
  return r.enquiryDate ?? r.createdAt;
}

/**
 * Negotiation register table - a thin config wrapper over the shared
 * RegisterDataTable. The status column sorts by ENUM ORDER (pipeline position),
 * not the label alphabetical, so sorting reflects the negotiation lifecycle.
 */
export function NegotiationTable({ rows }: Props) {
  const columns = React.useMemo<RegisterColumn<NegotiationListItem>[]>(
    () => [
      {
        id: "negotiationNo",
        header: "Negotiation No",
        searchable: true,
        sortValue: (r) => r.negotiationNo,
        cell: (r) => (
          <Link
            href={`/negotiations/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.negotiationNo}
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
        id: "salesPersonName",
        header: "Sales Person",
        searchable: true,
        sortValue: (r) => r.salesPersonName ?? "",
        exportValue: (r) => r.salesPersonName ?? "",
        cell: (r) => (
          <span className="text-ink-soft">{r.salesPersonName ?? "-"}</span>
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
        id: "negotiationStatus",
        header: "Negotiation Status",
        // Sort by pipeline position (enum order), not label alphabetical.
        sortValue: (r) => NEGOTIATION_STATUSES.indexOf(r.negotiationStatus),
        exportValue: (r) => NEGOTIATION_STATUS_LABELS[r.negotiationStatus],
        cell: (r) => (
          <Chip
            label={NEGOTIATION_STATUS_LABELS[r.negotiationStatus]}
            tone={NEGOTIATION_STATUS_COLORS[r.negotiationStatus]}
          />
        ),
      },
      {
        id: "enquiryDate",
        header: "Enquiry Date",
        defaultHidden: true,
        sortValue: (r) => negotiationDate(r),
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {formatDate(negotiationDate(r))}
          </span>
        ),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<NegotiationListItem>[]>(
    () => [
      {
        id: "negotiationStatus",
        label: "Status",
        type: "select",
        // Filter matches the column's string sortValue - which is now the enum
        // index - so map options to the index string.
        options: NEGOTIATION_STATUSES.map((s, i) => ({
          value: String(i),
          label: NEGOTIATION_STATUS_LABELS[s],
        })),
        accessor: (r) => String(NEGOTIATION_STATUSES.indexOf(r.negotiationStatus)),
      },
      {
        id: "enquiryDate",
        label: "Enquiry date",
        type: "dateRange",
        accessor: (r) => negotiationDate(r),
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<NegotiationListItem>
      tableKey="negotiations"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/negotiations/${r.id}` as Route}
      filters={filters}
      exportFilename="negotiations"
      bulkAction={{
        label: "Set status",
        options: NEGOTIATION_STATUSES.map((s) => ({
          value: s,
          label: NEGOTIATION_STATUS_LABELS[s],
        })),
        onApply: (ids, value) => setNegotiationStatusBulk(ids, value),
      }}
      emptyTitle="No negotiations yet - start the first one."
      emptyHint="Price negotiations tracked from a quote to won, lost or abandoned appear here."
    />
  );
}
