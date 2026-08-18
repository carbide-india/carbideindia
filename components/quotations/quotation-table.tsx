"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Layers,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import {
  COSTING_DONE_STATUSES,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
  DEPRECATED_COSTING_DONE_STATUSES,
  QUOTATION_STAGE_BUCKETS,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_COLORS,
  type CostingDoneStatus,
} from "@/db/enums";
import { formatInr, formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
} from "@/components/registers/register-data-table";
import {
  setQuotationStatusBulk,
  setQuotationBucketBulk,
  setQuotationSentBulk,
  deleteQuotationsBulk,
} from "@/app/(app)/quotations/actions";
import { revisionLabel } from "@/components/quotations/costing-basis";
import type {
  QuotationListItem,
  QuotationLineProduct,
} from "@/lib/queries/quotations";

export const NEW_QUOTATION_ROUTE: Route = "/quotations/new";

interface Props {
  rows: QuotationListItem[];
  /** True when the page pre-filtered the rows from a dashboard tile - the
   *  empty state then says so instead of claiming the register is empty. */
  filtered?: boolean;
  /** Rendered inside the toolbar row — see RegisterHeading. */
  heading?: React.ReactNode;
  /** The page's primary action, at the end of the toolbar row. */
  actions?: React.ReactNode;
}

/** Live pickers hide the deprecated costing values (kept in the enum only so
 *  legacy rows still render). */
const COSTING_PICKER_STATUSES = COSTING_DONE_STATUSES.filter(
  (s) => !(DEPRECATED_COSTING_DONE_STATUSES as readonly string[]).includes(s),
) as CostingDoneStatus[];

/** Parse a numeric-string money column to a number for right-aligned ₹ display
 *  and numeric sorting; em-dash when unset or unparseable. */
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

/** The quote carries an SM snapshot of the enquiry date; legacy rows may lack
 *  it, so date sorting / filtering falls back to createdAt. */
function quoteDate(r: QuotationListItem): Date {
  return r.enquiryDate ?? r.createdAt;
}

/** Fallback label for a quoted line with no resolvable descriptor. */
function productLabel(p: QuotationLineProduct, index: number): string {
  return p.name ?? `Line ${index + 1}`;
}

/** Format a numeric-string qty for the products table; em-dash when unset. */
function qtyText(qty: string | null): string {
  if (qty == null || qty === "") return "-";
  const n = Number(qty);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : "-";
}

/** A spec/text cell value: the value, or an em-dash when blank. */
function cellText(value: string | null | undefined): string {
  return value == null || value === "" ? "-" : value;
}

/** Every product name to show for a quote: the resolved line-products when
 *  present, else the header's line-1 mirror as a single synthesized entry. */
function productNames(r: QuotationListItem): string[] {
  if (r.lineProducts.length > 0) {
    return r.lineProducts.map((p, i) => productLabel(p, i));
  }
  return r.custProductName ? [r.custProductName] : [];
}

/** Search/sort key: all product names joined so any product matches search. */
function productSortText(r: QuotationListItem): string {
  return productNames(r).join(" · ");
}

/** CSV value: all quoted products joined (mirrors what the register shows). */
function productExportText(r: QuotationListItem): string {
  const names = productNames(r);
  return names.length ? names.join(" · ") : "";
}

/**
 * "Costing Used" cell - which costing REVISION the line's frozen cost basis came
 * from, and whether a newer revision has since superseded it. The revision model
 * lives on `costings` (owned by the costing workstream); this only displays the
 * latest one the query resolved. Silent when the line has no costing at all -
 * an em-dash, never a false "up to date".
 */
function CostingUsedCell({ product }: { product: QuotationLineProduct }) {
  const latest = product.latestCosting;
  if (!latest) return <span className="text-ink-subtle">-</span>;
  const label =
    revisionLabel(latest.revisionNo, latest.costingTypeLabel) ?? "-";
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      {product.costBasisStale && (
        <span
          title={`Quoted on ${moneyText(product.costBasis)}; latest revision is ${moneyText(latest.finalUnitCost)}`}
          className="inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-[10.5px] font-bold"
          style={{
            background: "color-mix(in srgb, var(--color-amber) 14%, transparent)",
            color: "var(--color-amber-deep)",
          }}
        >
          <AlertTriangle size={10.5} strokeWidth={2.6} />
          Superseded
        </span>
      )}
    </span>
  );
}

/**
 * Detailed products popover - a compact aligned TABLE (one row per quoted
 * line-product) surfacing name + qty + read-through spec (grade / tolerance /
 * condition / part-no) + the line's quote price. Opened from the "View more
 * products" trigger; `stopPropagation` on the trigger keeps the register row's
 * open-navigation from firing.
 */
function ProductsTablePopover({ row }: { row: QuotationListItem }) {
  const products = row.lineProducts;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`View all ${products.length} quoted products`}
          className="inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[12px] font-semibold text-brand tabular-nums transition-colors hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Layers size={12.5} strokeWidth={2.4} />
          View more products
          <ChevronRight size={12} strokeWidth={2.6} className="-ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onClick={(e) => e.stopPropagation()}
        className="w-[min(46rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center gap-2 border-b border-hairline px-3.5 py-2.5">
          <Layers size={13} strokeWidth={2.4} className="text-brand" />
          <span className="text-[13px] font-bold text-ink-strong">
            Quoted Products ({products.length})
          </span>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] font-bold uppercase tracking-wider text-ink-subtle">
                <th className="px-2.5 py-2 text-right font-bold">#</th>
                <th className="px-2.5 py-2 text-left font-bold">Product</th>
                <th className="px-2.5 py-2 text-right font-bold">Qty</th>
                <th className="px-2.5 py-2 text-left font-bold">Grade</th>
                <th className="px-2.5 py-2 text-left font-bold">Tolerance</th>
                <th className="px-2.5 py-2 text-left font-bold">Condition</th>
                <th className="px-2.5 py-2 text-left font-bold">Part No</th>
                <th className="px-2.5 py-2 text-right font-bold">Quote Price</th>
                <th className="px-2.5 py-2 text-left font-bold">Costing Used</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr
                  key={p.id}
                  className="border-b border-hairline/60 last:border-0 hover:bg-surface-soft/60"
                >
                  <td className="px-2.5 py-2 text-right text-[11px] font-bold tabular-nums text-ink-subtle">
                    {i + 1}
                  </td>
                  <td className="px-2.5 py-2 font-medium text-ink-strong">
                    {productLabel(p, i)}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-ink-soft">
                    {qtyText(p.qty)}
                  </td>
                  <td className="px-2.5 py-2 text-ink-soft">
                    {cellText(p.grade)}
                  </td>
                  <td className="px-2.5 py-2 text-ink-soft">
                    {cellText(p.tolerance)}
                  </td>
                  <td className="px-2.5 py-2 text-ink-soft">
                    {cellText(p.condition)}
                  </td>
                  <td
                    className="px-2.5 py-2 text-ink-soft"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                  >
                    {cellText(p.partNo)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold tabular-nums text-ink-strong">
                    {moneyText(p.quotePrice)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2">
                    <CostingUsedCell product={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Product cell - shows the first quoted product as before. When a quotation
 * carries MORE than one line-product a "View more products" trigger opens a
 * detailed table popover (see `ProductsTablePopover`). Legacy quotes with a
 * single (or no) product render exactly as they did - just the name.
 */
function ProductCell({ row }: { row: QuotationListItem }) {
  // Primary text stays the line-1 mirror the register always showed; fall back
  // to the first resolved line-product when the mirror is empty.
  const primary =
    row.custProductName ??
    (row.lineProducts.length ? productLabel(row.lineProducts[0]!, 0) : "-");
  const hasMore = row.lineProducts.length > 1;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="block max-w-[240px] truncate text-ink-soft"
        title={primary === "-" ? undefined : primary}
      >
        {primary}
      </span>
      {hasMore && <ProductsTablePopover row={row} />}
    </div>
  );
}

/**
 * Quotation (Quote Master) register table - a thin config wrapper over the
 * shared RegisterDataTable. All sort / search / faceted-filter / export /
 * bulk-status runs client-side over the rows the page loads.
 */
export function QuotationTable({ rows, filtered = false, heading, actions }: Props) {

  // Per-row actions menu: Open + a destructive Delete. Delete is a HARD delete
  // (quotations have no record-level recycle bin), so it confirms first and the
  // server action refuses when a negotiation / sales order was built from it.
  const columns = React.useMemo<RegisterColumn<QuotationListItem>[]>(
    () => [
      {
        id: "quoteNo",
        header: "Quote No",
        searchable: true,
        sortValue: (r) => r.quoteNo,
        cell: (r) => (
          <Link
            href={`/quotations/${r.id}` as Route}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.quoteNo}
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
        id: "custProductName",
        header: "Product",
        searchable: true,
        // Search/sort over EVERY quoted line-product, not just the line-1
        // mirror, so a quote is findable by any of its products.
        sortValue: (r) => productSortText(r),
        exportValue: (r) => productExportText(r),
        cell: (r) => <ProductCell row={r} />,
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
        // THIS stage's bucket - what the dashboard counts. Kept ahead of the
        // inherited costing status so the register reads in stage order.
        id: "quotationStatus",
        header: "Quotation Status",
        sortValue: (r) => QUOTATION_STAGE_BUCKETS.indexOf(r.quotationStatus),
        exportValue: (r) => QUOTATION_STATUS_LABELS[r.quotationStatus],
        cell: (r) => (
          <Chip
            label={QUOTATION_STATUS_LABELS[r.quotationStatus]}
            tone={QUOTATION_STATUS_COLORS[r.quotationStatus]}
          />
        ),
      },
      {
        id: "costingDoneStatus",
        header: "Costing Done",
        sortValue: (r) => COSTING_DONE_STATUS_LABELS[r.costingDoneStatus],
        cell: (r) => (
          <Chip
            label={COSTING_DONE_STATUS_LABELS[r.costingDoneStatus]}
            tone={COSTING_DONE_STATUS_COLORS[r.costingDoneStatus]}
          />
        ),
      },
      {
        // How many quoted lines rest on a costing revision that has since been
        // superseded - the one thing the revision model changes for this stage.
        id: "staleCostLines",
        header: "Cost Basis",
        sortValue: (r) => r.staleCostLines,
        exportValue: (r) =>
          r.staleCostLines > 0 ? `${r.staleCostLines} superseded` : "Current",
        cell: (r) =>
          r.staleCostLines > 0 ? (
            <Chip
              label={`${r.staleCostLines} superseded`}
              tone={COSTING_DONE_STATUS_COLORS.need_info}
            />
          ) : (
            <span className="text-[13px] font-semibold text-ink-subtle">
              Current
            </span>
          ),
      },
      {
        id: "quoteSent",
        header: "Quote Sent",
        sortValue: (r) => (r.quoteSent ? 1 : 0),
        exportValue: (r) => (r.quoteSent ? "Yes" : "No"),
        cell: (r) =>
          r.quoteSent ? (
            <Chip label="Yes" tone="green" />
          ) : (
            <span className="text-[13px] font-semibold text-ink-subtle">No</span>
          ),
      },
      {
        id: "enquiryDate",
        header: "Enquiry Date",
        defaultHidden: true,
        sortValue: (r) => quoteDate(r),
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {formatDate(quoteDate(r))}
          </span>
        ),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<QuotationListItem>[]>(
    () => [
      {
        id: "quotationStatus",
        label: "Quotation",
        type: "select",
        options: QUOTATION_STAGE_BUCKETS.map((s) => ({
          value: QUOTATION_STATUS_LABELS[s],
          label: QUOTATION_STATUS_LABELS[s],
        })),
        accessor: (r) => QUOTATION_STATUS_LABELS[r.quotationStatus],
      },
      {
        id: "staleCostLines",
        label: "Cost basis",
        type: "select",
        options: [
          { value: "Superseded", label: "Superseded" },
          { value: "Current", label: "Current" },
        ],
        accessor: (r) => (r.staleCostLines > 0 ? "Superseded" : "Current"),
      },
      {
        // Deliberately lists EVERY costing value, deprecated ones included, so
        // legacy rows sitting in "In Process" / "Done" stay findable.
        id: "costingDoneStatus",
        label: "Costing",
        type: "select",
        options: COSTING_DONE_STATUSES.map((s) => ({
          value: COSTING_DONE_STATUS_LABELS[s],
          label: COSTING_DONE_STATUS_LABELS[s],
        })),
      },
      {
        id: "quoteSent",
        label: "Quote sent",
        type: "select",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
        ],
        accessor: (r) => (r.quoteSent ? "Yes" : "No"),
      },
      {
        id: "enquiryDate",
        label: "Enquiry date",
        type: "period",
        accessor: (r) => quoteDate(r),
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<QuotationListItem>
      tableKey="quotations"
      rows={rows}
      heading={heading}
      actions={actions}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) => `/quotations/${r.id}` as Route}
      filters={filters}
      exportFilename="quotations"
      bulkActions={[
        {
          label: "Set quotation status",
          options: QUOTATION_STAGE_BUCKETS.map((s) => ({
            value: s,
            label: QUOTATION_STATUS_LABELS[s],
          })),
          onApply: (ids, value) => setQuotationBucketBulk(ids, value),
        },
        {
          label: "Quote sent",
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
          onApply: (ids, value) => setQuotationSentBulk(ids, value),
        },
        {
          // Inherited upstream state - editable here only because the legacy
          // register always allowed it. Deprecated values are not offered.
          label: "Set costing status",
          options: COSTING_PICKER_STATUSES.map((s) => ({
            value: s,
            label: COSTING_DONE_STATUS_LABELS[s],
          })),
          onApply: (ids, value) => setQuotationStatusBulk(ids, value),
        },
      ]}
      bulkDelete={{
        noun: { one: "quotation", many: "quotations" },
        onDelete: (ids) =>
          deleteQuotationsBulk(ids).then((r) =>
            r.ok ? { ok: true } : { ok: false, error: r.error },
          ),
      }}
      emptyTitle={
        filtered
          ? "Nothing in this bucket."
          : "No quotations yet - build the first one."
      }
      emptyHint={
        filtered
          ? "Pick another tile above, or open All Quotations to see the whole register."
          : "Priced quotes built from an enquiry appear here, with costing status and validity."
      }
    />
  );
}
