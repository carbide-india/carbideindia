"use client";

import * as React from "react";
import type { Route } from "next";
import { Calculator, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  COSTING_DONE_STATUS_COLORS,
  COSTING_DONE_STATUS_LABELS,
  COSTING_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STATUS_COLORS,
  SECONDARY_FEASIBILITY_STATUS_LABELS,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type FilterConfig,
  type RegisterColumn,
} from "@/components/registers/register-data-table";
import type { CostingRegisterRow } from "@/lib/queries/costings";

/**
 * "Start a Costing" — the target picker shown when /costings/new is opened
 * without a product line.
 *
 * A costing must attach to a specific inquiry_item, so rather than 404 we list
 * the lines that can be costed and let the user pick one. It used to be a plain
 * search-and-scroll list of SM number / product / company, which gave no way to
 * answer the question people actually arrive with — "which of these still needs
 * costing, and which is overdue?" It is now the same RegisterDataTable every
 * other register uses: sortable columns, faceted filters, column visibility,
 * density and CSV export, all for free and all consistent with the Costing
 * Register it sits beside.
 *
 * It reads the SAME rows as the register (`listCostingRegister`), so a line's
 * status here can never disagree with its status there.
 */
export function CostingTargetPicker({ rows }: { rows: CostingRegisterRow[] }) {
  /** Where "cost this line" lands: a fresh sheet bound to the product line. */
  const costHref = React.useCallback(
    (r: CostingRegisterRow) =>
      `/costings/new?inquiryItemId=${r.inquiryItemId}&inquiryId=${r.inquiryId}` as Route,
    [],
  );

  const columns = React.useMemo<RegisterColumn<CostingRegisterRow>[]>(
    () => [
      {
        id: "smNumber",
        header: "SM No.",
        width: "104px",
        searchable: true,
        sortValue: (r) => r.smNumber ?? "",
        cell: (r) => (
          <span className="font-mono text-[13px] font-black tabular-nums text-[#3f3f94]">
            {r.smNumber ?? "—"}
          </span>
        ),
      },
      {
        id: "companyName",
        header: "Company",
        width: "200px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.companyName ?? "",
        cell: (r) => (
          <span className="font-semibold text-ink-strong">{r.companyName ?? "—"}</span>
        ),
      },
      {
        id: "custProductName",
        header: "Product",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.custProductName ?? "",
        cell: (r) => (
          <span className="font-semibold text-ink-strong">
            {r.custProductName ?? "Unnamed product"}
          </span>
        ),
      },
      {
        id: "quantity",
        header: "Qty",
        width: "96px",
        align: "right",
        sortValue: (r) => Number(r.quantityNos ?? 0),
        exportValue: (r) => r.quantityNos ?? "",
        cell: (r) =>
          r.quantityNos ? (
            <span className="tabular-nums font-semibold text-ink-strong">
              {r.quantityNos}
              <span className="ml-1 text-[11px] font-bold text-ink-subtle">
                {r.quantityUom ?? ""}
              </span>
            </span>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      {
        id: "bucket",
        header: "Costing Status",
        width: "150px",
        sortValue: (r) => r.bucket,
        exportValue: (r) => COSTING_DONE_STATUS_LABELS[r.bucket],
        cell: (r) => (
          <Chip
            label={COSTING_DONE_STATUS_LABELS[r.bucket]}
            tone={COSTING_DONE_STATUS_COLORS[r.bucket]}
          />
        ),
      },
      {
        id: "costed",
        header: "Costed",
        width: "96px",
        sortValue: (r) => (r.costingId ? "yes" : "no"),
        exportValue: (r) => (r.costingId ? "Yes" : "No"),
        cell: (r) =>
          r.costingId ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ed] px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide text-[#1c7a44]">
              <CheckCircle2 size={11} strokeWidth={2.6} />
              Costed
            </span>
          ) : (
            <span className="text-[12px] font-semibold text-ink-subtle">Not costed</span>
          ),
      },
      {
        id: "revisions",
        header: "Revisions",
        width: "96px",
        align: "right",
        defaultHidden: true,
        sortValue: (r) => r.costingCount,
        cell: (r) => (
          <span className="tabular-nums font-semibold text-ink-soft">{r.costingCount}</span>
        ),
      },
      {
        id: "secondaryFeasibilityStatus",
        header: "Secondary Feasibility",
        width: "168px",
        defaultHidden: true,
        sortValue: (r) => r.secondaryFeasibilityStatus,
        exportValue: (r) =>
          SECONDARY_FEASIBILITY_STATUS_LABELS[r.secondaryFeasibilityStatus],
        cell: (r) => (
          <Chip
            label={SECONDARY_FEASIBILITY_STATUS_LABELS[r.secondaryFeasibilityStatus]}
            tone={SECONDARY_FEASIBILITY_STATUS_COLORS[r.secondaryFeasibilityStatus]}
          />
        ),
      },
      {
        id: "targetDate",
        header: "Target",
        width: "128px",
        sortValue: (r) => r.targetDate ?? new Date(0),
        exportValue: (r) => (r.targetDate ? formatDate(r.targetDate) : ""),
        cell: (r) =>
          r.targetDate ? (
            <span
              className={
                r.overdue
                  ? "inline-flex items-center gap-1 font-bold text-[#b3261e]"
                  : "font-semibold text-ink-soft"
              }
            >
              {r.overdue && <AlertTriangle size={12} strokeWidth={2.6} />}
              {formatDate(r.targetDate)}
            </span>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      {
        id: "createdAt",
        header: "Date",
        width: "112px",
        sortValue: (r) => r.createdAt,
        exportValue: (r) => formatDate(r.createdAt),
        cell: (r) => (
          <span className="tabular-nums font-semibold text-ink-soft">
            {formatDate(r.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<CostingRegisterRow>[]>(
    () => [
      {
        id: "bucket",
        label: "Costing status",
        type: "select",
        options: COSTING_STAGE_BUCKETS.map((b) => ({
          value: b,
          label: COSTING_DONE_STATUS_LABELS[b],
        })),
      },
      {
        id: "costed",
        label: "Costed",
        type: "select",
        options: [
          { value: "no", label: "Not costed yet" },
          { value: "yes", label: "Already costed" },
        ],
      },
      {
        id: "overdue",
        label: "Overdue",
        type: "select",
        options: [
          { value: "yes", label: "Overdue" },
          { value: "no", label: "On time / un-dated" },
        ],
        accessor: (r) => (r.overdue ? "yes" : "no"),
      },
      {
        id: "companyName",
        label: "Company",
        type: "select",
        // Faceted off the live rows so it only ever offers companies that are
        // actually present — an empty option would filter to nothing.
        options: [...new Set(rows.map((r) => r.companyName).filter(Boolean))]
          .sort((a, b) => (a as string).localeCompare(b as string))
          .map((c) => ({ value: c as string, label: c as string })),
      },
      { id: "createdAt", label: "Enquiry date", type: "period" },
    ],
    [rows],
  );

  const notCosted = rows.reduce((n, r) => (r.costingId ? n : n + 1), 0);

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
          <Calculator size={22} strokeWidth={2.4} />
          Start a Costing
        </h1>
        <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
          {rows.length} costable line{rows.length === 1 ? "" : "s"} · {notCosted} not
          costed yet. Only lines that have cleared Primary Feasibility appear here —
          pick one to open a fresh cost sheet against it.
        </p>
      </header>

      <RegisterDataTable<CostingRegisterRow>
        tableKey="costing-target-picker"
        rows={rows}
        getRowId={(r) => r.id}
        columns={columns}
        getOpenHref={costHref}
        filters={filters}
        exportFilename="costable-lines"
        emptyTitle="No product lines are ready to cost yet."
        emptyHint="A line becomes costable once its enquiry is approved in Primary Feasibility and the line's feasibility is confirmed."
      />
    </div>
  );
}
