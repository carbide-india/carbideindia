"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_COLORS,
  FEASIBILITY_STATUSES,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  INQUIRY_PRIORITIES,
  INQUIRY_PRIORITY_LABELS,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { Chip, PRIORITY_TONES } from "./chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import {
  setEnquiryStatusBulk,
  setEnquiryPriorityBulk,
  setFeasibilityStatusBulk,
  assignEnquirySalesPersonBulk,
} from "@/app/(app)/inquiries/actions";
import type { InquiryListItem } from "@/lib/queries/inquiries";
import type { EmployeeOption } from "@/lib/queries/employees";

export const NEW_INQUIRY_ROUTE: Route = "/enquiries/new";

interface Props {
  rows: InquiryListItem[];
  employees: EmployeeOption[];
  /**
   * "enquiry" (default) is the Enquiry Register - enquiry columns only.
   * "feasibility" is the Primary Feasibility queue - shows the feasibility
   * status column, feasibility bulk action, and deep-links rows to the
   * feasibility tab.
   */
  variant?: "enquiry" | "feasibility";
}

/**
 * Inquiry register table - a thin config wrapper over the shared
 * RegisterDataTable. All sort / search / faceted-filter / export / bulk-status
 * runs client-side over the rows the page loads (the register is a few hundred
 * rows at most). The sales-person filter matches on the joined name, which is
 * all the row carries.
 */
export function InquiryTable({ rows, employees, variant = "enquiry" }: Props) {
  const hrefFor = React.useCallback(
    (id: string): Route =>
      (variant === "feasibility"
        ? `/enquiries/feasibility/${id}`
        : `/enquiries/register/${id}`) as Route,
    [variant],
  );
  const columns = React.useMemo<RegisterColumn<InquiryListItem>[]>(
    () => [
      {
        id: "smNumber",
        header: "SM No.",
        width: "96px",
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
        id: "enquiryDate",
        header: "Date",
        width: "108px",
        sortValue: (r) => r.enquiryDate,
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {formatDate(r.enquiryDate)}
          </span>
        ),
      },
      {
        id: "companyName",
        header: "Company",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.companyName,
        cell: (r) => (
          <span className="text-ink-strong font-medium">{r.companyName}</span>
        ),
      },
      {
        id: "productDescription",
        header: "Product",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.productDescription,
        cell: (r) => <span className="text-ink-soft">{r.productDescription}</span>,
      },
      {
        id: "priority",
        header: "Priority",
        width: "104px",
        sortValue: (r) => r.priority,
        exportValue: (r) => INQUIRY_PRIORITY_LABELS[r.priority],
        cell: (r) => (
          <Chip
            label={INQUIRY_PRIORITY_LABELS[r.priority]}
            tone={PRIORITY_TONES[r.priority]}
          />
        ),
      },
      {
        id: "salesPersonName",
        header: "Sales Person",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.salesPersonName ?? "",
        exportValue: (r) => r.salesPersonName ?? "",
        cell: (r) => (
          <span className="text-ink-soft">{r.salesPersonName ?? "-"}</span>
        ),
      },
      // Register shows Enquiry status; the Feasibility queue shows Feasibility.
      ...(variant === "feasibility"
        ? ([
            {
              id: "feasibilityStatus",
              header: "Feasibility",
              width: "148px",
              sortValue: (r) => FEASIBILITY_STATUS_LABELS[r.feasibilityStatus],
              cell: (r) => (
                <Chip
                  label={FEASIBILITY_STATUS_LABELS[r.feasibilityStatus]}
                  tone={FEASIBILITY_STATUS_COLORS[r.feasibilityStatus]}
                />
              ),
            },
          ] as RegisterColumn<InquiryListItem>[])
        : ([
            {
              id: "enquiryStatus",
              header: "Enquiry",
              width: "128px",
              sortValue: (r) => ENQUIRY_STATUS_LABELS[r.enquiryStatus],
              cell: (r) => (
                <Chip
                  label={ENQUIRY_STATUS_LABELS[r.enquiryStatus]}
                  tone={ENQUIRY_STATUS_COLORS[r.enquiryStatus]}
                />
              ),
            },
          ] as RegisterColumn<InquiryListItem>[])),
    ],
    [variant, hrefFor],
  );

  const filters = React.useMemo<FilterConfig<InquiryListItem>[]>(
    () => [
      {
        id: "enquiryStatus",
        label: "Status",
        type: "select",
        options: ENQUIRY_STATUSES.map((s) => ({
          value: ENQUIRY_STATUS_LABELS[s],
          label: ENQUIRY_STATUS_LABELS[s],
        })),
      },
      {
        id: "salesPersonName",
        label: "Sales person",
        type: "select",
        options: employees.map((e) => ({ value: e.name, label: e.name })),
        accessor: (r) => r.salesPersonName ?? "",
      },
      {
        id: "enquiryDate",
        label: "Enquiry date",
        type: "dateRange",
        accessor: (r) => r.enquiryDate,
      },
    ],
    [employees],
  );

  return (
    <RegisterDataTable<InquiryListItem>
      tableKey="enquiries"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => hrefFor(r.id)}
      filters={filters}
      exportFilename={variant === "feasibility" ? "feasibility" : "enquiries"}
      bulkActions={[
        ...(variant === "feasibility"
          ? [
              {
                label: "Set feasibility",
                options: FEASIBILITY_STATUSES.map((s) => ({
                  value: s,
                  label: FEASIBILITY_STATUS_LABELS[s],
                })),
                onApply: (ids: string[], value: string) =>
                  setFeasibilityStatusBulk(ids, value),
              },
            ]
          : [
              {
                label: "Set status",
                options: ENQUIRY_STATUSES.map((s) => ({
                  value: s,
                  label: ENQUIRY_STATUS_LABELS[s],
                })),
                onApply: (ids: string[], value: string) =>
                  setEnquiryStatusBulk(ids, value),
              },
            ]),
        {
          label: "Set priority",
          options: INQUIRY_PRIORITIES.map((p) => ({
            value: p,
            label: INQUIRY_PRIORITY_LABELS[p],
          })),
          onApply: (ids, value) => setEnquiryPriorityBulk(ids, value),
        },
        {
          label: "Assign sales person",
          options: employees.map((e) => ({ value: e.id, label: e.name })),
          onApply: (ids, value) => assignEnquirySalesPersonBulk(ids, value),
        },
      ]}
      emptyTitle={
        variant === "feasibility"
          ? "No enquiries to check yet."
          : "No enquiries yet - create the first one."
      }
      emptyHint={
        variant === "feasibility"
          ? "Enquiries appear here to run their primary feasibility check."
          : "New enquiries appear here, one SM number each."
      }
    />
  );
}
