"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Pencil,
  Eye,
  Building2,
  Boxes,
  FileText,
  ClipboardList,
  Layers,
  LayoutDashboard,
  Plus,
  ArrowUpRight,
  FileSignature,
  Handshake,
  PackageCheck,
  CalendarClock,
  MapPin,
  Landmark,
  UserRound,
} from "lucide-react";
import { ClientKycQuickView } from "@/components/clients/client-kyc-quick-view";
import { formatDate, formatInr, formatCount } from "@/lib/format";
import {
  ENQUIRY_STATUS_COLORS,
  ENQUIRY_STATUS_LABELS,
  NEGOTIATION_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
  ADDRESS_TYPE_LABELS,
} from "@/db/enums";
import type {
  ClientHeader,
  ClientKpis,
  ClientEnquiryRow,
  ClientPipeline,
  PipelineRow,
  ClientProductRow,
  ClientFinancials,
  ClientTimelineEntry,
  TimelineKind,
} from "@/lib/queries/client-workspace";
import type { ClientDocument } from "@/lib/queries/client-documents";
import { AppShell, type RailGroup } from "@/components/erp/app-shell";
import { StatusPill, type PillTone } from "@/components/erp/status-pill";
import { DetailGrid, type DetailField } from "@/components/erp/detail-grid";
import { ClientDocuments } from "@/components/clients/client-documents";
import { cn } from "@/lib/utils";

/**
 * ClientWorkspace (ERP redesign - Phase 9c, §8 "Client Workspace").
 *
 * The per-client cockpit: a sticky KPI header (7 live SSOT KPIs) over a tabbed
 * body (Overview / Enquiries / Pipeline / Products / Financials / Documents /
 * Timeline). Every number is computed read-through from the FK spine (never a
 * stored counter); every entity (SM / quote / SO / item / contact / doc) links
 * to its own record. Empty states are actionable (deep-link to start the work).
 *
 * Mirrors ItemWorkspace / JobCardWorkspace structure + the shared erp primitives
 * (AppShell, StatusPill, DetailGrid). Client-side tab state (as ItemWorkspace).
 */

interface ClientWorkspaceProps {
  header: ClientHeader;
  kpis: ClientKpis;
  enquiries: ClientEnquiryRow[];
  pipeline: ClientPipeline;
  products: ClientProductRow[];
  financials: ClientFinancials | null;
  timeline: ClientTimelineEntry[];
  documents: ClientDocument[];
  isAdmin: boolean;
  /** When true, render content only (no AppShell) - the page supplies the new
   *  module-shell chrome instead of the legacy ERP rail. */
  embedded?: boolean;
}

const NAV: ReadonlyArray<RailGroup> = [
  {
    label: "Sales",
    items: [
      { href: "/clients", label: "Clients", Icon: Building2 },
      { href: "/inquiries", label: "Enquiries", Icon: FileText },
    ],
  },
  {
    label: "Product",
    items: [{ href: "/items", label: "Item Master", Icon: Boxes }],
  },
  {
    label: "Production",
    items: [{ href: "/job-cards", label: "Job Cards", Icon: ClipboardList }],
  },
  {
    label: "Setup",
    items: [
      { href: "/masters", label: "Masters", Icon: Layers },
      { href: "/", label: "Dashboard", Icon: LayoutDashboard },
    ],
  },
];

type TabKey =
  | "overview"
  | "enquiries"
  | "pipeline"
  | "products"
  | "financials"
  | "documents"
  | "timeline";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "enquiries", label: "Enquiries" },
  { key: "pipeline", label: "Pipeline" },
  { key: "products", label: "Products" },
  { key: "financials", label: "Financials" },
  { key: "documents", label: "Documents" },
  { key: "timeline", label: "Timeline" },
];

function enqTone(status: string): PillTone {
  return (ENQUIRY_STATUS_COLORS as Record<string, PillTone>)[status] ?? "slate";
}
function enqLabel(status: string): string {
  return (ENQUIRY_STATUS_LABELS as Record<string, string>)[status] ?? status;
}
function negTone(status: string): PillTone {
  return (NEGOTIATION_STATUS_COLORS as Record<string, PillTone>)[status] ?? "slate";
}
function negLabel(status: string): string {
  return (NEGOTIATION_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export function ClientWorkspace({
  header,
  kpis,
  enquiries,
  pipeline,
  products,
  financials,
  timeline,
  documents,
  isAdmin,
  embedded,
}: ClientWorkspaceProps) {
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [quickView, setQuickView] = React.useState(false);

  const newEnquiryHref = "/enquiries/new" as Route;

  const tabBody: Record<TabKey, React.ReactNode> = {
    overview: (
      <OverviewTab
        clientId={header.id}
        enquiries={enquiries}
        pipeline={pipeline}
        products={products}
        timeline={timeline}
        newEnquiryHref={newEnquiryHref}
      />
    ),
    enquiries: (
      <EnquiriesTab enquiries={enquiries} newEnquiryHref={newEnquiryHref} />
    ),
    pipeline: <PipelineTab pipeline={pipeline} />,
    products: <ProductsTab products={products} />,
    financials: <FinancialsTab clientId={header.id} financials={financials} />,
    documents: (
      <Section title="Documents" subtitle="Client-filed drawings & documents">
        <ClientDocuments clientId={header.id} documents={documents} />
      </Section>
    ),
    timeline: (
      <Section
        title="Timeline"
        subtitle="Merged activity - audit, meetings & pipeline milestones"
      >
        <TimelineList entries={timeline} />
      </Section>
    ),
  };

  const content = (
      <div className="flex flex-col gap-6">
        {/* Workspace header */}
        <div
          className="rounded-2xl border border-hairline bg-surface-card p-6 max-md:p-4"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
                Client Master · Record
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-[34px] font-bold leading-none tracking-tight text-ink-strong break-words">
                  {header.name}
                </h1>
                <StatusPill tone={header.isActive ? "green" : "slate"}>
                  {header.isActive ? "Active" : "Inactive"}
                </StatusPill>
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-muted">
                {header.clientCode && (
                  <span className="font-mono font-semibold text-ink-soft">
                    {header.clientCode}
                  </span>
                )}
                {[header.city, header.state].filter(Boolean).length > 0 && (
                  <>
                    <span className="text-ink-subtle">·</span>
                    <span>{[header.city, header.state].filter(Boolean).join(", ")}</span>
                  </>
                )}
                {header.customerTypeNames.length > 0 && (
                  <>
                    <span className="text-ink-subtle">·</span>
                    <span>{header.customerTypeNames.join(", ")}</span>
                  </>
                )}
                {header.industryTypeNames.length > 0 && (
                  <>
                    <span className="text-ink-subtle">·</span>
                    <span>{header.industryTypeNames.join(", ")}</span>
                  </>
                )}
              </p>
              {header.primaryContactName && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-subtle">
                  <UserRound size={13} strokeWidth={2.2} />
                  <span className="font-semibold text-ink-soft">
                    {header.primaryContactName}
                  </span>
                  {header.primaryContactDesignation && (
                    <span>· {header.primaryContactDesignation}</span>
                  )}
                  {header.primaryContactNo && <span>· {header.primaryContactNo}</span>}
                  {header.primaryContactEmail && (
                    <span>· {header.primaryContactEmail}</span>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <Link
                href={newEnquiryHref}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={15} strokeWidth={2.4} />
                New Enquiry
              </Link>
              <button
                type="button"
                onClick={() => setQuickView(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
              >
                <Eye size={15} strokeWidth={2.2} />
                Quick view
              </button>
              {isAdmin && (
                <Link
                  href={`/clients/${header.id}/edit` as Route}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
                >
                  <Pencil size={15} strokeWidth={2.2} />
                  Edit
                </Link>
              )}
            </div>
          </div>

          {/* Sticky KPI strip */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <KpiTile
              label="Open Enquiries"
              value={formatCount(kpis.openEnquiries)}
            />
            <KpiTile
              label="Open Quotations"
              value={formatCount(kpis.openQuotations)}
            />
            <KpiTile
              label={`Won Orders · ${kpis.fyLabel}`}
              value={formatCount(kpis.wonOrdersFy)}
            />
            <KpiTile
              label={`Revenue · ${kpis.fyLabel}`}
              value={formatInr(kpis.revenueFy)}
              mono
            />
            <KpiTile
              label="Outstanding"
              value="-"
              hint="provisional"
              muted
            />
            <KpiTile
              label="Win Rate"
              value={
                kpis.winRate == null ? "-" : `${Math.round(kpis.winRate * 100)}%`
              }
              hint={
                kpis.winRate == null
                  ? "no decisions yet"
                  : `${kpis.winRateWon}W · ${kpis.winRateLost}L`
              }
            />
            <KpiTile
              label="Last Activity"
              value={kpis.lastActivity ? formatDate(kpis.lastActivity) : "-"}
            />
          </div>
        </div>

        {/* Tab strip */}
        <div
          className="rounded-2xl border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <div
            role="tablist"
            aria-label="Client sections"
            className="flex items-center gap-1 overflow-x-auto border-b border-hairline px-3"
          >
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

        {quickView && (
          <ClientKycQuickView
            clientId={header.id}
            name={header.name}
            isActive={header.isActive}
            isAdmin={isAdmin}
            onClose={() => setQuickView(false)}
          />
        )}
      </div>
  );

  if (embedded) return content;
  return (
    <AppShell
      nav={NAV}
      collapseKey="erp-client-shell-collapsed"
      breadcrumb={[
        { label: "Sales", href: "/clients" },
        { label: "Clients", href: "/clients" },
        { label: header.name },
      ]}
    >
      {content}
    </AppShell>
  );
}

/* ── KPI tile ──────────────────────────────────────────────────────────── */

function KpiTile({
  label,
  value,
  hint,
  mono,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-surface-soft px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </div>
      <div
        className={cn(
          "text-[19px] font-bold leading-tight",
          muted ? "text-ink-muted" : "text-ink-strong",
          mono && "font-mono tabular-nums text-[17px]",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-subtle">{hint}</div>}
    </div>
  );
}

/* ── Overview tab ──────────────────────────────────────────────────────── */

function OverviewTab({
  clientId,
  enquiries,
  pipeline,
  products,
  timeline,
  newEnquiryHref,
}: {
  clientId: string;
  enquiries: ClientEnquiryRow[];
  pipeline: ClientPipeline;
  products: ClientProductRow[];
  timeline: ClientTimelineEntry[];
  newEnquiryHref: Route;
}) {
  const openEnquiries = enquiries.filter((e) => !e.won && !e.hasSalesOrder);
  const recentOrders = pipeline.salesOrders.slice(0, 5);
  const topProducts = products.slice(0, 5);
  const recentActivity = timeline.slice(0, 5);

  if (enquiries.length === 0 && products.length === 0 && timeline.length === 0) {
    return (
      <EmptyCta
        href={newEnquiryHref}
        title="No activity yet for this client"
        body="Kick off the sales pipeline - the first enquiry mints an SM number and this cockpit fills in live."
        cta="Start first enquiry"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Left column */}
      <div className="flex flex-col gap-8">
        <Section title="Open work" subtitle="Enquiries still in play">
          {openEnquiries.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline">
              {openEnquiries.slice(0, 6).map((e) => (
                <EnquiryRow key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <Empty>No open enquiries - everything is won or closed.</Empty>
          )}
        </Section>

        <Section title="Recent orders" subtitle="Latest sales orders">
          {recentOrders.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline">
              {recentOrders.map((s) => (
                <PipelineListRow
                  key={s.id}
                  row={s}
                  href={`/sales-orders/${s.id}`}
                  Icon={PackageCheck}
                  tone="green"
                  kind="Sales Order"
                />
              ))}
            </ul>
          ) : (
            <Empty>No sales orders yet.</Empty>
          )}
        </Section>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-8">
        <Section
          title="Top products"
          subtitle="Ranked by order value for this client"
        >
          {topProducts.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline">
              {topProducts.map((p) => (
                <ProductRow key={p.itemId} p={p} />
              ))}
            </ul>
          ) : (
            <Empty>No products linked yet.</Empty>
          )}
        </Section>

        <Section title="Recent activity" subtitle="Latest 5 events">
          {recentActivity.length > 0 ? (
            <TimelineList entries={recentActivity} />
          ) : (
            <Empty>No activity recorded yet.</Empty>
          )}
        </Section>
      </div>
      {/* clientId reserved for future deep-links */}
      <span className="hidden" aria-hidden data-client={clientId} />
    </div>
  );
}

/* ── Enquiries tab ─────────────────────────────────────────────────────── */

function EnquiriesTab({
  enquiries,
  newEnquiryHref,
}: {
  enquiries: ClientEnquiryRow[];
  newEnquiryHref: Route;
}) {
  if (enquiries.length === 0) {
    return (
      <EmptyCta
        href={newEnquiryHref}
        title="No enquiries yet"
        body="Every sale starts with an enquiry. Create the first SM number for this client."
        cta="Start first enquiry"
      />
    );
  }
  return (
    <Section title="Enquiries" subtitle={`${enquiries.length} SM${enquiries.length === 1 ? "" : "s"}`}>
      <ul className="flex flex-col divide-y divide-hairline">
        {enquiries.map((e) => (
          <EnquiryRow key={e.id} e={e} showMeta />
        ))}
      </ul>
    </Section>
  );
}

function EnquiryRow({ e, showMeta }: { e: ClientEnquiryRow; showMeta?: boolean }) {
  return (
    <li className="py-3 text-[14px]">
      <Link
        href={`/inquiries/${e.id}` as Route}
        className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 hover:text-brand"
      >
        <span className="font-mono text-[13px] font-bold text-ink-strong group-hover:text-brand">
          {e.smNumber}
        </span>
        <StatusPill tone={enqTone(e.enquiryStatus)} size="sm">
          {enqLabel(e.enquiryStatus)}
        </StatusPill>
        {e.won ? (
          <StatusPill tone="green" size="sm" hideDot>
            Won
          </StatusPill>
        ) : e.hasSalesOrder ? (
          <StatusPill tone="green" size="sm" hideDot>
            Order
          </StatusPill>
        ) : e.hasQuote ? (
          <StatusPill tone="purple" size="sm" hideDot>
            Quoted
          </StatusPill>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-ink-muted">
          {e.productDescription}
        </span>
        {showMeta && e.itemCount > 0 && (
          <span className="text-[12px] text-ink-subtle tabular-nums">
            {e.itemCount} {e.itemCount === 1 ? "item" : "items"}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[12px] text-ink-subtle">
          {e.enquiryDate ? formatDate(e.enquiryDate) : ""}
          <ArrowUpRight
            size={14}
            strokeWidth={2.2}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
      </Link>
    </li>
  );
}

/* ── Pipeline tab ──────────────────────────────────────────────────────── */

function PipelineTab({ pipeline }: { pipeline: ClientPipeline }) {
  const empty =
    pipeline.quotations.length === 0 &&
    pipeline.negotiations.length === 0 &&
    pipeline.salesOrders.length === 0;
  if (empty) {
    return <Empty>No quotations, negotiations or sales orders yet.</Empty>;
  }
  return (
    <div className="flex flex-col gap-8">
      <Section title="Quotations" subtitle="Quotes raised for this client">
        {pipeline.quotations.length > 0 ? (
          <ul className="flex flex-col divide-y divide-hairline">
            {pipeline.quotations.map((q) => (
              <PipelineListRow
                key={q.id}
                row={q}
                href={`/quotations/${q.id}`}
                Icon={FileSignature}
                tone="purple"
                kind="Quotation"
                trailing={
                  q.sent ? (
                    <StatusPill tone="green" size="sm">
                      Sent
                    </StatusPill>
                  ) : (
                    <StatusPill tone="slate" size="sm">
                      Draft
                    </StatusPill>
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <Empty>No quotations yet.</Empty>
        )}
      </Section>

      <Section title="Negotiations" subtitle="Live and closed negotiation rounds">
        {pipeline.negotiations.length > 0 ? (
          <ul className="flex flex-col divide-y divide-hairline">
            {pipeline.negotiations.map((n) => (
              <PipelineListRow
                key={n.id}
                row={n}
                href={`/negotiations/${n.id}`}
                Icon={Handshake}
                tone="amber"
                kind="Negotiation"
                trailing={
                  n.status ? (
                    <StatusPill tone={negTone(n.status)} size="sm">
                      {negLabel(n.status)}
                    </StatusPill>
                  ) : null
                }
              />
            ))}
          </ul>
        ) : (
          <Empty>No negotiations yet.</Empty>
        )}
      </Section>

      <Section title="Sales orders" subtitle="Confirmed orders">
        {pipeline.salesOrders.length > 0 ? (
          <ul className="flex flex-col divide-y divide-hairline">
            {pipeline.salesOrders.map((s) => (
              <PipelineListRow
                key={s.id}
                row={s}
                href={`/sales-orders/${s.id}`}
                Icon={PackageCheck}
                tone="green"
                kind="Sales Order"
              />
            ))}
          </ul>
        ) : (
          <Empty>No sales orders yet.</Empty>
        )}
      </Section>
    </div>
  );
}

function PipelineListRow({
  row,
  href,
  Icon,
  tone,
  kind,
  trailing,
}: {
  row: PipelineRow;
  href: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  tone: PillTone;
  kind: string;
  trailing?: React.ReactNode;
}) {
  return (
    <li className="py-2.5 text-[14px]">
      <Link href={href as Route} className="group flex items-center gap-3 hover:text-brand">
        <StatusPill tone={tone} size="sm" hideDot>
          {kind}
        </StatusPill>
        <Icon size={15} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
        <span className="font-mono text-[13px] font-bold text-ink-strong group-hover:text-brand">
          {row.no}
        </span>
        {row.smNumber && (
          <span className="text-[12px] text-ink-subtle">· {row.smNumber}</span>
        )}
        <span className="ml-auto flex items-center gap-2.5 text-[12px] text-ink-subtle">
          {trailing}
          {row.date ? formatDate(row.date) : ""}
          <ArrowUpRight
            size={14}
            strokeWidth={2.2}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
      </Link>
    </li>
  );
}

/* ── Products tab ──────────────────────────────────────────────────────── */

function ProductsTab({ products }: { products: ClientProductRow[] }) {
  if (products.length === 0) {
    return (
      <Empty>
        No products linked to this client yet - products appear once an enquiry
        carries an item.
      </Empty>
    );
  }
  return (
    <Section
      title="Products"
      subtitle="Client-scoped where-used - ranked by order value"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
              <th className="py-2 pr-4 font-bold">Item</th>
              <th className="py-2 pr-4 font-bold">Shape</th>
              <th className="py-2 pr-4 font-bold">Grade</th>
              <th className="py-2 pr-4 font-bold text-right">Enquiries</th>
              <th className="py-2 pr-4 font-bold text-right">Ordered Qty</th>
              <th className="py-2 font-bold text-right">Order Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {products.map((p) => (
              <tr key={p.itemId}>
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/items/${p.itemId}` as Route}
                    className="font-mono font-bold text-brand hover:underline"
                  >
                    {p.itemCode}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-ink-muted">{p.shapeName ?? "-"}</td>
                <td className="py-2.5 pr-4 text-ink-muted">{p.gradeName ?? "-"}</td>
                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-ink-muted">
                  {p.enquiryCount}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-ink-muted">
                  {p.orderedQty > 0 ? formatCount(p.orderedQty) : "-"}
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-ink-strong">
                  {p.revenue > 0 ? formatInr(p.revenue) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ── Financials tab ────────────────────────────────────────────────────── */

function FinancialsTab({
  clientId,
  financials,
}: {
  clientId: string;
  financials: ClientFinancials | null;
}) {
  if (!financials) {
    return <Empty>No commercial record on file.</Empty>;
  }
  const commercialFields: DetailField[] = [
    { label: "Customer Type", value: financials.customerTypeNames.join(", ") || null },
    { label: "Industry Type", value: financials.industryTypeNames.join(", ") || null },
    { label: "GSTIN", value: financials.gstin, mono: true },
    { label: "PAN", value: financials.panNo, mono: true },
    { label: "Payment Terms", value: financials.paymentTerms },
    {
      label: "Credit Days",
      value: financials.creditDays != null ? String(financials.creditDays) : null,
    },
    {
      label: "Credit Limit",
      value: financials.creditLimit != null ? formatInr(financials.creditLimit) : null,
      mono: true,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <Section title="Commercial profile" subtitle="Type, tax & credit terms">
        <DetailGrid fields={commercialFields} columns={3} />
      </Section>

      <Section title="Contacts" subtitle="From the normalized contacts table">
        {financials.contacts.length > 0 ? (
          <ul className="flex flex-col divide-y divide-hairline">
            {financials.contacts.map((c) => {
              const name =
                [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
                "Not Available";
              return (
                <li key={c.id} className="flex flex-col gap-0.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <UserRound size={14} strokeWidth={2.2} className="text-ink-subtle" />
                    <span className="text-[14px] font-semibold text-ink-strong">
                      {name}
                    </span>
                    {c.isPrimary && (
                      <StatusPill tone="brand" size="sm" hideDot>
                        Primary
                      </StatusPill>
                    )}
                    {c.designation && (
                      <span className="text-[12px] text-ink-muted">{c.designation}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 pl-6 text-[13px] text-ink-soft">
                    {c.contactNo && <span>{c.contactNo}</span>}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No contacts on file.</Empty>
        )}
      </Section>

      <Section title="Addresses" subtitle="Normalized address book">
        {financials.addresses.length > 0 ? (
          <div className="flex flex-col gap-4">
            {financials.addresses.map((a) => {
              const lines = [a.line1, a.line2, a.line3, a.line4].filter(Boolean);
              const locality = [a.city, a.state, a.country].filter(Boolean).join(", ");
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-1.5 border-b border-hairline pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <MapPin size={14} strokeWidth={2.2} className="text-ink-subtle" />
                    <span className="text-[14px] font-semibold text-ink-strong">
                      {ADDRESS_TYPE_LABELS[a.addressType]}
                    </span>
                    {a.label && <span className="text-[13px] text-ink-muted">{a.label}</span>}
                    {a.isPrimary && (
                      <StatusPill tone="brand" size="sm" hideDot>
                        Primary
                      </StatusPill>
                    )}
                  </div>
                  <address className="not-italic pl-6 text-[13px] leading-relaxed text-ink-strong">
                    {lines.map((l, i) => (
                      <span key={i} className="block break-words">
                        {l}
                      </span>
                    ))}
                    {locality && <span className="block">{locality}</span>}
                    {a.pinCode && <span className="block">PIN {a.pinCode}</span>}
                    {a.gstin && (
                      <span className="block font-mono text-ink-muted">GSTIN {a.gstin}</span>
                    )}
                  </address>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>No addresses on file.</Empty>
        )}
      </Section>

      <Section title="Bank accounts" subtitle="Normalized banking records">
        {financials.bankAccounts.length > 0 ? (
          <div className="flex flex-col gap-4">
            {financials.bankAccounts.map((b) => (
              <div
                key={b.id}
                className="flex flex-col gap-2 border-b border-hairline pb-4 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Landmark size={14} strokeWidth={2.2} className="text-ink-subtle" />
                  <span className="text-[14px] font-semibold text-ink-strong">
                    {b.bankName ?? "Bank account"}
                  </span>
                  {b.isPrimary && (
                    <StatusPill tone="brand" size="sm" hideDot>
                      Primary
                    </StatusPill>
                  )}
                </div>
                <DetailGrid
                  columns={3}
                  fields={[
                    { label: "Account No", value: b.accountNo, mono: true },
                    { label: "IFSC", value: b.ifsc, mono: true },
                    { label: "Branch", value: b.branch },
                    { label: "Account Holder", value: b.accountHolder },
                    { label: "Account Type", value: b.accountType },
                  ]}
                />
              </div>
            ))}
          </div>
        ) : (
          <Empty>No bank accounts on file.</Empty>
        )}
      </Section>
      <span className="hidden" aria-hidden data-client={clientId} />
    </div>
  );
}

/* ── Timeline ──────────────────────────────────────────────────────────── */

const TIMELINE_TONE: Record<TimelineKind, PillTone> = {
  audit: "slate",
  meeting: "blue",
  enquiry: "blue",
  quotation: "purple",
  negotiation: "amber",
  sales_order: "green",
};

function TimelineList({ entries }: { entries: ClientTimelineEntry[] }) {
  if (entries.length === 0) return <Empty>No events yet.</Empty>;
  return (
    <ol className="flex flex-col gap-0 border-l border-hairline pl-5">
      {entries.map((e) => {
        const inner = (
          <>
            <span
              className="absolute -left-[23px] top-2.5 h-2 w-2 rounded-full"
              style={{ background: `var(--color-${TIMELINE_TONE[e.kind]})` }}
            />
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-ink-strong">{e.label}</span>
              {e.sub && (
                <span className="text-[12px] capitalize text-ink-subtle">· {e.sub}</span>
              )}
            </span>
            <span className="text-[12px] text-ink-subtle">{formatDate(e.date)}</span>
          </>
        );
        return (
          <li key={`${e.kind}-${e.id}`} className="relative py-2.5">
            {e.href ? (
              <Link href={e.href as Route} className="block hover:text-brand">
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

/* ── Products / small building blocks ──────────────────────────────────── */

function ProductRow({ p }: { p: ClientProductRow }) {
  return (
    <li className="py-2.5 text-[14px]">
      <Link
        href={`/items/${p.itemId}` as Route}
        className="group flex items-center gap-3 hover:text-brand"
      >
        <Boxes size={15} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
        <span className="font-mono text-[13px] font-bold text-ink-strong group-hover:text-brand">
          {p.itemCode}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
          {[p.shapeName, p.gradeName].filter(Boolean).join(" · ") || "-"}
        </span>
        <span className="text-[13px] font-semibold tabular-nums text-ink-strong">
          {p.revenue > 0 ? formatInr(p.revenue) : `${p.enquiryCount} enq`}
        </span>
      </Link>
    </li>
  );
}

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

function EmptyCta({
  href,
  title,
  body,
  cta,
}: {
  href: Route;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-strong bg-surface-soft px-6 py-12 text-center">
      <CalendarClock size={28} strokeWidth={1.8} className="text-ink-subtle" />
      <div className="text-[15px] font-semibold text-ink-strong">{title}</div>
      <p className="max-w-md text-[13px] text-ink-muted">{body}</p>
      <Link
        href={href}
        className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Plus size={15} strokeWidth={2.4} />
        {cta}
      </Link>
    </div>
  );
}
