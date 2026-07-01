"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Pencil,
  PanelRightOpen,
  Boxes,
  FileText,
  Building2,
  ClipboardList,
  Layers,
  LayoutDashboard,
} from "lucide-react";
import { COSTING_TYPE_LABELS } from "@/db/enums";
import { formatDate } from "@/lib/format";
import type { ItemDetail } from "@/lib/queries/items";
import type { AuditEntry } from "@/lib/queries/audit";
import type { ItemDocument } from "@/lib/queries/item-documents";
import type { ItemStageCounts } from "@/lib/queries/item-stage";
import { AppShell, type RailGroup } from "@/components/erp/app-shell";
import { Stepper } from "@/components/erp/stepper";
import { StatusPill, ITEM_STATUS_PILL, type PillTone } from "@/components/erp/status-pill";
import { DetailGrid, type DetailField } from "@/components/erp/detail-grid";
import { ContextDrawer } from "@/components/erp/context-drawer";
import { cn } from "@/lib/utils";
import { AuditHistory } from "@/components/audit/audit-history";
import { ItemDocuments } from "@/components/items/item-documents";
import { ItemStatusControl } from "@/components/items/item-status-control";

/**
 * ItemWorkspace (ERP redesign — Phase 3 REFERENCE MIGRATION).
 *
 * Rebuilds the Item detail page as a Workspace on the new primitives:
 *   AppShell (chrome) + WorkspaceHeader (code + StatusPill + key facts) +
 *   Stepper (fed by deriveItemStage) + Tabs (Overview / Specifications /
 *   Commercial / Manufacturing / History / Documents) using DetailGrid.
 *
 * Where-Used / Related are lightweight "coming in Phase 9" placeholders fed by
 * the cheap stage counts. A ContextDrawer instance demonstrates the peek
 * primitive (opens the same Overview/Specs facets in a right sheet).
 */

interface ItemWorkspaceProps {
  item: ItemDetail;
  auditEntries: AuditEntry[];
  documents: ItemDocument[];
  counts: ItemStageCounts;
  /** Furthest pipeline stage index (from deriveItemStage on the server). */
  stageIndex: number;
  isAdmin: boolean;
}

const NAV: ReadonlyArray<RailGroup> = [
  {
    label: "Product",
    items: [
      { href: "/items", label: "Item Master", Icon: Boxes },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/inquiries", label: "Enquiries", Icon: FileText },
      { href: "/clients", label: "Clients", Icon: Building2 },
    ],
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
  | "specifications"
  | "commercial"
  | "manufacturing"
  | "history"
  | "documents";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "specifications", label: "Specifications" },
  { key: "commercial", label: "Commercial" },
  { key: "manufacturing", label: "Manufacturing" },
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

export function ItemWorkspace({
  item,
  auditEntries,
  documents,
  counts,
  stageIndex,
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

  const commercialFields: DetailField[] = [
    { label: "Costing Type", value: item.costingType ? COSTING_TYPE_LABELS[item.costingType] : null },
    { label: "Grade (Customer)", value: item.gradeCustomer, snapshot: true },
    { label: "Grade Name for Customer", value: item.gradeNameForCust, snapshot: true },
    { label: "Quantity (as recorded)", value: item.qty, mono: true, snapshot: true },
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
    { label: "Origin Customer", value: item.customerName, snapshot: true },
    { label: "Origin SM Number", value: item.smNumber, mono: true, snapshot: true },
    { label: "Origin Product Name", value: item.custProductName, snapshot: true },
    { label: "Origin Drawing No", value: item.custDrawingNo, snapshot: true },
    { label: "Drawing Revision", value: item.drawingRevisionNo, snapshot: true },
    { label: "Created", value: formatDate(item.createdAt) },
    { label: "Last Updated", value: formatDate(item.updatedAt) },
  ];

  const breadcrumb = [
    { label: "Product", href: "/items" },
    { label: "Item Master", href: "/items" },
    { label: item.itemCode },
  ];

  const tabBody: Record<TabKey, React.ReactNode> = {
    overview: (
      <div className="flex flex-col gap-8">
        <Section title="At a glance">
          <DetailGrid fields={overviewFields} columns={3} />
        </Section>
        <Section title="Reach" subtitle="First-cut where-used counts — full graph in Phase 9">
          <ReachChips counts={counts} />
        </Section>
      </div>
    ),
    specifications: (
      <Section title="Specification" subtitle="Reusable engineering spec (SSOT)">
        <DetailGrid fields={specFields} columns={2} />
      </Section>
    ),
    commercial: (
      <Section title="Commercial" subtitle="Cost/quote history arrives in Phase 9">
        <DetailGrid fields={commercialFields} columns={2} />
        <Placeholder>
          Live cost history and quote/won prices (from costings + snapshots) land
          with Item Intelligence in Phase 9.
        </Placeholder>
      </Section>
    ),
    manufacturing: (
      <Section title="Manufacturing">
        <DetailGrid fields={manufacturingFields} columns={2} />
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
    <AppShell
      nav={NAV}
      breadcrumb={breadcrumb}
      contextBarExtra={<Stepper current={stageIndex} className="max-w-full" />}
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-hairline bg-surface-card p-6 max-md:p-4" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
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

      {/* Peek drawer — demonstrates the ContextDrawer primitive */}
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
            content: <DetailGrid fields={overviewFields} columns={1} />,
          },
          {
            key: "specifications",
            label: "Specifications",
            content: <DetailGrid fields={specFields} columns={1} />,
          },
          {
            key: "reach",
            label: "Where-Used",
            content: (
              <div className="flex flex-col gap-3">
                <ReachChips counts={counts} />
                <Placeholder>Full where-used graph arrives in Phase 9.</Placeholder>
              </div>
            ),
          },
        ]}
      />
    </AppShell>
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
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
          Item Master · Record
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-[38px] leading-none tracking-tight text-ink-strong break-all">
            {item.itemCode}
          </h1>
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
          {item.shapeName ?? "—"}
          {item.gradeName && (
            <>
              <span className="mx-2 text-ink-subtle">·</span>
              {item.gradeName}
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2.5">
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

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-hairline-strong bg-surface-soft px-4 py-3 text-[13px] text-ink-subtle">
      {children}
    </div>
  );
}

function ReachChips({ counts }: { counts: ItemStageCounts }) {
  const chips: ReadonlyArray<readonly [string, number]> = [
    ["Enquiries", counts.inquiryCount],
    ["Costings", counts.costingCount],
    ["Quotations", counts.quotationCount],
    ["Negotiations", counts.negotiationCount],
    ["Sales Orders", counts.salesOrderCount],
    ["Job Cards", counts.jobCardCount],
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
