"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_COLORS,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  INQUIRY_PRIORITY_LABELS,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { Chip, PRIORITY_TONES } from "./chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import { setEnquiryStatusBulk } from "@/app/(app)/inquiries/actions";
import type { InquiryListItem } from "@/lib/queries/inquiries";
import type { EmployeeOption } from "@/lib/queries/employees";

export const NEW_INQUIRY_ROUTE: Route = "/inquiries/new";

interface Props {
  rows: InquiryListItem[];
  employees: EmployeeOption[];
}

/**
 * Inquiry register table — a thin config wrapper over the shared
 * RegisterDataTable. All sort / search / faceted-filter / export / bulk-status
 * runs client-side over the rows the page loads (the register is a few hundred
 * rows at most). The sales-person filter matches on the joined name, which is
 * all the row carries.
 */
export function InquiryTable({ rows, employees }: Props) {
  const columns = React.useMemo<RegisterColumn<InquiryListItem>[]>(
    () => [
      {
        id: "smNumber",
        header: "SM Number",
        searchable: true,
        sortValue: (r) => r.smNumber,
        cell: (r) => (
          <Link
            href={`/inquiries/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.smNumber}
          </Link>
        ),
      },
      {
        id: "enquiryDate",
        header: "Enquiry Date",
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
        searchable: true,
        sortValue: (r) => r.companyName,
        cell: (r) => (
          <span className="text-ink-strong font-medium">{r.companyName}</span>
        ),
      },
      {
        id: "productDescription",
        header: "Product",
        searchable: true,
        sortValue: (r) => r.productDescription,
        cell: (r) => (
          <span
            className="block max-w-[60ch] truncate text-ink-soft"
            title={r.productDescription}
          >
            {r.productDescription}
          </span>
        ),
      },
      {
        id: "priority",
        header: "Priority",
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
        searchable: true,
        sortValue: (r) => r.salesPersonName ?? "",
        exportValue: (r) => r.salesPersonName ?? "",
        cell: (r) => (
          <span className="text-ink-soft">{r.salesPersonName ?? "—"}</span>
        ),
      },
      {
        id: "enquiryStatus",
        header: "Enquiry Status",
        sortValue: (r) => ENQUIRY_STATUS_LABELS[r.enquiryStatus],
        cell: (r) => (
          <Chip
            label={ENQUIRY_STATUS_LABELS[r.enquiryStatus]}
            tone={ENQUIRY_STATUS_COLORS[r.enquiryStatus]}
          />
        ),
      },
      {
        id: "feasibilityStatus",
        header: "Feasibility Status",
        sortValue: (r) => FEASIBILITY_STATUS_LABELS[r.feasibilityStatus],
        cell: (r) => (
          <Chip
            label={FEASIBILITY_STATUS_LABELS[r.feasibilityStatus]}
            tone={FEASIBILITY_STATUS_COLORS[r.feasibilityStatus]}
          />
        ),
      },
    ],
    [],
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
      getOpenHref={(r) => `/inquiries/${r.id}` as Route}
      filters={filters}
      exportFilename="enquiries"
      bulkAction={{
        label: "Set status",
        options: ENQUIRY_STATUSES.map((s) => ({
          value: s,
          label: ENQUIRY_STATUS_LABELS[s],
        })),
        onApply: (ids, value) => setEnquiryStatusBulk(ids, value),
      }}
      emptyTitle="No enquiries yet — create the first one."
      emptyHint="New enquiries appear here, one SM number each."
    />
  );
}
