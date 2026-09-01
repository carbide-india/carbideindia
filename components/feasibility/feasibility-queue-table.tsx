"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Trash2 } from "lucide-react";
import {
  ACTIVE_FEASIBILITY_STATUSES,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  INQUIRY_PRIORITIES,
  INQUIRY_PRIORITY_LABELS,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import { setFeasibilityStatusBulk } from "@/app/(app)/feasibility/actions";
import { recycleInquiry } from "@/app/(app)/inquiries/recycle-actions";
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

export function FeasibilityQueueTable({
  rows,
  heading,
}: {
  rows: FeasibilityQueueItem[];
  /** Rendered inside the toolbar row — see RegisterHeading. */
  heading?: React.ReactNode;
}) {
  const hrefFor = React.useCallback((id: string): Route => `/feasibility/${id}` as Route, []);

  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const del = React.useCallback(
    (id: string) => {
      startTransition(async () => {
        const res = await recycleInquiry(id);
        if (res.ok) {
          fireToast({ message: "Enquiry moved to Recycle Bin." });
          router.refresh();
        } else {
          fireToast({ type: "error", message: res.error });
        }
        setConfirmId(null);
      });
    },
    [router],
  );

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
      {
        // Delete → Recycle Bin. Row click opens the detail, so stop propagation
        // and confirm inline before deleting the whole enquiry.
        id: "__delete",
        header: "",
        width: "116px",
        cell: (r) => (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            {confirmId === r.id ? (
              <span className="inline-flex items-center gap-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => del(r.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#d03232] px-2 text-[11px] font-bold text-white transition-colors hover:bg-[#b02525] disabled:opacity-50"
                >
                  <Trash2 size={13} strokeWidth={2.4} /> Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="inline-flex h-7 items-center rounded-md border border-hairline px-2 text-[11px] font-bold text-ink-subtle hover:border-ink-subtle"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(r.id)}
                title="Delete this enquiry (moves the whole pipeline to the Recycle Bin)"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-[#d03232]/40 px-2 text-[11px] font-bold text-[#d03232] opacity-0 transition-all hover:bg-[#d03232]/10 group-hover/row:opacity-100"
              >
                <Trash2 size={13} strokeWidth={2.4} /> Delete
              </button>
            )}
          </span>
        ),
      },
    ],
    [hrefFor, confirmId, pending, del],
  );

  const filters = React.useMemo<FilterConfig<FeasibilityQueueItem>[]>(
    () => [
      { id: "companyName", label: "Company", type: "select" },
      { id: "export", label: "Export", type: "select" },
      { id: "checkedByName", label: "Checked By", type: "select" },
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
      heading={heading}
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
