"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Pencil,
  PanelRightOpen,
  Building2,
  ArrowUpRight,
  ArrowLeft,
  Factory,
} from "lucide-react";
import { COSTING_TYPE_LABELS } from "@/db/enums";
import { formatDate, formatInr } from "@/lib/format";
import type { ItemDetail } from "@/lib/queries/items";
import type { AuditEntry } from "@/lib/queries/audit";
import type { ItemDocument } from "@/lib/queries/item-documents";
import type {
  ItemWhereUsed,
  RelatedRecord,
  CostHistoryRow,
  QuotePriceRow,
} from "@/lib/queries/item-where-used";
import { StatusPill, ITEM_STATUS_PILL, type PillTone } from "@/components/erp/status-pill";
import { DetailGrid, type DetailField } from "@/components/erp/detail-grid";
import { ContextDrawer } from "@/components/erp/context-drawer";
import { cn } from "@/lib/utils";
import { AuditHistory } from "@/components/audit/audit-history";
import { ItemDocuments } from "@/components/items/item-documents";
import { ItemStatusControl } from "@/components/items/item-status-control";

/**
 * ItemWorkspace (ERP redesign - Phase 3 reference, EXTENDED in Phase 9a).
 *
 * The Item as a Product-Intelligence DB: AppShell + WorkspaceHeader + lifecycle
 * Stepper + tabs on DetailGrid, now fed by the REAL where-used graph
 * (`getItemWhereUsed`). The Phase-3 "coming in Phase 9" placeholders are
 * replaced with live data:
 *   - Overview   - spec digest + reach chips + a summary rail (cost/quote/reach).
 *   - Commercial - live cost history (costings) + quotation price history.
 *   - Manufacturing - route/part facts + latest production order.
 *   - Related    - every referencing SM / quote / neg / SO / job-card / invoice,
 *                  clickable to its record.
 *   - Where-Used - customers-using fan-out + the same related graph.
 *   - Timeline   - a merged chronology across all referencing records.
 * Everything clickable + linked; the ContextDrawer peek mirrors the top tabs.
 */

interface ItemWorkspaceProps {
  item: ItemDetail;
  auditEntries: AuditEntry[];
  documents: ItemDocument[];
  whereUsed: ItemWhereUsed;
  isAdmin: boolean;
}

type TabKey =
  | "overview"
  | "specifications"
  | "commercial"
  | "manufacturing"
  | "related"
  | "whereUsed"
  | "timeline"
  | "history"
  | "documents";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "specifications", label: "Specifications" },
  { key: "commercial", label: "Commercial" },
  { key: "manufacturing", label: "Manufacturing" },
  { key: "related", label: "Related" },
  { key: "whereUsed", label: "Where-Used" },
  { key: "timeline", label: "Timeline" },
  { key: "history", label: "History" },
  { key: "documents", label: "Documents" },
];

function composeDimensions(item: ItemDetail): string | null {
  const parts: string[] = [];
  if (item.outerDia) parts.push(`OD ${item.outerDia}`);
  if (item.innerDia) parts.push(`ID ${item.innerDia}`);
  if (item.length) parts.push(`L ${item.length}`);
  if (item.width) parts.push(`W ${item.width}`);
  if (item.thickness) parts.push(`T ${item.thickness}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** ₹ from a numeric-string DB column (null-safe). */
function inr(v: string | null): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? formatInr(n) : null;
}

export function ItemWorkspace({
  item,
  auditEntries,
  documents,
  whereUsed,
  isAdmin,
}: ItemWorkspaceProps) {
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const statusPill = ITEM_STATUS_PILL[item.status] ?? ITEM_STATUS_PILL.active;
  const dimensions = composeDimensions(item);
  const altUomValue =
    item.altUom && item.altUomConversion
      ? `${item.altUom} (1 = ${item.altUomConversion} ${item.uom ?? "base"})`
      : item.altUom;

  const specFields: DetailField[] = [
    { label: "Shape", value: item.shapeName },
    { label: "Grade (Internal)", value: item.gradeName },
    { label: "Tolerance", value: item.toleranceName },
    { label: "Condition", value: item.conditionName },
    { label: "Size Code", value: item.sizeCode },
    { label: "Dimensions", value: dimensions, mono: true },
    { label: "Dimension Notes", value: item.dimensionNotes, full: true },
    { label: "HSN Code", value: item.hsnCode, mono: true },
    { label: "Unit of Measure", value: item.uom },
    { label: "Alt UoM", value: altUomValue },
  ];

  const overviewFields: DetailField[] = [
    { label: "Item Code", value: item.itemCode, mono: true },
    { label: "Sequence", value: item.seq ? `#${item.seq}` : null, mono: true },
    { label: "Shape", value: item.shapeName },
    { label: "Grade (Internal)", value: item.gradeName },
    { label: "Dimensions", value: dimensions, mono: true },
    { label: "Costing Type", value: item.costingType ? COSTING_TYPE_LABELS[item.costingType] : null },
  ];

  const manufacturingFields: DetailField[] = [
    { label: "Costing Type", value: item.costingType ? COSTING_TYPE_LABELS[item.costingType] : null },
    { label: "Part No", value: item.partNo, mono: true },
    { label: "Part Description 1", value: item.partDescription1 },
    { label: "Part Description 2", value: item.partDescription2 },
    { label: "Part Description 3", value: item.partDescription3 },
    { label: "Part Description 4", value: item.partDescription4 },
    { label: "Part Tag", value: item.partTag },
  ];

  const provenanceFields: DetailField[] = [
    { label: "Origin Customer", value: item.originCustomerName, snapshot: true },
    { label: "Origin SM Number", value: item.originSmNumber, mono: true, snapshot: true },
    { label: "Origin Product Name", value: item.originCustProductName, snapshot: true },
    { label: "Origin Drawing No", value: item.custDrawingNo, snapshot: true },
    { label: "Drawing Revision", value: item.drawingRevisionNo, snapshot: true },
    { label: "Created", value: formatDate(item.createdAt) },
    { label: "Last Updated", value: formatDate(item.updatedAt) },
  ];

  const tabBody: Record<TabKey, React.ReactNode> = {
    overview: (
      <div className="flex flex-col gap-8">
        <Section title="At a glance">
          <DetailGrid fields={overviewFields} columns={3} />
        </Section>
        <Section title="Reach" subtitle="Everywhere this exact spec is used across the pipeline">
          <ReachChips reach={whereUsed} />
        </Section>
        {whereUsed.customers.length > 0 && (
          <Section title="Customers using this spec">
            <CustomerChips customers={whereUsed.customers} />
          </Section>
        )}
      </div>
    ),
    specifications: (
      <Section title="Specification" subtitle="Reusable engineering spec (SSOT)">
        <DetailGrid fields={specFields} columns={2} />
      </Section>
    ),
    commercial: (
      <div className="flex flex-col gap-8">
        <Section
          title="Cost history"
          subtitle="Live from costings linked to this item - chosen first"
        >
          <CostHistoryTable rows={whereUsed.costHistory} />
        </Section>
        <Section
          title="Quotation prices"
          subtitle="Frozen unit price the customer saw (else the live draft price)"
        >
          <QuotePriceTable rows={whereUsed.quotePrices} />
        </Section>
      </div>
    ),
    manufacturing: (
      <div className="flex flex-col gap-8">
        <Section title="Route & part identity">
          <DetailGrid fields={manufacturingFields} columns={2} />
        </Section>
        <Section title="Latest production">
          {whereUsed.latestProduction ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
              <Factory size={16} strokeWidth={2.2} className="text-ink-subtle" />
              <span className="font-mono text-[14px] font-bold text-ink-strong">
                {whereUsed.latestProduction.poNo}
              </span>
              <StatusPill tone="blue" size="sm">
                {whereUsed.latestProduction.status}
              </StatusPill>
              <span className="text-[13px] text-ink-muted">
                Planned {whereUsed.latestProduction.qtyPlanned ?? "-"} · Produced{" "}
                {whereUsed.latestProduction.qtyProduced ?? "-"}
              </span>
              <span className="ml-auto text-[12px] text-ink-subtle">
                {formatDate(whereUsed.latestProduction.updatedAt)}
              </span>
            </div>
          ) : (
            <Empty>No production orders reference this item yet.</Empty>
          )}
        </Section>
      </div>
    ),
    related: (
      <Section
        title="Related records"
        subtitle="Every SM, quote, negotiation, sales order, job card and invoice using this item"
      >
        <RelatedList records={whereUsed.related} />
      </Section>
    ),
    whereUsed: (
      <div className="flex flex-col gap-8">
        <Section title="Reach" subtitle="Single-source-of-truth fan-out over item_id">
          <ReachChips reach={whereUsed} />
        </Section>
        <Section title="Customers using this spec">
          {whereUsed.customers.length > 0 ? (
            <CustomerList customers={whereUsed.customers} />
          ) : (
            <Empty>No customer has used this spec yet.</Empty>
          )}
        </Section>
        <Section title="All references">
          <RelatedList records={whereUsed.related} />
        </Section>
      </div>
    ),
    timeline: (
      <Section title="Timeline" subtitle="Cross-flow chronology across every reference">
        <TimelineList records={whereUsed.related} />
      </Section>
    ),
    history: (
      <div className="flex flex-col gap-8">
        <Section title="Provenance" subtitle="Write-once origin snapshot (display-only)">
          <DetailGrid fields={provenanceFields} columns={2} />
        </Section>
        <Section title="Activity">
          <AuditHistory entries={auditEntries} />
        </Section>
      </div>
    ),
    documents: (
      <Section title="Drawings & Documents">
        <ItemDocuments itemId={item.id} documents={documents} />
      </Section>
    ),
  };

  const header = (
    <WorkspaceHeader
      item={item}
      statusPill={statusPill}
      isAdmin={isAdmin}
      onPeek={() => setDrawerOpen(true)}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      {/* Back to Product Master (replaces the breadcrumb) */}
      <div className="mb-4">
        <Link
          href={"/masters/product_master" as Route}
          className="group inline-flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          <ArrowLeft size={16} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
          Product Master
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        {/* Full-width identity card - centered hero so the product code reads big
            and never cuts off. */}
        <div className="rounded-2xl border border-hairline bg-surface-card p-8 max-md:p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
          {header}
        </div>

        {/* Tab strip */}
        <div className="rounded-2xl border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
            <div role="tablist" aria-label="Item sections" className="flex items-center gap-1 overflow-x-auto border-b border-hairline px-3">
              {TABS.map((t) => {
                const active = t.key === tab;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "-mb-px whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-semibold transition-colors",
                      active
                        ? "border-brand text-brand"
                        : "border-transparent text-ink-subtle hover:text-ink-strong",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div className="p-6 max-md:p-4">{tabBody[tab]}</div>
          </div>
        </div>

      {/* Peek drawer - mirrors the top tabs (condensed). */}
      <ContextDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={`Item ${item.itemCode}`}
        header={
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
              Item Master
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-mono text-[22px] font-bold text-ink-strong break-all">
                {item.itemCode}
              </span>
              <StatusPill tone={statusPill.tone}>{statusPill.label}</StatusPill>
            </div>
          </div>
        }
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="flex flex-col gap-6">
                <DetailGrid fields={overviewFields} columns={1} />
                <ReachChips reach={whereUsed} />
              </div>
            ),
          },
          {
            key: "specifications",
            label: "Specifications",
            content: <DetailGrid fields={specFields} columns={1} />,
          },
          {
            key: "commercial",
            label: "Commercial",
            content: (
              <div className="flex flex-col gap-6">
                <CostHistoryTable rows={whereUsed.costHistory} />
                <QuotePriceTable rows={whereUsed.quotePrices} />
              </div>
            ),
          },
          {
            key: "whereUsed",
            label: "Where-Used",
            content: (
              <div className="flex flex-col gap-5">
                {whereUsed.customers.length > 0 && (
                  <CustomerList customers={whereUsed.customers} />
                )}
                <RelatedList records={whereUsed.related} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/* ── Header ────────────────────────────────────────────────────────────── */

function WorkspaceHeader({
  item,
  statusPill,
  isAdmin,
  onPeek,
}: {
  item: ItemDetail;
  statusPill: { tone: PillTone; label: string };
  isAdmin: boolean;
  onPeek: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-subtle">
        Item Master · Record
      </div>
      {/* Prominent, centered product code so the user always knows which spec
          they're on. Bigger font; wraps (never cuts off) on very long codes. */}
      <h1 className="mt-3 max-w-full break-all font-mono text-[46px] font-bold leading-[1.08] tracking-tight text-[#3f3f94] max-lg:text-[36px] max-md:text-[26px]">
        {item.itemCode}
      </h1>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <StatusPill tone={statusPill.tone}>{statusPill.label}</StatusPill>
        {!item.isActive && <StatusPill tone="slate">Inactive</StatusPill>}
      </div>
      <p className="mt-3 text-[15px] text-ink-muted">
        {item.seq && (
          <>
            <span className="font-semibold text-ink-soft">#{item.seq}</span>
            <span className="mx-2 text-ink-subtle">·</span>
          </>
        )}
        {item.shapeName ?? "-"}
        {item.gradeName && (
          <>
            <span className="mx-2 text-ink-subtle">·</span>
            {item.gradeName}
          </>
        )}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={onPeek}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          <PanelRightOpen size={15} strokeWidth={2.2} />
          Peek
        </button>
        <Link
          href={`/items/${item.id}/edit` as Route}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          <Pencil size={15} strokeWidth={2.2} />
          Edit
        </Link>
        {isAdmin && (
          <ItemStatusControl
            itemId={item.id}
            itemCode={item.itemCode}
            isActive={item.isActive}
          />
        )}
      </div>
    </div>
  );
}

/* ── Small building blocks ─────────────────────────────────────────────── */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 border-b border-hairline pb-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[12px] text-ink-subtle">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-hairline-strong bg-surface-soft px-4 py-3 text-[13px] text-ink-subtle">
      {children}
    </div>
  );
}

function ReachChips({ reach }: { reach: ItemWhereUsed }) {
  const r = reach.reach;
  const chips: ReadonlyArray<readonly [string, number]> = [
    ["Customers", r.customerCount],
    ["Enquiries", r.enquiryCount],
    ["Costings", r.costingCount],
    ["Quotations", r.quotationCount],
    ["Negotiations", r.negotiationCount],
    ["Sales Orders", r.salesOrderCount],
    ["Job Cards", r.jobCardCount],
    ["Production", r.productionCount],
    ["Dispatches", r.dispatchCount],
    ["Invoices", r.invoiceCount],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(([label, n]) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1.5 text-[13px]"
        >
          <span className="font-bold tabular-nums text-ink-strong">{n}</span>
          <span className="text-ink-subtle">{label}</span>
        </span>
      ))}
    </div>
  );
}

function CustomerChips({ customers }: { customers: ItemWhereUsed["customers"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {customers.map((c) => (
        <span
          key={c.clientId ?? c.name}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-soft px-3 py-1.5 text-[13px]"
        >
          <Building2 size={13} strokeWidth={2.2} className="text-ink-subtle" />
          <span className="font-semibold text-ink-strong">{c.name}</span>
          <span className="text-ink-subtle">· {c.enquiryCount}</span>
        </span>
      ))}
    </div>
  );
}

function CustomerList({ customers }: { customers: ItemWhereUsed["customers"] }) {
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {customers.map((c) => {
        const inner = (
          <span className="flex items-center gap-2.5">
            <Building2 size={15} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
            <span className="flex-1 font-semibold text-ink-strong">{c.name}</span>
            <span className="text-[12px] text-ink-subtle">
              {c.enquiryCount} {c.enquiryCount === 1 ? "enquiry" : "enquiries"}
            </span>
          </span>
        );
        return (
          <li key={c.clientId ?? c.name} className="py-2.5 text-[14px]">
            {c.clientId ? (
              <Link href={`/clients/${c.clientId}` as Route} className="block hover:text-brand">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

const KIND_LABELS: Record<RelatedRecord["kind"], string> = {
  enquiry: "Enquiry",
  quotation: "Quotation",
  negotiation: "Negotiation",
  sales_order: "Sales Order",
  job_card: "Job Card",
  invoice: "Invoice",
};

const KIND_TONES: Record<RelatedRecord["kind"], PillTone> = {
  enquiry: "blue",
  quotation: "purple",
  negotiation: "amber",
  sales_order: "green",
  job_card: "orange",
  invoice: "slate",
};

function RelatedRow({ r }: { r: RelatedRecord }) {
  const inner = (
    <span className="flex items-center gap-3">
      <StatusPill tone={KIND_TONES[r.kind]} size="sm" hideDot>
        {KIND_LABELS[r.kind]}
      </StatusPill>
      <span className="font-mono text-[13px] font-bold text-ink-strong">{r.label}</span>
      {r.sub && <span className="truncate text-[13px] text-ink-muted">{r.sub}</span>}
      <span className="ml-auto flex items-center gap-2 text-[12px] text-ink-subtle">
        {r.date ? formatDate(r.date) : ""}
        {r.href && <ArrowUpRight size={14} strokeWidth={2.2} />}
      </span>
    </span>
  );
  return (
    <li className="py-2.5 text-[14px]">
      {r.href ? (
        <Link href={r.href as Route} className="block hover:text-brand">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}

function RelatedList({ records }: { records: RelatedRecord[] }) {
  if (records.length === 0) return <Empty>Nothing references this item yet.</Empty>;
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {records.map((r) => (
        <RelatedRow key={`${r.kind}-${r.id}`} r={r} />
      ))}
    </ul>
  );
}

function TimelineList({ records }: { records: RelatedRecord[] }) {
  if (records.length === 0) return <Empty>No events yet.</Empty>;
  return (
    <ol className="flex flex-col gap-0 border-l border-hairline pl-5">
      {records.map((r) => {
        const inner = (
          <>
            <span className="absolute -left-[23px] top-2 h-2 w-2 rounded-full" style={{ background: `var(--color-${KIND_TONES[r.kind]})` }} />
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-ink-strong">
                {KIND_LABELS[r.kind]}
              </span>
              <span className="font-mono text-[13px] text-ink-muted">{r.label}</span>
              {r.sub && <span className="text-[12px] text-ink-subtle">· {r.sub}</span>}
            </span>
            <span className="text-[12px] text-ink-subtle">{r.date ? formatDate(r.date) : ""}</span>
          </>
        );
        return (
          <li key={`${r.kind}-${r.id}`} className="relative py-2.5">
            {r.href ? (
              <Link href={r.href as Route} className="block hover:text-brand">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}

function CostHistoryTable({ rows }: { rows: CostHistoryRow[] }) {
  if (rows.length === 0) return <Empty>No costings linked to this item yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
            <th className="py-2 pr-4 font-bold">SM</th>
            <th className="py-2 pr-4 font-bold">Type</th>
            <th className="py-2 pr-4 font-bold">Final cost</th>
            <th className="py-2 pr-4 font-bold">Quote value</th>
            <th className="py-2 pr-4 font-bold">Chosen</th>
            <th className="py-2 font-bold">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="py-2 pr-4">
                <Link href={`/inquiries/${c.inquiryId}` as Route} className="font-mono text-brand hover:underline">
                  {c.smNumber ?? "-"}
                </Link>
              </td>
              <td className="py-2 pr-4 text-ink-muted">{c.costingType.replace("_", "-")}</td>
              <td className="py-2 pr-4 font-mono tabular-nums text-ink-strong">{inr(c.finalCostPerPiece) ?? "-"}</td>
              <td className="py-2 pr-4 font-mono tabular-nums text-ink-muted">{inr(c.quoteValue) ?? "-"}</td>
              <td className="py-2 pr-4">
                {c.isChosen ? <StatusPill tone="green" size="sm">Chosen</StatusPill> : <span className="text-ink-subtle">-</span>}
              </td>
              <td className="py-2 text-ink-subtle">{formatDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuotePriceTable({ rows }: { rows: QuotePriceRow[] }) {
  if (rows.length === 0) return <Empty>No quotations reference this item yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
            <th className="py-2 pr-4 font-bold">Quote</th>
            <th className="py-2 pr-4 font-bold">Customer</th>
            <th className="py-2 pr-4 font-bold">Qty</th>
            <th className="py-2 pr-4 font-bold">Unit price</th>
            <th className="py-2 pr-4 font-bold">Sent</th>
            <th className="py-2 font-bold">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((qp) => (
            <tr key={qp.quotationItemId}>
              <td className="py-2 pr-4">
                <Link href={`/quotations/${qp.quotationId}` as Route} className="font-mono text-brand hover:underline">
                  {qp.quoteNo}
                </Link>
              </td>
              <td className="py-2 pr-4 text-ink-muted">{qp.companyName ?? "-"}</td>
              <td className="py-2 pr-4 font-mono tabular-nums text-ink-muted">{qp.qty ?? "-"}</td>
              <td className="py-2 pr-4 font-mono tabular-nums text-ink-strong">{inr(qp.unitPrice) ?? "-"}</td>
              <td className="py-2 pr-4">
                {qp.quoteSent ? <StatusPill tone="green" size="sm">Sent</StatusPill> : <StatusPill tone="slate" size="sm">Draft</StatusPill>}
              </td>
              <td className="py-2 text-ink-subtle">{formatDate(qp.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
