"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ACTIVE_FEASIBILITY_STATUSES,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  FEAS_CHECK_VERDICTS,
  FEAS_CHECK_VERDICT_LABELS,
  FEAS_CHECK_VERDICT_TONES,
  FEAS_RISK_LABELS,
  FEAS_RISK_TONES,
  INQUIRY_PRIORITY_LABELS,
} from "@/db/enums";
import { FEAS_INDEX_THRESHOLDS } from "@/lib/feasibility/dimensions";
import { formatDate } from "@/lib/format";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import { setFeasibilityStatusBulk } from "@/app/(app)/feasibility/actions";
import type { FeasibilityQueueItem } from "@/lib/queries/feasibility";

const BULK_STATUSES = ["not_started", "in_review", "need_info", "pending_approval"] as const;

/** Days a row has waited in the queue (from createdAt to now, floored). */
function ageInDays(createdAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 864e5));
}

/** Band colour for the feasibility index (mirrors FEAS_INDEX_THRESHOLDS). */
function indexColor(score: number): string {
  if (score >= FEAS_INDEX_THRESHOLDS.feasible) return "#16a34a"; // green — feasible
  if (score >= FEAS_INDEX_THRESHOLDS.deviation) return "#d97706"; // amber — deviation
  return "#dc2626"; // red — not feasible
}

/** Compact 0–100 index: a value + a thin band-coloured fill bar. */
function IndexBar({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-[#b3b8c2]">-</span>;
  }
  const clamped = Math.max(0, Math.min(100, score));
  const color = indexColor(clamped);
  return (
    <span className="inline-flex w-full items-center justify-end gap-2">
      <span className="tabular-nums font-bold text-ink-strong" style={{ fontSize: 13 }}>
        {Math.round(clamped)}
      </span>
      <span className="h-1.5 w-[52px] shrink-0 overflow-hidden rounded-full bg-[#e6e8f0]">
        <span className="block h-full rounded-full" style={{ width: `${clamped}%`, background: color }} />
      </span>
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
          <Link href={hrefFor(r.id)} className="font-semibold text-ink-strong hover:underline" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
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
        id: "productCount",
        header: "Items",
        width: "64px",
        align: "right",
        sortValue: (r) => r.productCount,
        cell: (r) => <span className="tabular-nums font-semibold text-ink-strong">{r.productCount || "-"}</span>,
      },
      {
        id: "engineerName",
        header: "Engineer",
        width: "140px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.engineerName ?? "",
        cell: (r) => <span className="text-ink-soft">{r.engineerName ?? "-"}</span>,
      },
      {
        id: "overallScore",
        header: "Index",
        width: "116px",
        align: "right",
        sortValue: (r) => (r.overallScore ?? -1),
        exportValue: (r) => r.overallScore,
        cell: (r) => <IndexBar score={r.overallScore} />,
      },
      {
        id: "overallVerdict",
        header: "Verdict",
        width: "150px",
        sortValue: (r) => (r.overallVerdict ? FEAS_CHECK_VERDICT_LABELS[r.overallVerdict] : ""),
        cell: (r) =>
          r.overallVerdict ? (
            <Chip label={FEAS_CHECK_VERDICT_LABELS[r.overallVerdict]} tone={FEAS_CHECK_VERDICT_TONES[r.overallVerdict]} />
          ) : (
            <span className="text-[#b3b8c2]">-</span>
          ),
      },
      {
        id: "riskRating",
        header: "Risk",
        width: "88px",
        sortValue: (r) => (r.riskRating ? FEAS_RISK_LABELS[r.riskRating] : ""),
        cell: (r) =>
          r.riskRating ? (
            <Chip label={FEAS_RISK_LABELS[r.riskRating]} tone={FEAS_RISK_TONES[r.riskRating]} />
          ) : (
            <span className="text-[#b3b8c2]">-</span>
          ),
      },
      {
        id: "blockerCount",
        header: "Blocks",
        width: "78px",
        align: "right",
        sortValue: (r) => r.blockerCount,
        cell: (r) =>
          r.blockerCount > 0 ? (
            <span className="tabular-nums font-black text-[#dc2626]">{r.blockerCount}</span>
          ) : (
            <span className="tabular-nums text-[#b3b8c2]">0</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        width: "168px",
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
        id: "submittedAt",
        header: "Submitted",
        width: "116px",
        defaultHidden: true,
        sortValue: (r) => r.submittedAt ?? new Date(0),
        cell: (r) => <span className="tabular-nums text-ink-soft">{r.submittedAt ? formatDate(r.submittedAt) : "-"}</span>,
      },
      {
        id: "approvedAt",
        header: "Approved",
        width: "116px",
        defaultHidden: true,
        sortValue: (r) => r.approvedAt ?? new Date(0),
        cell: (r) => <span className="tabular-nums text-ink-soft">{r.approvedAt ? formatDate(r.approvedAt) : "-"}</span>,
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
        options: ACTIVE_FEASIBILITY_STATUSES.map((s) => ({ value: FEASIBILITY_STATUS_LABELS[s], label: FEASIBILITY_STATUS_LABELS[s] })),
        accessor: (r) => FEASIBILITY_STATUS_LABELS[r.status],
      },
      {
        id: "overallVerdict",
        label: "Verdict",
        type: "select",
        options: FEAS_CHECK_VERDICTS.map((v) => ({ value: FEAS_CHECK_VERDICT_LABELS[v], label: FEAS_CHECK_VERDICT_LABELS[v] })),
        accessor: (r) => (r.overallVerdict ? FEAS_CHECK_VERDICT_LABELS[r.overallVerdict] : ""),
      },
      {
        id: "riskRating",
        label: "Risk",
        type: "select",
        options: (["low", "medium", "high"] as const).map((s) => ({ value: FEAS_RISK_LABELS[s], label: FEAS_RISK_LABELS[s] })),
        accessor: (r) => (r.riskRating ? FEAS_RISK_LABELS[r.riskRating] : ""),
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
          options: BULK_STATUSES.map((s) => ({ value: s, label: FEASIBILITY_STATUS_LABELS[s] })),
          onApply: (ids: string[], value: string) => setFeasibilityStatusBulk(ids, value),
        },
      ]}
      emptyTitle="No enquiries to review yet."
      emptyHint="Enquiries appear here for their primary feasibility review."
    />
  );
}
