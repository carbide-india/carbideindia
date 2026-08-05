"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Trash2 } from "lucide-react";
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
  type RowMenuItem,
} from "@/components/registers/register-data-table";
import { fireToast } from "@/lib/toast";
import {
  setNegotiationStatusBulk,
  deleteNegotiation,
  deleteNegotiationsBulk,
} from "@/app/(app)/negotiations/actions";
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
  const router = useRouter();

  // Per-row actions menu: Open + a destructive Delete. Delete is a HARD delete
  // (negotiations have no record-level recycle bin), so it confirms first and
  // the server action refuses when a proforma invoice was issued from it or a
  // sales order was won off it.
  const rowMenu = React.useCallback(
    (r: NegotiationListItem): RowMenuItem<NegotiationListItem>[] => [
      {
        key: "open",
        label: "Open",
        Icon: ArrowUpRight,
        href: `/negotiations/${r.id}` as Route,
      },
      {
        key: "delete",
        label: "Delete",
        Icon: Trash2,
        danger: true,
        onSelect: async (row) => {
          if (
            !window.confirm(
              `Delete negotiation ${row.negotiationNo}? This can't be undone.`,
            )
          ) {
            return;
          }
          const res = await deleteNegotiation(row.id);
          if (res.ok) {
            fireToast({ message: `Deleted ${row.negotiationNo}.` });
            router.refresh();
          } else {
            fireToast({ message: res.error, type: "error" });
          }
        },
      },
    ],
    [router],
  );

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
      rowMenu={rowMenu}
      bulkAction={{
        label: "Set status",
        options: NEGOTIATION_STATUSES.map((s) => ({
          value: s,
          label: NEGOTIATION_STATUS_LABELS[s],
        })),
        onApply: (ids, value) => setNegotiationStatusBulk(ids, value),
      }}
      bulkDelete={{
        noun: { one: "negotiation", many: "negotiations" },
        // The guard skips rows that already issued a PI or fed a sales order, so
        // the outcome is reported honestly rather than as a blanket success:
        // nothing removed -> an error naming why; a partial run -> an explicit
        // "N removed, M skipped" toast alongside the refresh.
        onDelete: (ids) =>
          deleteNegotiationsBulk(ids).then((r) => {
            if (!r.ok) return { ok: false, error: r.error };
            if (r.deleted === 0) {
              return {
                ok: false,
                error: `Couldn't delete ${r.failed} ${r.failed === 1 ? "negotiation" : "negotiations"} - in use by a proforma invoice / sales order.`,
              };
            }
            if (r.failed > 0) {
              // Report the real split via `message` — the bar's default toast
              // counts the SELECTION and would claim the skipped rows too.
              return {
                ok: true,
                message: `${r.deleted} deleted, ${r.failed} skipped (in use by a proforma invoice / sales order).`,
              };
            }
            return { ok: true };
          }),
      }}
      emptyTitle="No negotiations yet - start the first one."
      emptyHint="Price negotiations tracked from a quote to won, lost or abandoned appear here."
    />
  );
}
