"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import type { Route } from "next";
import {
  ArrowUpRight,
  Boxes,
  Building2,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Layers,
  Lock,
  PanelRightOpen,
  Pencil,
  Ruler,
  TriangleAlert,
} from "lucide-react";
import {
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_COLORS,
  INQUIRY_PRIORITY_LABELS,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUS_COLORS,
} from "@/db/enums";
import type { Inquiry, InquiryItemFeasibility } from "@/db/schema";
import type { EmployeeOption } from "@/lib/queries/employees";
import type { AuditEntry } from "@/lib/queries/audit";
import type {
  InquiryWorkspaceHeader,
  InquiryProductCard,
  ProductDrawerData,
  InquiryStageTabs,
  StageLine,
  StageTab,
} from "@/lib/queries/sm-workspace";
import { PIPELINE_STAGE_LABELS } from "@/lib/flow/derive-stage";
import { formatDate, formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import {
  setEnquiryStatus,
  generateItemForInquiryItem,
} from "@/app/(app)/inquiries/actions";
import { AppShell, type RailGroup } from "@/components/erp/app-shell";
import { StatusPill, type PillTone } from "@/components/erp/status-pill";
import { DetailGrid, type DetailField } from "@/components/erp/detail-grid";
import { ContextDrawer } from "@/components/erp/context-drawer";
import { AuditHistory } from "@/components/audit/audit-history";
import { StatusPicker } from "@/components/inquiries/status-picker";
import { FeasibilityPanel } from "@/components/inquiries/feasibility-panel";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import { cn } from "@/lib/utils";

/**
 * SmWorkspace (ERP redesign - Phase 9d, §9 "Enquiry SM Workspace").
 *
 * The pipeline cockpit for one SM number: a sticky "where am I" header (SM +
 * derived next-action pill, priority, client link, sales person, dates, the full
 * PipelineStepper with server-derived node state) + a tab rail (Overview /
 * Products / Feasibility / Costing / Quotation / Negotiation / Sales Order /
 * Documents / Activity). Tabs + product drawer are nuqs URL state (`?tab=`,
 * `?item=<inquiryItemId>`), so links are shareable and refresh-safe.
 *
 * Everything reads THROUGH FKs (client via clientId, sales via
 * assignedSalesPersonId, spec via item_id); the stage is DERIVED server-side by
 * derive-stage.ts and handed here as an index - this component never computes a
 * stage. Stage tabs whose prerequisite is unmet render muted/locked with a
 * blocked-reason panel (never an error).
 */

interface SmWorkspaceProps {
  header: InquiryWorkspaceHeader;
  products: InquiryProductCard[];
  drawers: Record<string, ProductDrawerData>;
  stages: InquiryStageTabs;
  inquiry: Inquiry;
  employees: EmployeeOption[];
  auditEntries: AuditEntry[];
  itemFeasibility: Record<string, InquiryItemFeasibility>;
  isAdmin: boolean;
  /**
   * When true, render the cockpit WITHOUT the ERP AppShell chrome (rail +
   * header). Used by the in-module route `/enquiries/register/[id]`, which
   * already sits inside the Enquiries module shell. Default (false) keeps the
   * standalone AppShell output unchanged.
   */
  embedded?: boolean;
}

const NAV: ReadonlyArray<RailGroup> = [
  {
    label: "Sales",
    items: [
      { href: "/inquiries", label: "Enquiries", Icon: FileText },
      { href: "/clients", label: "Clients", Icon: Building2 },
    ],
  },
  {
    label: "Product",
    items: [{ href: "/masters/product_master", label: "Item Master", Icon: Boxes }],
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
  | "products"
  | "feasibility"
  | "costing"
  | "quotation"
  | "negotiation"
  | "sales-order"
  | "documents"
  | "activity";

const TAB_ORDER: readonly TabKey[] = [
  "overview",
  "products",
  "feasibility",
  "costing",
  "quotation",
  "negotiation",
  "sales-order",
  "documents",
  "activity",
];

const TAB_LABELS: Record<TabKey, string> = {
  overview: "Overview",
  products: "Products",
  feasibility: "Feasibility",
  costing: "Costing",
  quotation: "Quotation",
  negotiation: "Negotiation",
  "sales-order": "Sales Order",
  documents: "Documents",
  activity: "Activity",
};

/* ── helpers ───────────────────────────────────────────────────────────────── */

function inr(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? formatInr(n) : null;
}

function composeDims(p: {
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
}): string | null {
  const parts: string[] = [];
  if (p.outerDia) parts.push(`OD ${p.outerDia}`);
  if (p.innerDia) parts.push(`ID ${p.innerDia}`);
  if (p.length) parts.push(`L ${p.length}`);
  if (p.width) parts.push(`W ${p.width}`);
  if (p.thickness) parts.push(`T ${p.thickness}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* ── component ─────────────────────────────────────────────────────────────── */

export function SmWorkspace({
  header,
  products,
  drawers,
  stages,
  inquiry,
  employees,
  auditEntries,
  itemFeasibility,
  isAdmin,
  embedded,
}: SmWorkspaceProps) {
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: "overview",
    parse: (v): TabKey =>
      (TAB_ORDER as readonly string[]).includes(v) ? (v as TabKey) : "overview",
  });
  const [itemParam, setItemParam] = useQueryState("item", {
    defaultValue: "",
  });

  const openProduct = products.find((p) => p.id === itemParam) ?? null;
  const openDrawer = openProduct ? drawers[openProduct.id] ?? null : null;

  function openItem(inquiryItemId: string) {
    void setItemParam(inquiryItemId);
  }
  function closeDrawer(open: boolean) {
    if (!open) void setItemParam(null);
  }

  // Derived readiness signals (from products / stage records) for locks + panels.
  const costedCount = products.filter((p) => p.costingFinalCost != null).length;
  const readyCount = products.filter((p) => p.costingDoneStatus === "done").length;
  const noItemCount = products.filter((p) => p.noItem).length;

  const quotationLocked = !stages.quotation.record && costedCount === 0;
  const negotiationLocked = !stages.negotiation.record && !stages.quotation.record;
  const salesOrderLocked = !stages.salesOrder.record && !stages.negotiation.record;

  const tabLocked: Partial<Record<TabKey, boolean>> = {
    quotation: quotationLocked,
    negotiation: negotiationLocked,
    "sales-order": salesOrderLocked,
  };

  const tabBadge: Partial<Record<TabKey, number>> = {
    products: products.length,
    quotation: stages.quotation.recordCount,
    negotiation: stages.negotiation.recordCount,
    "sales-order": stages.salesOrder.recordCount,
  };

  const breadcrumb = [
    { label: "Sales", href: "/inquiries" },
    { label: "Enquiries", href: "/inquiries" },
    { label: header.smNumber },
  ];

  const content = (
    <>
      <div className="flex flex-col gap-6">
        {/* ── Sticky "where am I" header ─────────────────────────────── */}
        <div
          className="rounded-section border border-hairline bg-surface-card p-6 max-md:p-4"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                Sales · SM Repo
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="font-mono text-[34px] leading-none tracking-tight text-ink-strong break-all">
                  {header.smNumber}
                </h1>
                <Chip
                  label={INQUIRY_PRIORITY_LABELS[header.priority]}
                  tone={PRIORITY_TONES[header.priority]}
                />
                {header.isArchived && <StatusPill tone="slate">Archived</StatusPill>}
              </div>
              <p className="mt-2 text-[14px] text-ink-muted">
                <span className="font-semibold text-ink-soft">{header.title}</span>
                <span className="mx-2 text-ink-subtle">·</span>
                {header.productCount} {header.productCount === 1 ? "product" : "products"}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              {header.smFolderLink && (
                <a
                  href={header.smFolderLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
                >
                  <ExternalLink size={15} strokeWidth={2.2} />
                  SM Folder
                </a>
              )}
              <Link
                href={`/inquiries/${header.id}/edit` as Route}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
              >
                <Pencil size={15} strokeWidth={2.2} />
                Edit
              </Link>
            </div>
          </div>

          {/* Client / sales / created - labeled, low-text meta. */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <HeaderMeta label="Client">
              {header.clientId ? (
                <Link
                  href={`/clients/${header.clientId}` as Route}
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  {header.clientName}
                  <ArrowUpRight size={13} strokeWidth={2.4} />
                </Link>
              ) : (
                header.clientName
              )}
            </HeaderMeta>
            <HeaderMeta label="Sales person">
              {header.salesPersonName ?? "Not allocated"}
            </HeaderMeta>
            <HeaderMeta label="Created">{formatDate(header.createdAt)}</HeaderMeta>
          </div>

          {/* Next-action strip. */}
          {header.nextAction && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3">
              <StatusPill tone="brand" size="sm" hideDot>
                Next
              </StatusPill>
              <span className="text-[14px] font-semibold text-ink-strong">
                {header.nextAction.label}
              </span>
              {header.nextAction.hint && (
                <span className="text-[13px] text-ink-muted">{header.nextAction.hint}</span>
              )}
              {header.nextAction.tab && (
                <button
                  type="button"
                  onClick={() => header.nextAction?.tab && setTab(header.nextAction.tab as TabKey)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg, #3F3F94 0%, #6d6dcf 100%)",
                    boxShadow: "0 3px 8px -2px rgba(63,63,148,0.55)",
                  }}
                >
                  Go
                  <ArrowUpRight size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Tab rail ───────────────────────────────────────────────── */}
        <div
          className="rounded-2xl border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <div
            role="tablist"
            aria-label="SM sections"
            className="flex items-center gap-1 overflow-x-auto border-b border-hairline px-3"
          >
            {TAB_ORDER.map((k) => {
              const active = k === tab;
              const locked = tabLocked[k] ?? false;
              const badge = tabBadge[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(k)}
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] font-semibold transition-colors",
                    active
                      ? "border-brand text-brand"
                      : "border-transparent text-ink-subtle hover:text-ink-strong",
                  )}
                >
                  {locked && <Lock size={12} strokeWidth={2.4} className="text-ink-subtle" />}
                  {TAB_LABELS[k]}
                  {badge != null && badge > 0 && (
                    <span className="rounded-full bg-surface-track px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-ink-muted">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-6 max-md:p-4">
            {tab === "overview" && (
              <OverviewTab
                header={header}
                inquiry={inquiry}
                products={products}
                itemFeasibility={itemFeasibility}
                auditEntries={auditEntries}
                costedCount={costedCount}
                readyCount={readyCount}
                noItemCount={noItemCount}
                onOpenItem={openItem}
                onGoTab={(t) => setTab(t)}
              />
            )}
            {tab === "products" && (
              <ProductsTab
                inquiryId={header.id}
                products={products}
                onOpenItem={openItem}
              />
            )}
            {tab === "feasibility" && (
              <Section title="Primary Feasibility" subtitle="Per-product feasibility - verify each product before costing">
                <FeasibilityPanel
                  inquiry={inquiry}
                  products={products}
                  itemFeasibility={itemFeasibility}
                  employees={employees}
                />
              </Section>
            )}
            {tab === "costing" && (
              <CostingTab inquiryId={header.id} products={products} onOpenItem={openItem} />
            )}
            {tab === "quotation" && (
              <QuotationTab
                inquiryId={header.id}
                tabData={stages.quotation}
                locked={quotationLocked}
                costedCount={costedCount}
                productCount={products.length}
              />
            )}
            {tab === "negotiation" && (
              <NegotiationTab
                inquiryId={header.id}
                tabData={stages.negotiation}
                locked={negotiationLocked}
                hasQuotation={Boolean(stages.quotation.record)}
              />
            )}
            {tab === "sales-order" && (
              <SalesOrderTab
                inquiryId={header.id}
                tabData={stages.salesOrder}
                locked={salesOrderLocked}
                hasNegotiation={Boolean(stages.negotiation.record)}
              />
            )}
            {tab === "documents" && <DocumentsTab products={products} drawers={drawers} />}
            {tab === "activity" && (
              <Section title="Activity" subtitle="Change history for this enquiry">
                <AuditHistory entries={auditEntries} />
              </Section>
            )}
          </div>
        </div>
      </div>

      {/* ── Product drawer (Open Item ⧉ / History) ─────────────────── */}
      {openProduct && (
        <ProductDrawer
          product={openProduct}
          data={openDrawer}
          onOpenChange={closeDrawer}
        />
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <nav
          aria-label="Breadcrumb"
          className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle"
        >
          <Link
            href={"/enquiries/register" as Route}
            className="transition-colors hover:text-brand"
          >
            Enquiry Register
          </Link>
          <ChevronRight size={14} strokeWidth={2.4} className="opacity-50" />
          <span className="text-ink-strong">{header.smNumber}</span>
        </nav>
        {content}
      </div>
    );
  }

  return (
    <AppShell
      nav={NAV}
      breadcrumb={breadcrumb}
      collapseKey="erp-sm-shell-collapsed"
      contextBarExtra={
        <div className="flex items-center gap-3">
          <StatusPill tone="brand" size="sm" hideDot>
            {header.stageLabel}
          </StatusPill>
          {header.nextAction && (
            <button
              type="button"
              onClick={() => header.nextAction?.tab && setTab(header.nextAction.tab as TabKey)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:underline"
            >
              Next: {header.nextAction.label}
              <ArrowUpRight size={13} strokeWidth={2.4} />
            </button>
          )}
        </div>
      }
    >
      {content}
    </AppShell>
  );
}

/* ── Overview ──────────────────────────────────────────────────────────────── */

function OverviewTab({
  header,
  inquiry,
  products,
  itemFeasibility,
  auditEntries,
  costedCount,
  readyCount,
  noItemCount,
  onOpenItem,
  onGoTab,
}: {
  header: InquiryWorkspaceHeader;
  inquiry: Inquiry;
  products: InquiryProductCard[];
  itemFeasibility: Record<string, InquiryItemFeasibility>;
  auditEntries: AuditEntry[];
  costedCount: number;
  readyCount: number;
  noItemCount: number;
  onOpenItem: (id: string) => void;
  onGoTab: (t: TabKey) => void;
}) {
  // A product is feasibility-cleared only when its row exists AND all five
  // verdicts read "feasible"; anything else (missing row, need_info,
  // not_feasible, or an unset verdict) counts as needing review.
  const notFeasibleCount = products.filter((p) => {
    const f = itemFeasibility[p.id];
    if (!f) return true;
    return (
      f.shapeDimVerdict !== "feasible" ||
      f.gradeVerdict !== "feasible" ||
      f.toleranceVerdict !== "feasible" ||
      f.conditionVerdict !== "feasible" ||
      f.quantityVerdict !== "feasible"
    );
  }).length;

  const blockers: string[] = [];
  if (noItemCount > 0)
    blockers.push(
      `${noItemCount} product${noItemCount === 1 ? "" : "s"} not linked to a finished Item spec`,
    );
  if (products.length > 0 && notFeasibleCount > 0)
    blockers.push(
      `${notFeasibleCount} product${notFeasibleCount === 1 ? "" : "s"} need feasibility review`,
    );
  if (products.length > 0 && costedCount < products.length)
    blockers.push(`${products.length - costedCount} product${products.length - costedCount === 1 ? "" : "s"} not costed`);

  return (
    <div className="flex flex-col gap-8">
      {/* Next action + blockers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className="rounded-section border border-brand/30 bg-brand/[0.06] p-5"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Next action
          </div>
          {header.nextAction ? (
            <>
              <div className="mt-2 text-[15px] font-bold text-ink-strong">
                {header.nextAction.label}
              </div>
              {header.nextAction.hint && (
                <p className="mt-1 text-[13px] text-ink-muted">{header.nextAction.hint}</p>
              )}
              {header.nextAction.tab && (
                <button
                  type="button"
                  onClick={() => header.nextAction?.tab && onGoTab(header.nextAction.tab as TabKey)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg, #3F3F94 0%, #6d6dcf 100%)",
                    boxShadow: "0 3px 8px -2px rgba(63,63,148,0.55)",
                  }}
                >
                  Go to {PIPELINE_STAGE_LABELS[header.nextAction.stage]}
                  <ArrowUpRight size={14} strokeWidth={2.4} />
                </button>
              )}
            </>
          ) : (
            <div className="mt-2 text-[14px] font-semibold text-ink-strong">
              In production - sales pipeline complete.
            </div>
          )}
        </div>
        <div
          className="rounded-section border border-hairline bg-surface-card p-5"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Blockers
          </div>
          {blockers.length > 0 ? (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {blockers.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[13px] text-ink-strong">
                  <TriangleAlert
                    size={14}
                    strokeWidth={2.2}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--color-red)" }}
                  />
                  {b}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2.5 text-[13px] text-ink-muted">No blockers - clear to proceed.</p>
          )}
        </div>
      </div>

      {/* Pipeline health */}
      <div
        className="rounded-section border border-hairline bg-surface-card p-5"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
      >
        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          Pipeline health
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HealthStat n={products.length} label="Products" />
          <HealthStat n={costedCount} label="Costed" />
          <HealthStat n={readyCount} label="Ready to quote" />
          <HealthStat n={noItemCount} label="Unlinked" warn={noItemCount > 0} />
        </div>
      </div>

      {/* Products mini-list + client card */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Products" subtitle="Open the card grid for full detail">
          {products.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline">
              {products.map((p, i) => (
                <li key={p.id} className="py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenItem(p.id)}
                    className="flex w-full items-center gap-3 text-left hover:text-brand"
                  >
                    <span className="text-[12px] font-bold text-ink-subtle tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-[14px] font-semibold text-ink-strong">
                      {p.custProductName ?? p.shapeName ?? "Unnamed product"}
                    </span>
                    {p.noItem ? (
                      <StatusPill tone="amber" size="sm">
                        No item
                      </StatusPill>
                    ) : (
                      <span className="font-mono text-[12px] text-ink-muted">{p.itemCode}</span>
                    )}
                    <PanelRightOpen size={14} strokeWidth={2.2} className="text-ink-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No products on this enquiry yet.</Empty>
          )}
        </Section>

        <Section title="Client">
          <DetailGrid
            columns={1}
            fields={[
              { label: "Company", value: header.clientName },
              {
                label: "Contact",
                value:
                  [inquiry.contactFirstName, inquiry.contactLastName].filter(Boolean).join(" ") ||
                  null,
              },
              { label: "Email", value: inquiry.contactEmail },
              { label: "Phone", value: inquiry.contactNo },
              { label: "Export", value: inquiry.export == null ? null : inquiry.export ? "Yes" : "No" },
              { label: "Country", value: inquiry.country },
            ]}
          />
        </Section>
      </div>

      {/* Recent activity */}
      <Section title="Recent activity">
        <AuditHistory entries={auditEntries.slice(0, 5)} />
      </Section>
    </div>
  );
}

function HeaderMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </div>
      <div className="mt-1 truncate text-[19px] font-extrabold text-ink-strong">{children}</div>
    </div>
  );
}

function HealthStat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-4 py-3 text-center">
      <div
        className="font-mono text-[24px] font-bold tabular-nums"
        style={{ color: warn ? "var(--color-red-deep)" : "var(--color-ink-strong)" }}
      >
        {n}
      </div>
      <div className="text-[11px] text-ink-subtle">{label}</div>
    </div>
  );
}

/* ── Products (the heart) ──────────────────────────────────────────────────── */

function ProductsTab({
  inquiryId,
  products,
  onOpenItem,
}: {
  inquiryId: string;
  products: InquiryProductCard[];
  onOpenItem: (id: string) => void;
}) {
  if (products.length === 0) {
    return (
      <Section title="Products">
        <Empty>No products on this enquiry yet - add one from the enquiry form.</Empty>
      </Section>
    );
  }
  return (
    <Section
      title="Products"
      subtitle="Each card reads its spec live from the linked Item; qty & drawing from the line"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p, i) => (
          <ProductCard
            key={p.id}
            index={i}
            product={p}
            inquiryId={inquiryId}
            onOpenItem={onOpenItem}
          />
        ))}
      </div>
    </Section>
  );
}

function ProductCard({
  index,
  product,
  inquiryId,
  onOpenItem,
}: {
  index: number;
  product: InquiryProductCard;
  inquiryId: string;
  onOpenItem: (id: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [generating, setGenerating] = React.useState(false);
  const dims = composeDims(product);

  function handleGenerate() {
    setGenerating(true);
    startTransition(async () => {
      const res = await generateItemForInquiryItem(product.id);
      setGenerating(false);
      if (res.ok) {
        fireToast({
          message: res.reused ? `Linked existing item ${res.itemCode}` : `Item ${res.itemCode} created`,
          type: "success",
        });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-section border p-5",
        product.noItem ? "border-amber/50" : "border-hairline",
      )}
      style={{
        background: "var(--color-surface-soft)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-[28px] min-w-[28px] shrink-0 place-items-center rounded-full px-2 text-[12.5px] font-extrabold text-white tabular-nums"
          style={{
            background: "linear-gradient(135deg, #3F3F94 0%, #6d6dcf 100%)",
            boxShadow: "0 3px 8px -2px rgba(63,63,148,0.55)",
          }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 truncate text-[14.5px] font-extrabold tracking-tight text-ink-strong">
          {product.custProductName ?? product.shapeName ?? "Unnamed product"}
        </div>
        <button
          type="button"
          onClick={() => onOpenItem(product.id)}
          aria-label="Open item drawer"
          className="shrink-0 rounded-lg border border-hairline bg-surface-card p-1.5 text-ink-subtle transition-colors hover:border-brand hover:text-brand"
        >
          <PanelRightOpen size={15} strokeWidth={2.2} />
        </button>
      </div>

      {/* No-item badge */}
      {product.noItem && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber/50 px-2.5 py-1.5 text-[12px] font-semibold"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
        >
          <TriangleAlert size={14} strokeWidth={2.4} />
          {product.isDraft ? "Draft item - spec incomplete" : "Not linked to an Item"}
        </div>
      )}

      {/* Spec chips */}
      <div className="flex flex-wrap gap-1.5">
        {product.itemCode && (
          <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-card px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-strong">
            {product.itemCode}
          </span>
        )}
        {product.shapeName && <SpecChip>{product.shapeName}</SpecChip>}
        {product.gradeName && <SpecChip>{product.gradeName}</SpecChip>}
        {product.toleranceName && <SpecChip>{product.toleranceName}</SpecChip>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        <Field label="Qty" value={product.quantityNos ? `${product.quantityNos} ${product.quantityUom}` : "-"} mono />
        <Field label="Drawing" value={product.custDrawingNo ?? "-"} />
        <Field label="Dimensions" value={dims ?? "-"} mono full />
        <Field
          label="Costing"
          value={product.costingFinalCost ? `${inr(product.costingFinalCost)}/pc` : "Not costed"}
          mono
        />
        <Field label="Stage" value={PIPELINE_STAGE_LABELS[product.lineStage]} />
      </dl>

      {product.costingDoneStatus && (
        <div>
          <Chip
            label={COSTING_DONE_STATUS_LABELS[product.costingDoneStatus]}
            tone={COSTING_DONE_STATUS_COLORS[product.costingDoneStatus]}
          />
        </div>
      )}

      {/* Card actions */}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        {product.noItem ? (
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {generating ? "Generating" : "Generate item code"}
          </button>
        ) : (
          <Link
            href={`/items/${product.itemId}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
          >
            <ExternalLink size={13} strokeWidth={2.2} />
            Item
          </Link>
        )}
        <Link
          href={`/costings/new?inquiryItemId=${product.id}&inquiryId=${inquiryId}` as Route}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          <Ruler size={13} strokeWidth={2.2} />
          Cost
        </Link>
        <button
          type="button"
          onClick={() => onOpenItem(product.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          History
        </button>
      </div>
    </div>
  );
}

function SpecChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-track px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0", full && "col-span-2")}>
      <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</dt>
      <dd className={cn("truncate text-ink-strong", mono && "font-mono tabular-nums")}>{value}</dd>
    </div>
  );
}

/* ── Costing ───────────────────────────────────────────────────────────────── */

function CostingTab({
  inquiryId,
  products,
  onOpenItem,
}: {
  inquiryId: string;
  products: InquiryProductCard[];
  onOpenItem: (id: string) => void;
}) {
  if (products.length === 0) {
    return (
      <Section title="Costing">
        <Empty>Add products to the enquiry to start costing.</Empty>
      </Section>
    );
  }
  return (
    <Section title="Costing" subtitle="BU/BO + in-house per product; the chosen costing feeds the quote price">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
              <th className="py-2 pr-4 font-bold">Product</th>
              <th className="py-2 pr-4 font-bold">Item</th>
              <th className="py-2 pr-4 font-bold">Final cost</th>
              <th className="py-2 pr-4 font-bold">Status</th>
              <th className="py-2 font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="py-2.5 pr-4">
                  <button
                    type="button"
                    onClick={() => onOpenItem(p.id)}
                    className="text-left font-semibold text-ink-strong hover:text-brand"
                  >
                    {p.custProductName ?? p.shapeName ?? "Unnamed product"}
                  </button>
                </td>
                <td className="py-2.5 pr-4 font-mono text-[12px] text-ink-muted">
                  {p.itemCode ?? "-"}
                </td>
                <td className="py-2.5 pr-4 font-mono tabular-nums text-ink-strong">
                  {p.costingFinalCost ? `${inr(p.costingFinalCost)}/pc` : "-"}
                </td>
                <td className="py-2.5 pr-4">
                  {p.costingDoneStatus ? (
                    <Chip
                      label={COSTING_DONE_STATUS_LABELS[p.costingDoneStatus]}
                      tone={COSTING_DONE_STATUS_COLORS[p.costingDoneStatus]}
                    />
                  ) : (
                    <span className="text-ink-subtle">Not costed</span>
                  )}
                </td>
                <td className="py-2.5">
                  <Link
                    href={`/costings/new?inquiryItemId=${p.id}&inquiryId=${inquiryId}` as Route}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:underline"
                  >
                    {p.costingFinalCost ? "Re-cost" : "Cost product"}
                    <ArrowUpRight size={13} strokeWidth={2.4} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ── Stage tabs (Quotation / Negotiation / Sales Order) ────────────────────── */

function LockedPanel({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-hairline-strong bg-surface-soft px-6 py-10 text-center">
      <Lock size={20} strokeWidth={2.2} className="text-ink-subtle" />
      <p className="max-w-md text-[13px] text-ink-muted">{reason}</p>
    </div>
  );
}

function BuildForwardPanel({
  headline,
  detail,
  ctaLabel,
  href,
}: {
  headline: string;
  detail: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-brand/30 bg-brand/[0.04] px-5 py-6">
      <div className="text-[16px] font-bold text-ink-strong">{headline}</div>
      <p className="text-[13px] text-ink-muted">{detail}</p>
      <Link
        href={href as Route}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        {ctaLabel}
        <ArrowUpRight size={14} strokeWidth={2.4} />
      </Link>
    </div>
  );
}

function StageLinesTable({ lines }: { lines: StageLine[] }) {
  if (lines.length === 0) return <Empty>No line items on this record.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
            <th className="py-2 pr-4 font-bold">Product</th>
            <th className="py-2 pr-4 font-bold">Item</th>
            <th className="py-2 pr-4 font-bold">Qty</th>
            <th className="py-2 pr-4 font-bold">Unit price</th>
            <th className="py-2 font-bold">Basis</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="py-2.5 pr-4 font-semibold text-ink-strong">
                {l.ask.custProductName ?? l.spec.shapeName ?? "-"}
              </td>
              <td className="py-2.5 pr-4">
                {l.spec.itemId ? (
                  <Link
                    href={`/items/${l.spec.itemId}` as Route}
                    className="font-mono text-[12px] text-brand hover:underline"
                  >
                    {l.spec.itemCode ?? "-"}
                  </Link>
                ) : (
                  <span className="font-mono text-[12px] text-ink-subtle">-</span>
                )}
              </td>
              <td className="py-2.5 pr-4 font-mono tabular-nums text-ink-muted">{l.qty ?? "-"}</td>
              <td className="py-2.5 pr-4 font-mono tabular-nums text-ink-strong">
                {inr(l.unitPrice) ?? "-"}
              </td>
              <td className="py-2.5">
                {l.frozen ? (
                  <StatusPill tone="green" size="sm">
                    Frozen
                  </StatusPill>
                ) : (
                  <StatusPill tone="slate" size="sm">
                    Live
                  </StatusPill>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuotationTab({
  inquiryId,
  tabData,
  locked,
  costedCount,
  productCount,
}: {
  inquiryId: string;
  tabData: StageTab<{ id: string; quoteNo: string; quoteSent: boolean; quotePrice: string | null; createdAt: Date }>;
  locked: boolean;
  costedCount: number;
  productCount: number;
}) {
  if (tabData.record) {
    const q = tabData.record;
    return (
      <Section title="Quotation" subtitle="Live quotation for this SM (spec resolved through the Item)">
        <RecordHeader
          label={q.quoteNo}
          href={`/quotations/${q.id}`}
          pill={q.quoteSent ? { tone: "green", label: "Sent" } : { tone: "slate", label: "Draft" }}
          date={q.createdAt}
        />
        <div className="mt-4">
          <StageLinesTable lines={tabData.lines} />
        </div>
      </Section>
    );
  }
  if (locked) {
    return (
      <Section title="Quotation">
        <LockedPanel reason="Cost at least one product before generating a quotation - this stage unlocks once a chosen costing exists." />
      </Section>
    );
  }
  return (
    <Section title="Quotation">
      <BuildForwardPanel
        headline={`${costedCount} of ${productCount} product${productCount === 1 ? "" : "s"} costed & ready to quote`}
        detail="Generate a quotation from the chosen costings - the spec and prices flow from the Item and costing, so nothing is re-keyed."
        ctaLabel="Generate quotation"
        href={`/quotations/new?inquiryId=${inquiryId}`}
      />
    </Section>
  );
}

function NegotiationTab({
  inquiryId,
  tabData,
  locked,
  hasQuotation,
}: {
  inquiryId: string;
  tabData: StageTab<{ id: string; negotiationNo: string; negotiationStatus: string; createdAt: Date }>;
  locked: boolean;
  hasQuotation: boolean;
}) {
  if (tabData.record) {
    const n = tabData.record;
    const tone = (NEGOTIATION_STATUS_COLORS[n.negotiationStatus as keyof typeof NEGOTIATION_STATUS_COLORS] ?? "slate") as PillTone;
    const label =
      NEGOTIATION_STATUS_LABELS[n.negotiationStatus as keyof typeof NEGOTIATION_STATUS_LABELS] ?? n.negotiationStatus;
    return (
      <Section title="Negotiation" subtitle="Live negotiation for this SM">
        <RecordHeader
          label={n.negotiationNo}
          href={`/negotiations/${n.id}`}
          pill={{ tone, label }}
          date={n.createdAt}
        />
        <div className="mt-4">
          <StageLinesTable lines={tabData.lines} />
        </div>
      </Section>
    );
  }
  if (locked) {
    return (
      <Section title="Negotiation">
        <LockedPanel reason="Send a quotation first - the negotiation stage opens once a quote has gone to the customer." />
      </Section>
    );
  }
  return (
    <Section title="Negotiation">
      <BuildForwardPanel
        headline="Quotation ready - start the negotiation"
        detail={
          hasQuotation
            ? "Open a negotiation to track revisions, follow-ups and the verbal yes."
            : "A negotiation tracks the back-and-forth on price and terms."
        }
        ctaLabel="Start negotiation"
        href={`/negotiations/new?inquiryId=${inquiryId}`}
      />
    </Section>
  );
}

function SalesOrderTab({
  inquiryId,
  tabData,
  locked,
  hasNegotiation,
}: {
  inquiryId: string;
  tabData: StageTab<{ id: string; soNo: string; customerSoSent: boolean; createdAt: Date }>;
  locked: boolean;
  hasNegotiation: boolean;
}) {
  if (tabData.record) {
    const so = tabData.record;
    return (
      <Section title="Sales Order" subtitle="Confirmed order for this SM (qty & price frozen at confirm)">
        <RecordHeader
          label={so.soNo}
          href={`/sales-orders/${so.id}`}
          pill={so.customerSoSent ? { tone: "green", label: "Confirmed" } : { tone: "slate", label: "Draft" }}
          date={so.createdAt}
        />
        <div className="mt-4">
          <StageLinesTable lines={tabData.lines} />
        </div>
      </Section>
    );
  }
  if (locked) {
    return (
      <Section title="Sales Order">
        <LockedPanel reason="Win the negotiation first - the sales order is raised once the order is marked won." />
      </Section>
    );
  }
  return (
    <Section title="Sales Order">
      <BuildForwardPanel
        headline="Negotiation won - raise the sales order"
        detail={
          hasNegotiation
            ? "Convert the won negotiation into a sales order; agreed prices carry straight through."
            : "A sales order captures the customer PO and confirms the contract."
        }
        ctaLabel="Create sales order"
        href={`/sales-orders/new?inquiryId=${inquiryId}`}
      />
    </Section>
  );
}

function RecordHeader({
  label,
  href,
  pill,
  date,
}: {
  label: string;
  href: string;
  pill: { tone: PillTone; label: string };
  date: Date;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
      <Link href={href as Route} className="font-mono text-[16px] font-bold text-brand hover:underline">
        {label}
      </Link>
      <StatusPill tone={pill.tone} size="sm">
        {pill.label}
      </StatusPill>
      <span className="text-[12px] text-ink-subtle">{formatDate(date)}</span>
      <Link
        href={href as Route}
        className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:underline"
      >
        Open record
        <ArrowUpRight size={13} strokeWidth={2.4} />
      </Link>
    </div>
  );
}

/* ── Documents ─────────────────────────────────────────────────────────────── */

function DocumentsTab({
  products,
  drawers,
}: {
  products: InquiryProductCard[];
  drawers: Record<string, ProductDrawerData>;
}) {
  // De-dupe documents by id across the SM's product items.
  const seen = new Set<string>();
  const docs: Array<{
    id: string;
    title: string;
    createdAt: Date;
    downloadUrl: string | null;
    product: string;
  }> = [];
  for (const p of products) {
    const bundle = drawers[p.id];
    if (!bundle) continue;
    for (const d of bundle.documents) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      docs.push({
        id: d.id,
        title: d.title,
        createdAt: d.createdAt,
        downloadUrl: d.downloadUrl,
        product: p.custProductName ?? p.itemCode ?? "Product",
      });
    }
  }
  docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <Section title="Documents" subtitle="Drawings & files filed against this SM's product Items">
      {docs.length > 0 ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5 text-[14px]">
              <FileText size={15} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
              <span className="flex-1 truncate font-semibold text-ink-strong">{d.title}</span>
              <span className="text-[12px] text-ink-subtle">{d.product}</span>
              <span className="text-[12px] text-ink-subtle">{formatDate(d.createdAt)}</span>
              {d.downloadUrl && (
                <a
                  href={d.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
                >
                  Open
                  <ExternalLink size={12} strokeWidth={2.4} />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No documents attached to this SM's products yet.</Empty>
      )}
    </Section>
  );
}

/* ── Product drawer ────────────────────────────────────────────────────────── */

function ProductDrawer({
  product,
  data,
  onOpenChange,
}: {
  product: InquiryProductCard;
  data: ProductDrawerData | null;
  onOpenChange: (open: boolean) => void;
}) {
  const dims = composeDims(product);
  const wu = data?.whereUsed;

  const specFields: DetailField[] = [
    { label: "Item Code", value: product.itemCode, mono: true },
    { label: "Shape", value: product.shapeName },
    { label: "Grade (Internal)", value: product.gradeName },
    { label: "Tolerance", value: product.toleranceName },
    { label: "Condition", value: product.conditionName },
    { label: "Dimensions", value: dims, mono: true, full: true },
    { label: "Customer Drawing", value: product.custDrawingNo, mono: true },
    { label: "Drawing Rev", value: product.drawingRevisionNo },
    { label: "Customer Grade", value: product.gradeCustomer },
    { label: "Qty", value: product.quantityNos ? `${product.quantityNos} ${product.quantityUom}` : null, mono: true },
  ];

  return (
    <ContextDrawer
      open
      onOpenChange={onOpenChange}
      title={`Product ${product.custProductName ?? product.itemCode ?? ""}`}
      header={
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            Product · Item
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[20px] font-bold text-ink-strong break-all">
              {product.custProductName ?? "Unnamed product"}
            </span>
            {product.noItem ? (
              <StatusPill tone="amber" size="sm">
                No item
              </StatusPill>
            ) : (
              <span className="font-mono text-[13px] text-ink-muted">{product.itemCode}</span>
            )}
          </div>
          {product.itemId && (
            <Link
              href={`/items/${product.itemId}` as Route}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
            >
              <ExternalLink size={14} strokeWidth={2.2} />
              Open Item workspace
            </Link>
          )}
        </div>
      }
      tabs={[
        {
          key: "overview",
          label: "Overview",
          content: (
            <div className="flex flex-col gap-6">
              <DetailGrid columns={1} fields={specFields.slice(0, 6)} />
              {wu && <ReachChips reach={wu} />}
            </div>
          ),
        },
        {
          key: "spec",
          label: "Spec",
          content: <DetailGrid columns={1} fields={specFields} />,
        },
        {
          key: "whereUsed",
          label: "Where-used",
          content: wu ? (
            <div className="flex flex-col gap-5">
              <ReachChips reach={wu} />
              <RelatedList records={wu.related} />
            </div>
          ) : (
            <Empty>Where-used unavailable.</Empty>
          ),
        },
        {
          key: "docs",
          label: "Docs",
          content: data && data.documents.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline">
              {data.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5 text-[14px]">
                  <FileText size={15} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
                  <span className="flex-1 truncate font-semibold text-ink-strong">{d.title}</span>
                  {d.downloadUrl && (
                    <a
                      href={d.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-semibold text-brand hover:underline"
                    >
                      Open
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No documents on this item yet.</Empty>
          ),
        },
        {
          key: "costs",
          label: "Costs",
          content: wu && wu.costHistory.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline">
              {wu.costHistory.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className="text-ink-muted">{c.costingType.replace("_", "-")}</span>
                  <span className="ml-auto font-mono tabular-nums text-ink-strong">
                    {inr(c.finalCostPerPiece) ?? "-"}
                  </span>
                  {c.isChosen && (
                    <StatusPill tone="green" size="sm">
                      Chosen
                    </StatusPill>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No costings linked to this item yet.</Empty>
          ),
        },
        {
          key: "audit",
          label: "Audit",
          content: data ? <AuditHistory entries={data.audit} /> : <Empty>No history.</Empty>,
        },
      ]}
    />
  );
}

function ReachChips({ reach }: { reach: ProductDrawerData["whereUsed"] }) {
  const r = reach.reach;
  const chips: ReadonlyArray<readonly [string, number]> = [
    ["Enquiries", r.enquiryCount],
    ["Costings", r.costingCount],
    ["Quotations", r.quotationCount],
    ["Negotiations", r.negotiationCount],
    ["Sales Orders", r.salesOrderCount],
    ["Job Cards", r.jobCardCount],
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

function RelatedList({ records }: { records: ProductDrawerData["whereUsed"]["related"] }) {
  if (records.length === 0) return <Empty>Nothing references this item yet.</Empty>;
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {records.map((r) => {
        const inner = (
          <span className="flex items-center gap-3">
            <span className="font-mono text-[13px] font-bold text-ink-strong">{r.label}</span>
            {r.sub && <span className="truncate text-[13px] text-ink-muted">{r.sub}</span>}
            <span className="ml-auto text-[12px] text-ink-subtle">
              {r.date ? formatDate(r.date) : ""}
            </span>
          </span>
        );
        return (
          <li key={`${r.kind}-${r.id}`} className="py-2.5 text-[14px]">
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
    </ul>
  );
}

/* ── shared building blocks ────────────────────────────────────────────────── */

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
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-subtle">{title}</h2>
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
