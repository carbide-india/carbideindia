"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Trash2 } from "lucide-react";
import {
  MEETING_PURPOSES,
  MEETING_PURPOSE_LABELS,
  MEETING_PURPOSE_COLORS,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
  type RowMenuItem,
} from "@/components/registers/register-data-table";
import { fireToast } from "@/lib/toast";
import {
  setMeetingPurposeBulk,
  deleteClientMeeting,
  deleteClientMeetingsBulk,
} from "@/app/(app)/meetings/actions";
import type { ClientMeetingListItem } from "@/lib/queries/client-meetings";
import type { EmployeeOption } from "@/lib/queries/employees";

export const NEW_MEETING_ROUTE: Route = "/meetings/new";

interface Props {
  rows: ClientMeetingListItem[];
  employees: EmployeeOption[];
  /** Rendered inside the toolbar row — see RegisterHeading. */
  heading?: React.ReactNode;
  /** The page's primary action, at the end of the toolbar row. */
  actions?: React.ReactNode;
}

/** Midnight-today, local - a follow-up dated strictly before this reads as
 *  overdue (the date column carries no wall-clock the user set). */
function isPastDue(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

/**
 * Daily-meeting register table - a thin config wrapper over the shared
 * RegisterDataTable. Purpose sorts by ENUM ORDER (stable, not label
 * alphabetical). Next Follow-Up renders in red/semibold when already in the
 * past, an at-a-glance "you owe this client a call" cue.
 */
export function MeetingTable({ rows, employees, heading, actions }: Props) {
  const router = useRouter();

  // Per-row actions menu: Open + a destructive Delete. Meetings have no
  // record-level recycle bin and no deleted_at column, so this is a HARD
  // delete - it confirms first, and the server action refuses any row a
  // downstream record depends on.
  const rowMenu = React.useCallback(
    (r: ClientMeetingListItem): RowMenuItem<ClientMeetingListItem>[] => [
      {
        key: "open",
        label: "Open",
        Icon: ArrowUpRight,
        href: `/meetings/${r.id}` as Route,
      },
      {
        key: "delete",
        label: "Delete",
        Icon: Trash2,
        danger: true,
        onSelect: async (row) => {
          if (
            !window.confirm(
              `Delete meeting ${row.meetingNo}? This can't be undone.`,
            )
          ) {
            return;
          }
          const res = await deleteClientMeeting(row.id);
          if (res.ok) {
            fireToast({ message: `Deleted ${row.meetingNo}.` });
            router.refresh();
          } else {
            fireToast({ message: res.error, type: "error" });
          }
        },
      },
    ],
    [router],
  );

  const columns = React.useMemo<RegisterColumn<ClientMeetingListItem>[]>(
    () => [
      {
        id: "meetingNo",
        header: "Meeting No",
        searchable: true,
        sortValue: (r) => r.meetingNo,
        cell: (r) => (
          <Link
            href={`/meetings/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.meetingNo}
          </Link>
        ),
      },
      {
        id: "meetingDate",
        header: "Date",
        sortValue: (r) => r.meetingDate,
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {formatDate(r.meetingDate)}
          </span>
        ),
      },
      {
        id: "companyName",
        header: "Company",
        searchable: true,
        sortValue: (r) => r.companyName,
        exportValue: (r) => r.companyName,
        cell: (r) => (
          <span className="text-ink-strong font-medium">{r.companyName}</span>
        ),
      },
      {
        id: "contactPersonName",
        header: "Contact",
        searchable: true,
        sortValue: (r) => r.contactPersonName,
        exportValue: (r) => r.contactPersonName,
        cell: (r) => <span className="text-ink-soft">{r.contactPersonName}</span>,
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
        id: "purpose",
        header: "Purpose",
        // Sort by enum order for a stable, lifecycle-ish ordering.
        sortValue: (r) => MEETING_PURPOSES.indexOf(r.purpose),
        exportValue: (r) => MEETING_PURPOSE_LABELS[r.purpose],
        cell: (r) => (
          <Chip
            label={MEETING_PURPOSE_LABELS[r.purpose]}
            tone={MEETING_PURPOSE_COLORS[r.purpose]}
          />
        ),
      },
      {
        id: "nextFollowUpDate",
        header: "Next Follow-Up",
        sortValue: (r) => r.nextFollowUpDate ?? new Date(0),
        exportValue: (r) =>
          r.nextFollowUpDate ? formatDate(r.nextFollowUpDate) : "",
        cell: (r) => {
          if (!r.nextFollowUpDate) {
            return <span className="text-ink-subtle">-</span>;
          }
          const overdue = isPastDue(r.nextFollowUpDate);
          return (
            <span
              className={overdue ? "font-semibold tabular-nums" : "tabular-nums text-ink-soft"}
              style={overdue ? { color: "var(--color-red-deep)" } : undefined}
              title={overdue ? "Follow-up overdue" : undefined}
            >
              {formatDate(r.nextFollowUpDate)}
            </span>
          );
        },
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<ClientMeetingListItem>[]>(
    () => [
      {
        id: "purpose",
        label: "Purpose",
        type: "select",
        // Filter matches the column's string sortValue - the enum index - so
        // map options to the index string (same trick negotiations used).
        options: MEETING_PURPOSES.map((p, i) => ({
          value: String(i),
          label: MEETING_PURPOSE_LABELS[p],
        })),
        accessor: (r) => String(MEETING_PURPOSES.indexOf(r.purpose)),
      },
      {
        id: "salesPersonName",
        label: "Sales person",
        type: "select",
        options: employees.map((e) => ({ value: e.name, label: e.name })),
        accessor: (r) => r.salesPersonName ?? "",
      },
      {
        id: "meetingDate",
        label: "Meeting date",
        type: "dateRange",
        accessor: (r) => r.meetingDate,
      },
    ],
    [employees],
  );

  return (
    <RegisterDataTable<ClientMeetingListItem>
      tableKey="meetings"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/meetings/${r.id}` as Route}
      filters={filters}
      exportFilename="meetings"
      rowMenu={rowMenu}
      bulkAction={{
        label: "Set purpose",
        options: MEETING_PURPOSES.map((p) => ({
          value: p,
          label: MEETING_PURPOSE_LABELS[p],
        })),
        onApply: (ids, value) => setMeetingPurposeBulk(ids, value),
      }}
      bulkDelete={{
        noun: { one: "meeting", many: "meetings" },
        onDelete: (ids) =>
          deleteClientMeetingsBulk(ids).then((r) => {
            if (!r.ok) return { ok: false, error: r.error };
            if (r.failed > 0) {
              // Partial run. The bar's default toast counts the SELECTION and
              // would over-report, so state the real split via `message`.
              // Nothing deleted at all is an error, not a success.
              return r.deleted === 0
                ? {
                    ok: false,
                    error: `Nothing deleted - ${r.failed} skipped (in use).`,
                  }
                : {
                    ok: true,
                    message: `${r.deleted} deleted, ${r.failed} skipped (in use).`,
                  };
            }
            return { ok: true };
          }),
      }}
      emptyTitle="No meetings logged yet - record the first client visit."
      emptyHint="Daily client-visit log with sales, contact and outcome details appears here."
      heading={heading}
      actions={actions}
    />
  );
}
