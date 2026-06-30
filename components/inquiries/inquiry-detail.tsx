"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ExternalLink, ArrowLeft, Plus, MoreVertical, Pencil, Archive, Trash2 } from "lucide-react";
import {
  CHECK_STATE_LABELS,
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_COLORS,
  INQUIRY_PRIORITY_LABELS,
  INQUIRY_SOURCE_LABELS,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
  type CheckState,
  type CostingDoneStatus,
} from "@/db/enums";
import type { Inquiry, InquiryItem } from "@/db/schema";
import {
  setEnquiryStatus,
  generateItemForInquiryItem,
  archiveInquiry,
  deleteInquiry,
} from "@/app/(app)/inquiries/actions";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Chip, PRIORITY_TONES } from "./chip";
import { StatusPicker } from "./status-picker";
import { FeasibilityPanel } from "./feasibility-panel";

const CHECK_TONES: Record<CheckState, string> = {
  given: "green",
  not_given: "red",
  assumed: "amber",
};

interface MasterNames {
  grade: string | null;
  tolerance: string | null;
  condition: string | null;
}

/** An inquiry_items row with resolved master names, linked item code, and chosen costing summary. */
export type ProductRow = InquiryItem & {
  gradeName: string | null;
  toleranceName: string | null;
  conditionName: string | null;
  itemCode: string | null;
  costingFinalCost: string | null;
  costingDoneStatus: CostingDoneStatus | null;
};

interface Props {
  inquiry: Inquiry;
  employees: EmployeeOption[];
  masterNames: MasterNames;
  products: ProductRow[];
  isAdmin: boolean;
}

/**
 * The SM repo — everything about one inquiry on one page, status in the
 * sidebar (per the transcript: status lives beside the record, not inside
 * the form), Primary Feasibility below.
 */
export function InquiryDetail({ inquiry, employees, masterNames, products, isAdmin }: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [lifecyclePending, startLifecycle] = React.useTransition();
  const [generatingId, setGeneratingId] = React.useState<string | null>(null);

  const salesPerson =
    employees.find((e) => e.id === inquiry.assignedSalesPersonId)?.name ?? null;
  const createdBy =
    employees.find((e) => e.id === inquiry.createdById)?.name ?? null;

  function handleArchive() {
    startLifecycle(async () => {
      const res = await archiveInquiry(inquiry.id);
      if (res.ok) {
        fireToast({ message: `Enquiry ${inquiry.smNumber} archived`, type: "success" });
        router.push("/inquiries" as Route);
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Delete enquiry ${inquiry.smNumber}? This cannot be undone.`,
      )
    ) {
      return;
    }
    startLifecycle(async () => {
      const res = await deleteInquiry(inquiry.id);
      if (res.ok) {
        fireToast({ message: `Enquiry ${inquiry.smNumber} deleted`, type: "success" });
        router.push("/inquiries" as Route);
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  function handleGenerateItem(productId: string) {
    setGeneratingId(productId);
    startTransition(async () => {
      const res = await generateItemForInquiryItem(productId);
      setGeneratingId(null);
      if (res.ok) {
        fireToast({
          message: res.reused
            ? `Linked existing item ${res.itemCode}`
            : `Item ${res.itemCode} created`,
          type: "success",
        });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        <Link
          href={"/inquiries" as Route}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Enquiries
        </Link>
        <span className="text-ink-subtle">/</span>
        <span className="font-mono text-ink-subtle">{inquiry.smNumber}</span>
      </nav>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
            Sales · SM Repo
          </p>
          <h1 className="font-mono text-[40px] leading-tight tracking-tight text-ink-strong">
            {inquiry.smNumber}
          </h1>
          <p className="text-[15px] text-ink-muted">
            {inquiry.companyName}
            <span className="mx-2 text-ink-subtle">·</span>
            {formatDate(inquiry.enquiryDate)}
            {inquiry.source && (
              <>
                <span className="mx-2 text-ink-subtle">·</span>
                via {INQUIRY_SOURCE_LABELS[inquiry.source]}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Chip
            label={INQUIRY_PRIORITY_LABELS[inquiry.priority]}
            tone={PRIORITY_TONES[inquiry.priority]}
          />
          <Link
            href={"/inquiries/new" as Route}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft transition-colors"
          >
            <Plus size={14} strokeWidth={2.6} />
            New Enquiry
          </Link>
          <KebabMenu
            inquiryId={inquiry.id}
            isAdmin={isAdmin}
            busy={lifecyclePending}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        </div>
      </header>

      {/* ── Meta strip ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-section border border-hairline bg-surface-card px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
            Enquiry Status
          </span>
          <StatusPicker
            value={inquiry.enquiryStatus}
            options={ENQUIRY_STATUSES}
            labels={ENQUIRY_STATUS_LABELS}
            tones={ENQUIRY_STATUS_COLORS}
            onPick={(next) => setEnquiryStatus(inquiry.id, next)}
            ariaLabel="Enquiry status"
          />
        </div>
        <MetaItem label="Sales Person" value={salesPerson ?? "Not allocated"} />
        <MetaItem label="Created" value={formatDate(inquiry.createdAt)} />
        {createdBy && <MetaItem label="Created By" value={createdBy} />}
        <MetaItem label="Last Updated" value={formatDate(inquiry.updatedAt)} />
        {inquiry.smFolderLink && (
          <a
            href={inquiry.smFolderLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 self-center rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft transition-colors"
          >
            <ExternalLink size={14} />
            SM Folder
          </a>
        )}
      </div>

      {/* ── Full-width content ──────────────────────────────────────── */}
      <div className="flex flex-col gap-6 min-w-0">
          <ReadCard title="Client">
            <InfoGrid
              rows={[
                ["Company", inquiry.companyName],
                ["Export", inquiry.export === null ? null : inquiry.export ? "Yes" : "No"],
                ["Currency", inquiry.currency],
                ["Country", inquiry.country],
                ["State", inquiry.state],
                ["City", inquiry.city],
                [
                  "Address",
                  [
                    inquiry.addressLine1,
                    inquiry.addressLine2,
                    inquiry.addressLine3,
                    inquiry.addressLine4,
                  ]
                    .filter(Boolean)
                    .join(", ") || null,
                ],
                ["Pin Code", inquiry.pinCode],
                [
                  "Contact",
                  [inquiry.contactFirstName, inquiry.contactLastName].filter(Boolean).join(" ") ||
                    null,
                ],
                ["Contact No", inquiry.contactNo],
                ["Email", inquiry.contactEmail],
                ["CC Emails", inquiry.ccEmails],
              ]}
            />
          </ReadCard>

          <ReadCard title="Checklist & Products">
            <div className="flex flex-col gap-4">
              <p className="text-[14px] leading-relaxed text-ink-strong whitespace-pre-wrap">
                {inquiry.productDescription}
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["Quantity", inquiry.quantityStatus],
                    ["Shape & Dim", inquiry.shapeDimensionCheck],
                    ["Grade", inquiry.gradeCheck],
                    ["Tolerance", inquiry.toleranceCheck],
                    ["Condition", inquiry.conditionCheck],
                  ] as const
                ).map(([label, state]) =>
                  state ? (
                    <span key={label} className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
                      {label}: <Chip label={CHECK_STATE_LABELS[state]} tone={CHECK_TONES[state]} />
                    </span>
                  ) : null,
                )}
              </div>
              <InfoGrid
                rows={[
                  ["Docs Given", inquiry.docsGiven?.length ? inquiry.docsGiven.join(", ") : null],
                  [
                    "Sample Received",
                    inquiry.sampleReceived === null ? null : inquiry.sampleReceived ? "Yes" : "No",
                  ],
                  ["Enquiry Notes", inquiry.enquiryNotes],
                ]}
              />

              {/* ── Per-product list ──────────────────────────────────── */}
              {products.length > 0 ? (
                <div className="flex flex-col gap-4 mt-2">
                  {products.map((p, idx) => (
                    <div
                      key={p.id}
                      className="rounded-section border border-hairline bg-surface-soft p-4"
                    >
                      <p className="mb-3 text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
                        Product {idx + 1}
                        {p.custProductName ? (
                          <span className="ml-2 normal-case text-ink-muted font-semibold">
                            — {p.custProductName}
                          </span>
                        ) : null}
                      </p>
                      <InfoGrid
                        rows={[
                          ["Product Name", p.custProductName],
                          ["Drawing No", p.custDrawingNo],
                          ["Drawing Rev", p.drawingRevisionNo],
                          ["Shape", p.shape],
                          ["Dimensions", composeDimensions(p)],
                          ["Dimension Notes", p.dimensionNotes],
                          ["Grade (Internal)", p.gradeName],
                          ["Tolerance", p.toleranceName],
                          ["Condition", p.conditionName],
                          [
                            "Quantity",
                            p.quantityNos ? `${p.quantityNos} ${p.quantityUom}` : null,
                          ],
                        ]}
                      />
                      {/* Item Code row */}
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-[12px] font-bold text-ink-subtle">Item Code</span>
                        {p.itemCode ? (
                          <span className="font-mono text-[13px] font-semibold text-ink-strong">
                            {p.itemCode}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={generatingId === p.id}
                            onClick={() => handleGenerateItem(p.id)}
                            className="inline-flex items-center rounded-pill border border-hairline px-3 py-1 text-[12px] font-bold text-ink-muted hover:bg-surface-card hover:text-ink-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {generatingId === p.id ? "Generating…" : "Generate item code"}
                          </button>
                        )}
                      </div>
                      {/* Costing row */}
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-[12px] font-bold text-ink-subtle">Costing</span>
                        {p.costingFinalCost ? (
                          <span className="font-mono text-[13px] font-semibold text-ink-strong">
                            Final Cost ₹{p.costingFinalCost}
                          </span>
                        ) : (
                          <span className="text-[13px] text-ink-muted">Not costed</span>
                        )}
                        {p.costingDoneStatus && (
                          <Chip
                            label={COSTING_DONE_STATUS_LABELS[p.costingDoneStatus]}
                            tone={COSTING_DONE_STATUS_COLORS[p.costingDoneStatus]}
                          />
                        )}
                        <Link
                          href={`/costings/new?inquiryItemId=${p.id}&inquiryId=${inquiry.id}` as Route}
                          className="inline-flex items-center rounded-pill border border-hairline px-3 py-1 text-[12px] font-bold text-ink-muted hover:bg-surface-card hover:text-ink-strong transition-colors"
                        >
                          Cost this product
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Fallback: pre-Phase-A single-product block */
                <InfoGrid
                  rows={[
                    [
                      "Quantity",
                      inquiry.quantityNos ? `${inquiry.quantityNos} ${inquiry.quantityUom}` : null,
                    ],
                    ["Shape", inquiry.shape],
                    ["Outer Dia", inquiry.outerDia],
                    ["Inner Dia", inquiry.innerDia],
                    ["Length", inquiry.length],
                    ["Width", inquiry.width],
                    ["Thickness", inquiry.thickness],
                    ["Dimension Notes", inquiry.dimensionNotes],
                    ["Grade (Internal)", masterNames.grade],
                    ["Tolerance", masterNames.tolerance],
                    ["Condition", masterNames.condition],
                  ]}
                />
              )}
            </div>
          </ReadCard>

          <FeasibilityPanel inquiry={inquiry} employees={employees} />
      </div>
    </div>
  );
}

/* ── Local helpers ───────────────────────────────────────────────────── */

/** Compose present dimension fields into a compact string like "OD 12 · ID 8 · L 100". */
function composeDimensions(
  p: Pick<InquiryItem, "outerDia" | "innerDia" | "length" | "width" | "thickness">,
): string | null {
  const parts: string[] = [];
  if (p.outerDia) parts.push(`OD ${p.outerDia}`);
  if (p.innerDia) parts.push(`ID ${p.innerDia}`);
  if (p.length) parts.push(`L ${p.length}`);
  if (p.width) parts.push(`W ${p.width}`);
  if (p.thickness) parts.push(`T ${p.thickness}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* ── Local read-only building blocks ─────────────────────────────────── */

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

/** Label/value grid that silently skips empty rows. */
function InfoGrid({ rows }: { rows: ReadonlyArray<readonly [string, string | null | undefined]> }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (visible.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visible.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-[12px] font-bold text-ink-subtle">{label}</dt>
          <dd className="text-[14px] text-ink-strong break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One label-over-value cell in the top meta strip. */
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong">{value}</span>
    </div>
  );
}

/**
 * Lightweight header kebab popover — absolute-positioned card that closes on
 * outside-click and Escape. Edit / Archive always; Delete is admin-only.
 */
function KebabMenu({
  inquiryId,
  isAdmin,
  busy,
  onArchive,
  onDelete,
}: {
  inquiryId: string;
  isAdmin: boolean;
  busy: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft transition-colors disabled:opacity-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-hairline text-ink-muted hover:bg-surface-soft hover:text-ink-strong transition-colors"
      >
        <MoreVertical size={16} strokeWidth={2.4} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-section border border-hairline bg-surface-card py-1.5 shadow-lg"
        >
          <Link
            href={`/inquiries/${inquiryId}/edit` as Route}
            role="menuitem"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <Pencil size={15} strokeWidth={2.2} />
            Edit
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
            className={itemClass}
          >
            <Archive size={15} strokeWidth={2.2} />
            Archive
          </button>
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold transition-colors hover:bg-surface-soft disabled:opacity-50"
              style={{ color: "var(--color-red-deep)" }}
            >
              <Trash2 size={15} strokeWidth={2.2} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
