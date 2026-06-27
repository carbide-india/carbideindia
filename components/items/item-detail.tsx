import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { COSTING_TYPE_LABELS } from "@/db/enums";
import { formatDate } from "@/lib/format";
import type { ItemDetail as ItemDetailType } from "@/lib/queries/items";
import type { AuditEntry } from "@/lib/queries/audit";
import type { ItemDocument } from "@/lib/queries/item-documents";
import { AuditHistory } from "@/components/audit/audit-history";
import { ItemDocuments } from "@/components/items/item-documents";
import { ItemStatusControl } from "@/components/items/item-status-control";

interface Props {
  item: ItemDetailType;
  auditEntries: AuditEntry[];
  documents: ItemDocument[];
  isAdmin: boolean;
}

export function ItemDetail({ item, auditEntries, documents, isAdmin }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Breadcrumb ─────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        <Link
          href={"/items" as Route}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Item Master
        </Link>
        <span className="text-ink-subtle">/</span>
        <span className="font-mono text-ink-subtle">{item.itemCode}</span>
      </nav>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
            Item Master · Record
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-[40px] leading-tight tracking-tight text-ink-strong">
              {item.itemCode}
            </h1>
            {!item.isActive && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-subtle)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-ink-subtle)" }} />
                Inactive
              </span>
            )}
          </div>
          <p className="text-[15px] text-ink-muted">
            {item.seq && (
              <>
                <span className="font-semibold">#{item.seq}</span>
                <span className="mx-2 text-ink-subtle">·</span>
              </>
            )}
            {item.customerName ?? "—"}
            {item.smNumber && (
              <>
                <span className="mx-2 text-ink-subtle">·</span>
                <span className="font-mono">{item.smNumber}</span>
              </>
            )}
          </p>
        </div>
        {isAdmin && (
          <ItemStatusControl
            itemId={item.id}
            itemCode={item.itemCode}
            isActive={item.isActive}
          />
        )}
      </header>

      {/* ── Cards ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {/* Classification */}
        <ReadCard title="Classification">
          <InfoGrid
            rows={[
              ["Shape", item.shapeName],
              ["Grade (Internal)", item.gradeName],
              ["Tolerance", item.toleranceName],
              ["Condition", item.conditionName],
              ["Size Code", item.sizeCode],
              [
                "Costing Type",
                item.costingType ? COSTING_TYPE_LABELS[item.costingType] : null,
              ],
            ]}
          />
        </ReadCard>

        {/* Tax & Units */}
        <ReadCard title="Tax & Units">
          <InfoGrid
            rows={[
              ["HSN Code", item.hsnCode],
              ["Unit of Measure", item.uom],
              [
                "Alt UoM",
                item.altUom && item.altUomConversion
                  ? `${item.altUom} (1 = ${item.altUomConversion} ${item.uom ?? "base"})`
                  : item.altUom,
              ],
            ]}
          />
        </ReadCard>

        {/* Dimensions */}
        <ReadCard title="Dimensions">
          <InfoGrid
            rows={[
              ["Dimensions", composeDimensions(item)],
              ["Dimension Notes", item.dimensionNotes],
            ]}
          />
        </ReadCard>

        {/* Customer / Source */}
        <ReadCard title="Customer / Source">
          <InfoGrid
            rows={[
              ["Customer Name", item.customerName],
              ["SM Number", item.smNumber],
              ["Customer Product Name", item.custProductName],
              ["Drawing No", item.custDrawingNo],
              ["Drawing Revision", item.drawingRevisionNo],
              ["Quantity", item.qty],
              ["Grade (Customer)", item.gradeCustomer],
              ["Grade Name for Customer", item.gradeNameForCust],
            ]}
          />
        </ReadCard>

        {/* Part — only if any part field is set */}
        {hasPartData(item) && (
          <ReadCard title="Part">
            <InfoGrid
              rows={[
                ["Part No", item.partNo],
                ["Description 1", item.partDescription1],
                ["Description 2", item.partDescription2],
                ["Description 3", item.partDescription3],
                ["Description 4", item.partDescription4],
                ["Part Tag", item.partTag],
              ]}
            />
          </ReadCard>
        )}

        {/* Meta */}
        <ReadCard title="Record Info">
          <InfoGrid
            rows={[
              ["Created", formatDate(item.createdAt)],
              ["Last Updated", formatDate(item.updatedAt)],
            ]}
          />
        </ReadCard>

        {/* Drawings & Documents */}
        <ReadCard title="Drawings & Documents">
          <ItemDocuments itemId={item.id} documents={documents} />
        </ReadCard>

        {/* History */}
        <ReadCard title="History">
          <AuditHistory entries={auditEntries} />
        </ReadCard>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function composeDimensions(
  item: Pick<
    ItemDetailType,
    "outerDia" | "innerDia" | "length" | "width" | "thickness"
  >,
): string | null {
  const parts: string[] = [];
  if (item.outerDia) parts.push(`OD ${item.outerDia}`);
  if (item.innerDia) parts.push(`ID ${item.innerDia}`);
  if (item.length) parts.push(`L ${item.length}`);
  if (item.width) parts.push(`W ${item.width}`);
  if (item.thickness) parts.push(`T ${item.thickness}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function hasPartData(
  item: Pick<
    ItemDetailType,
    "partNo" | "partDescription1" | "partDescription2" | "partDescription3" | "partDescription4" | "partTag"
  >,
): boolean {
  return !!(
    item.partNo ||
    item.partDescription1 ||
    item.partDescription2 ||
    item.partDescription3 ||
    item.partDescription4 ||
    item.partTag
  );
}

/* ── Read-only building blocks ───────────────────────────────────────── */

function ReadCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="bg-surface-card rounded-section border border-hairline p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <h2 className="mb-4 text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoGrid({
  rows,
}: {
  rows: ReadonlyArray<readonly [string, string | null | undefined]>;
}) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (visible.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
      {visible.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-[12px] font-bold text-ink-subtle">{label}</dt>
          <dd className="text-[14px] text-ink-strong break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
