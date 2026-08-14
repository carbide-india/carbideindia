"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Archive } from "lucide-react";
import {
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_COLORS,
  FEASIBILITY_STATUSES,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  INQUIRY_PRIORITIES,
  INQUIRY_PRIORITY_LABELS,
  SAMPLE_STATUS_LABELS,
  SAMPLE_STATUS_COLORS,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import { Chip, PRIORITY_TONES } from "./chip";

/** Sample-status colour token → hex dot. */
const SAMPLE_STATUS_TONE: Record<string, string> = {
  slate: "#64748b", blue: "#2563eb", amber: "#d97706", orange: "#ea580c",
  red: "#dc2626", stone: "#78716c", green: "#16a34a",
};
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
  archiveInquiriesBulk,
} from "@/app/(app)/inquiries/actions";
import type { InquiryListItem } from "@/lib/queries/inquiries";
import type { EmployeeOption } from "@/lib/queries/employees";

export const NEW_INQUIRY_ROUTE: Route = "/enquiries/new";

/** A compact Yes/No pill (green = yes, slate = no). Labels default to Yes/No. */
function YesNo({ value, yes = "Yes", no = "No" }: { value: boolean | null; yes?: string; no?: string }) {
  return <Chip label={value ? yes : no} tone={value ? "green" : "slate"} />;
}

interface Props {
  rows: InquiryListItem[];
  employees: EmployeeOption[];
  /** Rendered inside the toolbar row — see RegisterHeading. */
  heading?: React.ReactNode;
  /** The page's primary action, at the end of the toolbar row. */
  actions?: React.ReactNode;
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
export function InquiryTable({ rows, employees, variant = "enquiry", heading, actions }: Props) {
  const hrefFor = React.useCallback(
    (id: string): Route =>
      (variant === "feasibility"
        ? `/enquiries/feasibility/${id}`
        : `/enquiries/register/${id}`) as Route,
    [variant],
  );
  // Status columns for each variant. The variant's own status leads (visible);
  // the other one ships hidden so the Columns menu can reveal it.
  const enquiryStatusCol: RegisterColumn<InquiryListItem> = {
    id: "enquiryStatus",
    header: "Enquiry",
    width: "132px",
    defaultHidden: variant === "feasibility",
    sortValue: (r) => ENQUIRY_STATUS_LABELS[r.enquiryStatus],
    cell: (r) => (
      <Chip label={ENQUIRY_STATUS_LABELS[r.enquiryStatus]} tone={ENQUIRY_STATUS_COLORS[r.enquiryStatus]} />
    ),
  };
  const feasibilityStatusCol: RegisterColumn<InquiryListItem> = {
    id: "feasibilityStatus",
    header: "Feasibility",
    width: "152px",
    defaultHidden: variant === "enquiry",
    sortValue: (r) => FEASIBILITY_STATUS_LABELS[r.feasibilityStatus],
    cell: (r) => (
      <Chip label={FEASIBILITY_STATUS_LABELS[r.feasibilityStatus]} tone={FEASIBILITY_STATUS_COLORS[r.feasibilityStatus]} />
    ),
  };

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
        width: "104px",
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
        width: "200px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.companyName,
        cell: (r) => (
          <span className="text-ink-strong font-semibold">{r.companyName}</span>
        ),
      },
      {
        id: "contactName",
        header: "Contact",
        width: "150px",
        truncate: true,
        searchable: true,
        defaultHidden: true,
        sortValue: (r) => r.contactName ?? "",
        cell: (r) => <span className="text-ink-soft">{r.contactName ?? "-"}</span>,
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
        id: "productCount",
        header: "Items",
        width: "76px",
        align: "right",
        sortValue: (r) => r.productCount,
        cell: (r) => (
          <span className="tabular-nums font-semibold text-ink-strong">{r.productCount || "-"}</span>
        ),
      },
      {
        id: "samples",
        header: "Samples",
        width: "150px",
        sortValue: (r) => r.samples.length,
        exportValue: (r) => r.samples.map((s) => s.sampleNo).join(", "),
        cell: (r) =>
          r.samples.length === 0 ? (
            <span className="text-[#b3b8c2]">-</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1">
              {r.samples.slice(0, 2).map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-full bg-[#eef0ff] px-2 py-0.5 text-[11px] font-semibold text-[#3f3f94]"
                  title={SAMPLE_STATUS_LABELS[s.sampleStatus]}
                >
                  <span
                    className="inline-block size-1.5 rounded-full"
                    style={{ background: SAMPLE_STATUS_TONE[SAMPLE_STATUS_COLORS[s.sampleStatus]] ?? "#64748b" }}
                  />
                  {s.sampleNo}
                </span>
              ))}
              {r.samples.length > 2 && (
                <span className="text-[11px] font-semibold text-ink-subtle">+{r.samples.length - 2}</span>
              )}
            </span>
          ),
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
        id: "export",
        header: "Export",
        width: "92px",
        sortValue: (r) => (r.export ? "Yes" : "No"),
        exportValue: (r) => (r.export ? "Yes" : "No"),
        cell: (r) => <YesNo value={r.export} yes="Export" no="Domestic" />,
      },
      {
        id: "firstEnquiry",
        header: "First Enq.",
        width: "96px",
        defaultHidden: true,
        sortValue: (r) => (r.firstEnquiry ? "Yes" : "No"),
        exportValue: (r) => (r.firstEnquiry == null ? "" : r.firstEnquiry ? "Yes" : "No"),
        cell: (r) =>
          r.firstEnquiry == null ? <span className="text-[#b3b8c2]">-</span> : <YesNo value={r.firstEnquiry} />,
      },
      {
        id: "location",
        header: "Location",
        width: "150px",
        truncate: true,
        defaultHidden: true,
        sortValue: (r) => [r.city, r.state].filter(Boolean).join(", "),
        cell: (r) => {
          const loc = [r.city, r.state].filter(Boolean).join(", ");
          return <span className="text-ink-soft">{loc || "-"}</span>;
        },
      },
      {
        id: "country",
        header: "Country",
        width: "120px",
        truncate: true,
        defaultHidden: true,
        sortValue: (r) => r.country,
        cell: (r) => <span className="text-ink-soft">{r.country}</span>,
      },
      {
        id: "currency",
        header: "Curr.",
        width: "80px",
        defaultHidden: true,
        sortValue: (r) => r.currency,
        cell: (r) => <span className="font-mono text-[12px] text-ink-soft">{r.currency}</span>,
      },
      {
        id: "departmentName",
        header: "Department",
        width: "140px",
        truncate: true,
        defaultHidden: true,
        sortValue: (r) => r.departmentName ?? "",
        cell: (r) => <span className="text-ink-soft">{r.departmentName ?? "-"}</span>,
      },
      {
        id: "salesPersonName",
        header: "Sales Person",
        width: "150px",
        truncate: true,
        searchable: true,
        sortValue: (r) => r.salesPersonName ?? "",
        exportValue: (r) => r.salesPersonName ?? "",
        cell: (r) => (
          <span className="text-ink-soft">{r.salesPersonName ?? "-"}</span>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        width: "104px",
        defaultHidden: true,
        sortValue: (r) => r.createdAt,
        cell: (r) => <span className="tabular-nums text-ink-subtle">{formatDate(r.createdAt)}</span>,
      },
      // The variant's own status leads; the other trails hidden. Feasibility
      // queue → Feasibility first; Enquiry register → Enquiry first.
      ...(variant === "feasibility"
        ? [feasibilityStatusCol, enquiryStatusCol]
        : [enquiryStatusCol, feasibilityStatusCol]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant, hrefFor],
  );

  /**
   * Bulk row-removal for the Enquiry Register. It ARCHIVES (sets is_archived) -
   * an enquiry cascade-owns its items, feasibility, costings, quotations,
   * negotiations, PIs and sales orders, so a bulk hard delete would destroy the
   * whole chain; archiving drops the rows off the register and is reversible.
   * The control is labelled "Archive selected" so the UI never claims to delete.
   *
   * Deliberately NOT offered on the feasibility variant: that queue is a VIEW
   * over the same `inquiries` rows, and removing an enquiry from a feasibility
   * screen would silently take the SM off the Enquiry Register too.
   */
  const bulkArchive = React.useMemo(
    () =>
      variant === "feasibility"
        ? undefined
        : {
            label: "Archive selected",
            // Wording must match the server verb: this archives, and archiving
            // is reversible via `unarchiveInquiry`, so the bulk bar must not
            // confirm with "This can't be undone." or toast "Deleted".
            noun: { one: "enquiry", many: "enquiries" },
            verb: {
              infinitive: "archive",
              progressive: "Archiving",
              past: "Archived",
            },
            irreversible: false,
            Icon: Archive,
            onDelete: async (ids: string[]) => {
              const res = await archiveInquiriesBulk(ids);
              if (!res.ok) return { ok: false, error: res.error };
              // Partial outcomes go through `message`, which REPLACES the bulk
              // bar's default toast — that one counts the selection and would
              // claim rows that were never archived.
              if (res.failed > 0) {
                return res.archived === 0
                  ? {
                      ok: false,
                      error: `Nothing archived - ${res.failed} no longer on the register.`,
                    }
                  : {
                      ok: true,
                      message: `${res.archived} archived, ${res.failed} skipped (no longer on the register).`,
                    };
              }
              return { ok: true };
            },
          },
    [variant],
  );

  // Distinct country list (from the loaded rows) for the country facet.
  const countryOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.country) set.add(r.country);
    return [...set].sort().map((c) => ({ value: c, label: c }));
  }, [rows]);

  const filters = React.useMemo<FilterConfig<InquiryListItem>[]>(
    () => [
      variant === "feasibility"
        ? {
            id: "feasibilityStatus",
            label: "Status",
            type: "select" as const,
            options: FEASIBILITY_STATUSES.map((s) => ({
              value: FEASIBILITY_STATUS_LABELS[s],
              label: FEASIBILITY_STATUS_LABELS[s],
            })),
            accessor: (r: InquiryListItem) => FEASIBILITY_STATUS_LABELS[r.feasibilityStatus],
          }
        : {
            id: "enquiryStatus",
            label: "Status",
            type: "select" as const,
            options: ENQUIRY_STATUSES.map((s) => ({
              value: ENQUIRY_STATUS_LABELS[s],
              label: ENQUIRY_STATUS_LABELS[s],
            })),
            accessor: (r: InquiryListItem) => ENQUIRY_STATUS_LABELS[r.enquiryStatus],
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
        id: "salesPersonName",
        label: "Sales person",
        type: "select",
        options: employees.map((e) => ({ value: e.name, label: e.name })),
        accessor: (r) => r.salesPersonName ?? "",
      },
      {
        id: "export",
        label: "Trade",
        type: "select",
        options: [
          { value: "Export", label: "Export" },
          { value: "Domestic", label: "Domestic" },
        ],
        accessor: (r) => (r.export ? "Export" : "Domestic"),
      },
      {
        id: "country",
        label: "Country",
        type: "select",
        options: countryOptions,
        accessor: (r) => r.country,
      },
      {
        id: "enquiryDate",
        label: "Period",
        type: "period",
        accessor: (r) => r.enquiryDate,
      },
    ],
    [employees, variant, countryOptions],
  );

  return (
    <RegisterDataTable<InquiryListItem>
      tableKey="enquiries"
      rows={rows}
      heading={heading}
      actions={actions}
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
      bulkDelete={bulkArchive}
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
