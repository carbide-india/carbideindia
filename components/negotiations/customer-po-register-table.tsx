"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ExternalLink } from "lucide-react";
import { formatInr, formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import type { CustomerPoRegisterRow } from "@/lib/queries/proforma-invoices";

interface Props {
  rows: CustomerPoRegisterRow[];
  /** Rendered inside the toolbar row — see RegisterHeading. */
  heading?: React.ReactNode;
  /** The page's primary action, at the end of the toolbar row. */
  actions?: React.ReactNode;
}

/** PI↔PO reconciliation tone chip. matched → green, mismatch → red, else slate. */
const MATCH_LABELS: Record<string, string> = {
  matched: "Matched",
  mismatch: "Mismatch",
  unchecked: "Unchecked",
};
function matchTone(status: string | null): string {
  if (status === "matched") return "green";
  if (status === "mismatch") return "red";
  return "slate";
}
function matchLabel(status: string | null): string {
  if (status && MATCH_LABELS[status]) return MATCH_LABELS[status];
  return "Unchecked";
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

/**
 * Customer PO Register table — a config wrapper over the shared RegisterDataTable
 * listing every negotiation that has received a customer PO, reconciled against
 * the PI numbers issued for it. The Match column carries the PI↔PO reconciliation
 * tone chip; a link to the PO document and to the source negotiation sit inline.
 */
export function CustomerPoRegisterTable({ rows, heading, actions }: Props) {
  const columns = React.useMemo<RegisterColumn<CustomerPoRegisterRow>[]>(
    () => [
      {
        id: "smNumber",
        header: "SM Number",
        searchable: true,
        sortValue: (r) => r.smNumber ?? "",
        exportValue: (r) => r.smNumber ?? "",
        cell: (r) => (
          <Link
            href={`/negotiations/${r.negotiationId}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.smNumber ?? "-"}
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
          <span className="font-medium text-ink-strong">
            {r.companyName ?? "-"}
          </span>
        ),
      },
      {
        id: "piNos",
        header: "PI No(s)",
        searchable: true,
        enableSorting: false,
        sortValue: (r) => r.piNos.join(", "),
        exportValue: (r) => r.piNos.join(", "),
        cell: (r) =>
          r.piNos.length === 0 ? (
            <span className="text-ink-subtle">-</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {r.piNos.map((no) => (
                <span
                  key={no}
                  className="rounded-md bg-surface-soft px-1.5 py-0.5 text-[12px] font-semibold text-ink-soft"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {no}
                </span>
              ))}
            </span>
          ),
      },
      {
        id: "customerPoNo",
        header: "Customer PO No",
        searchable: true,
        sortValue: (r) => r.customerPoNo ?? "",
        exportValue: (r) => r.customerPoNo ?? "",
        cell: (r) => (
          <span
            className="font-semibold text-ink-strong"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.customerPoNo ?? "-"}
          </span>
        ),
      },
      {
        id: "customerPoDate",
        header: "PO Date",
        sortValue: (r) => r.customerPoDate ?? new Date(0),
        exportValue: (r) =>
          r.customerPoDate ? formatDate(r.customerPoDate) : "",
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {r.customerPoDate ? formatDate(r.customerPoDate) : "-"}
          </span>
        ),
      },
      {
        id: "poMatchStatus",
        header: "Match",
        sortValue: (r) => matchLabel(r.poMatchStatus),
        exportValue: (r) => matchLabel(r.poMatchStatus),
        cell: (r) => (
          <Chip label={matchLabel(r.poMatchStatus)} tone={matchTone(r.poMatchStatus)} />
        ),
      },
      {
        id: "latestPiTotal",
        header: "Latest PI Total",
        align: "right",
        sortValue: (r) => moneyNumber(r.latestPiTotal),
        exportValue: (r) =>
          r.latestPiTotal == null ? null : Number(r.latestPiTotal),
        cell: (r) => (
          <span className="font-medium tabular-nums text-ink-strong">
            {moneyText(r.latestPiTotal)}
          </span>
        ),
      },
      {
        id: "customerPoRemarks",
        header: "PO Remarks",
        width: "220px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.customerPoRemarks ?? "",
        exportValue: (r) => r.customerPoRemarks ?? "",
        cell: (r) => (
          <span className="text-ink-soft">{r.customerPoRemarks ?? "-"}</span>
        ),
      },
      {
        id: "customerPoLink",
        header: "PO Document",
        enableSorting: false,
        exportValue: (r) => r.customerPoLink ?? "",
        cell: (r) =>
          r.customerPoLink ? (
            <a
              href={r.customerPoLink}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              <ExternalLink size={13} strokeWidth={2.4} />
              Open
            </a>
          ) : (
            <span className="text-ink-subtle">-</span>
          ),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<CustomerPoRegisterRow>[]>(
    () => [
      {
        id: "poMatchStatus",
        label: "Match",
        type: "select",
        options: [
          { value: "Matched", label: "Matched" },
          { value: "Mismatch", label: "Mismatch" },
          { value: "Unchecked", label: "Unchecked" },
        ],
        accessor: (r) => matchLabel(r.poMatchStatus),
      },
      {
        id: "customerPoDate",
        label: "PO date",
        type: "dateRange",
        accessor: (r) => r.customerPoDate ?? null,
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<CustomerPoRegisterRow>
      tableKey="customer-po-register"
      rows={rows}
      getRowId={(r) => r.negotiationId}
      columns={columns}
      getOpenHref={(r) => `/negotiations/${r.negotiationId}` as Route}
      filters={filters}
      exportFilename="customer-po-register"
      emptyTitle="No customer POs received yet."
      heading={heading}
      actions={actions}
      emptyHint="Once a negotiation logs a customer purchase order it appears here, reconciled against its proforma invoices."
    />
  );
}
