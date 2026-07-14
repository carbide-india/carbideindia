"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Pencil,
  ClipboardList,
  Boxes,
  FileText,
  Building2,
  Layers,
  LayoutDashboard,
  ExternalLink,
  PackageCheck,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import type {
  JobCardWorkspaceData,
  JobCardSibling,
} from "@/lib/queries/job-cards";
import type { AuditEntry } from "@/lib/queries/audit";
import { AppShell, type RailGroup } from "@/components/erp/app-shell";
import { Stepper } from "@/components/erp/stepper";
import { StatusPill, type PillTone } from "@/components/erp/status-pill";
import { DetailGrid, type DetailField } from "@/components/erp/detail-grid";
import { AuditHistory } from "@/components/audit/audit-history";
import { stageIndex } from "@/lib/flow/derive-stage";
import { cn } from "@/lib/utils";

/**
 * JobCardWorkspace (ERP redesign - Phase 9b, §10 "Job Card Workspace").
 *
 * The split record workspace for a production Job Card:
 *   LEFT  · JOB EXECUTION - what the planner/operator does (job card no, OA,
 *           dates, planned qty, pressing type, dispatch condition, YP + support
 *           sizes, outsource/vendor, process, remarks) - read here, edited via
 *           the existing workbench form (Edit CTA round-trips to the register).
 *   RIGHT · PRODUCT SUMMARY - a LIVE, read-only projection of the linked Item
 *           (SSOT via spec-resolve) + the exact Sales-Order line (customer +
 *           ordered qty). Nothing here is typed on the job card.
 *   BELOW · a manufacturing timeline (Stepper pinned at Job Card, plus a simple
 *           production/status list), a quality-checklist placeholder, operator
 *           notes, and attachments (placeholder until per-JC docs are wired).
 *
 * Answers Where-am-I (breadcrumb + header) · What's-happening (StatusPill +
 * Stepper) · What-next (timeline). Reuses the LIVE erp primitives.
 */

interface JobCardWorkspaceProps {
  data: JobCardWorkspaceData;
  auditEntries: AuditEntry[];
  isAdmin: boolean;
}

const NAV: ReadonlyArray<RailGroup> = [
  {
    label: "Production",
    items: [{ href: "/job-cards", label: "Job Cards", Icon: ClipboardList }],
  },
  {
    label: "Product",
    items: [{ href: "/items", label: "Item Master", Icon: Boxes }],
  },
  {
    label: "Sales",
    items: [
      { href: "/inquiries", label: "Enquiries", Icon: FileText },
      { href: "/clients", label: "Clients", Icon: Building2 },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/masters", label: "Masters", Icon: Layers },
      { href: "/", label: "Dashboard", Icon: LayoutDashboard },
    ],
  },
];

/** Numeric-ish string → shown as-is (trimmed) or a dash. */
function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  const s = String(v).trim();
  return s === "" ? "-" : s;
}

/** yyyy-mm-dd rendered via the shared IN date formatter, else a dash. */
function fmt(d: Date | null): string {
  return d ? formatDate(d) : "-";
}

/** Compose the item's dimensions into one mono string. */
function composeDimensions(spec: JobCardWorkspaceData["spec"]): string | null {
  if (!spec) return null;
  const parts: string[] = [];
  if (spec.outerDia) parts.push(`OD ${spec.outerDia}`);
  if (spec.innerDia) parts.push(`ID ${spec.innerDia}`);
  if (spec.length) parts.push(`L ${spec.length}`);
  if (spec.width) parts.push(`W ${spec.width}`);
  if (spec.thickness) parts.push(`T ${spec.thickness}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function JobCardWorkspace({
  data,
  auditEntries,
  isAdmin,
}: JobCardWorkspaceProps) {
  const router = useRouter();
  const { card, spec, salesOrder, siblings } = data;

  // Job Card is the 7th pipeline stage (index 6). The stepper is pinned there:
  // reaching the shop floor means the sales pipeline is complete through SO.
  const current = stageIndex("job_card");

  const statusTone: PillTone = card.isActive ? "green" : "slate";
  const statusLabel = card.isActive ? "Active" : "Inactive";

  const dimensions = composeDimensions(spec);

  // ── LEFT · job-execution fields (read view of the editable row). ──
  const jobFields: DetailField[] = [
    { label: "Job Card No", value: card.jobCardNo, mono: true },
    { label: "O.A. No", value: dash(card.oaNo) },
    { label: "Job Card Date", value: fmt(card.jobCardDate) },
    { label: "Delivery Date", value: fmt(card.deliveryDate) },
    { label: "Planned Qty to Press", value: dash(card.plannedQtyToPress), mono: true },
    { label: "Order Quantity", value: dash(card.orderQuantity), mono: true },
    { label: "Pressing Type", value: dash(data.pressingTypeName) },
    { label: "Dispatch Condition", value: dash(data.dispatchConditionName) },
    { label: "Tolerance", value: dash(data.toleranceName) },
    { label: "Weight", value: dash(card.weight), mono: true },
    { label: "Height Min / Max", value: `${dash(card.heightMin)} / ${dash(card.heightMax)}`, mono: true },
    { label: "YP No", value: dash(card.ypNo) },
    { label: "Support Size (Top / Bottom)", value: `${dash(card.supportSizeTop)} / ${dash(card.supportSizeBottom)}` },
    { label: "Dia Size", value: dash(card.diaSize) },
    { label: "Punch Size", value: dash(card.punchSize) },
    { label: "Proposed Size", value: dash(card.proposedSize) },
  ];

  const outsourceFields: DetailField[] = [
    { label: "Outsource", value: card.outsource == null ? "-" : card.outsource ? "Yes" : "No" },
    { label: "Supplier / Vendor", value: dash(card.supplierVendorName) },
    { label: "Sample for Sintering", value: card.makeSampleForSintering == null ? "-" : card.makeSampleForSintering ? "Yes" : "No" },
    { label: "Process", value: dash(card.process), full: true },
  ];

  // ── RIGHT · live product summary (resolved from Item + SO). ──
  const productFields: DetailField[] = [
    { label: "Item Code", value: spec?.itemCode ?? "-", mono: true, href: spec?.itemId ? `/items/${spec.itemId}` : undefined },
    { label: "Shape", value: dash(spec?.shapeName) },
    { label: "Grade (Internal)", value: dash(spec?.gradeName) },
    { label: "Grade Colour", value: dash(card.gradeColour) },
    { label: "Dimensions", value: dimensions ?? "-", mono: true },
    { label: "Tolerance", value: dash(spec?.toleranceName ?? data.toleranceName) },
    { label: "Condition", value: dash(spec?.conditionName) },
    { label: "HSN Code", value: dash(spec?.hsnCode), mono: true },
    { label: "Unit of Measure", value: dash(spec?.uom) },
    { label: "Part No", value: dash(spec?.partNo), mono: true },
  ];

  const orderFields: DetailField[] = [
    { label: "Customer", value: dash(salesOrder?.clientName ?? data.clientName ?? card.customerName) },
    { label: "Sales Order", value: salesOrder?.soNo ?? "-", mono: true, href: salesOrder?.salesOrderId ? `/sales-orders/${salesOrder.salesOrderId}` : undefined },
    { label: "SO Line", value: salesOrder?.sortOrder != null ? `Line ${salesOrder.sortOrder + 1}` : "-" },
    { label: "Ordered Qty", value: dash(salesOrder?.qtyOrdered ?? salesOrder?.lineQty), mono: true, snapshot: Boolean(salesOrder?.qtyOrdered) },
    { label: "Dispatch Condition", value: dash(data.dispatchConditionName) },
  ];

  const breadcrumb = [
    { label: "Production", href: "/job-cards" },
    { label: "Job Cards", href: "/job-cards" },
    { label: card.jobCardNo },
  ];

  return (
    <AppShell
      nav={NAV}
      breadcrumb={breadcrumb}
      collapseKey="erp-jobcard-shell-collapsed"
      contextBarExtra={<Stepper current={current} className="max-w-full" />}
    >
      <div className="flex flex-col gap-6">
        {/* Workspace header */}
        <div
          className="rounded-2xl border border-hairline bg-surface-card p-6 max-md:p-4"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
                Job Card · Work Order
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="font-mono text-[38px] leading-none tracking-tight text-ink-strong break-all">
                  {card.jobCardNo}
                </h1>
                <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
              </div>
              <p className="mt-3 text-[15px] text-ink-muted">
                {spec?.itemCode ? (
                  <>
                    <span className="font-mono font-semibold text-ink-soft">{spec.itemCode}</span>
                    {(spec.shapeName || spec.gradeName) && (
                      <span className="mx-2 text-ink-subtle">·</span>
                    )}
                  </>
                ) : null}
                {spec?.shapeName ?? "-"}
                {spec?.gradeName && (
                  <>
                    <span className="mx-2 text-ink-subtle">·</span>
                    {spec.gradeName}
                  </>
                )}
                {salesOrder?.clientName && (
                  <>
                    <span className="mx-2 text-ink-subtle">·</span>
                    {salesOrder.clientName}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => router.push(`/job-cards?edit=${card.id}` as Route)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
              >
                <Pencil size={15} strokeWidth={2.2} />
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* Split body: LEFT job execution ~55% · RIGHT product summary ~45% */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start">
          {/* LEFT - job execution */}
          <div className="flex flex-col gap-6">
            <Card>
              <Section title="Job details" subtitle="What we do - execution facts">
                <DetailGrid fields={jobFields} columns={2} />
              </Section>
            </Card>
            <Card>
              <Section title="Outsourcing & process">
                <DetailGrid fields={outsourceFields} columns={2} />
              </Section>
            </Card>
            {card.remarks && (
              <Card>
                <Section title="Remarks">
                  <p className="text-[15px] leading-relaxed text-ink-strong whitespace-pre-wrap">
                    {card.remarks}
                  </p>
                </Section>
              </Card>
            )}
          </div>

          {/* RIGHT - live product summary (sticky on wide screens) */}
          <div className="flex flex-col gap-6 xl:sticky xl:top-6">
            <Card accent>
              <Section
                title="Product summary"
                subtitle="Live from the linked Item (SSOT) - read-only"
              >
                {spec?.itemId ? (
                  <>
                    <DetailGrid fields={productFields} columns={2} />
                    <div className="mt-4">
                      <Link
                        href={`/items/${spec.itemId}` as Route}
                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
                      >
                        <ExternalLink size={14} strokeWidth={2.2} />
                        Open Item {spec.itemCode}
                      </Link>
                    </div>
                  </>
                ) : (
                  <Placeholder>
                    This job card is not linked to an Item yet - link a product in
                    the workbench to resolve a live spec here.
                  </Placeholder>
                )}
              </Section>
            </Card>

            <Card>
              <Section title="Order context" subtitle="Customer & ordered qty (from the SO line)">
                <DetailGrid fields={orderFields} columns={2} />
              </Section>
            </Card>

            <Card>
              <Section
                title="Previous job cards for this item"
                subtitle="Where-used - other work orders on the same spec"
              >
                <SiblingList siblings={siblings} />
              </Section>
            </Card>
          </div>
        </div>

        {/* BELOW - manufacturing timeline + QC + notes + attachments */}
        <Card>
          <Section title="Manufacturing timeline" subtitle="Production stage & activity">
            <div className="rounded-xl border border-hairline bg-surface-soft px-4 py-4">
              <Stepper current={current} className="max-w-full" />
            </div>
            <div className="mt-5">
              <AuditHistory entries={auditEntries} />
            </div>
          </Section>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <Section title="Quality checklist" subtitle="QC checks (coming with Production)">
              <Placeholder>
                Per-grade / per-tolerance QC checks (dimensional, hardness,
                density) attach here once the Production module lands.
              </Placeholder>
            </Section>
          </Card>
          <Card>
            <Section title="Operator notes" subtitle="Per-job execution log">
              <Placeholder>
                Append-only operator notes (deviations, machine, shift) attach here
                once the Production module lands - spec-level method stays on the
                Item.
              </Placeholder>
            </Section>
          </Card>
        </div>

        <Card>
          <Section title="Attachments" subtitle="Route sheets & job documents">
            <Placeholder>
              Per-job-card documents (route sheet, drawing revision in use) surface
              here - filed against this job card via the documents library.
            </Placeholder>
          </Section>
        </Card>
      </div>
    </AppShell>
  );
}

/* ── building blocks ───────────────────────────────────────────────────── */

function Card({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface-card p-6 max-md:p-4",
        accent ? "border-brand/30" : "border-hairline",
      )}
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      {children}
    </div>
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

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-hairline-strong bg-surface-soft px-4 py-3 text-[13px] text-ink-subtle">
      {children}
    </div>
  );
}

function SiblingList({ siblings }: { siblings: JobCardSibling[] }) {
  if (siblings.length === 0) {
    return (
      <Placeholder>
        No other job cards reference this item yet - this is the first.
      </Placeholder>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {siblings.map((s) => (
        <li key={s.id}>
          <Link
            href={`/job-cards/${s.id}` as Route}
            className="group flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-brand"
          >
            <span className="flex items-center gap-2 min-w-0">
              <PackageCheck
                size={15}
                strokeWidth={2.1}
                className="shrink-0 text-ink-subtle group-hover:text-brand"
              />
              <span className="font-mono text-[13px] font-semibold text-ink-strong group-hover:text-brand">
                {s.jobCardNo}
              </span>
              {!s.isActive && <StatusPill tone="slate" size="sm">Inactive</StatusPill>}
            </span>
            <span className="flex items-center gap-3 shrink-0 text-[12px] text-ink-subtle tabular-nums">
              {s.plannedQtyToPress && <span>{s.plannedQtyToPress} pc</span>}
              <span>{fmt(s.jobCardDate ?? s.createdAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
