"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import {
  CHECK_STATE_LABELS,
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_COLORS,
  INQUIRY_PRIORITY_LABELS,
  INQUIRY_SOURCE_LABELS,
  type CheckState,
} from "@/db/enums";
import type { Inquiry } from "@/db/schema";
import { setEnquiryStatus } from "@/app/(app)/inquiries/actions";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate } from "@/lib/format";
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

interface Props {
  inquiry: Inquiry;
  employees: EmployeeOption[];
  masterNames: MasterNames;
}

/**
 * The SM repo — everything about one inquiry on one page, status in the
 * sidebar (per the transcript: status lives beside the record, not inside
 * the form), Primary Feasibility below.
 */
export function InquiryDetail({ inquiry, employees, masterNames }: Props) {
  const salesPerson =
    employees.find((e) => e.id === inquiry.assignedSalesPersonId)?.name ?? null;
  const createdBy =
    employees.find((e) => e.id === inquiry.createdById)?.name ?? null;

  return (
    <div className="flex flex-col gap-6">
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
        <Chip
          label={INQUIRY_PRIORITY_LABELS[inquiry.priority]}
          tone={PRIORITY_TONES[inquiry.priority]}
        />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] items-start">
        {/* ── Main column ─────────────────────────────────────────────── */}
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

          <ReadCard title="Product & Checklist">
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
                  [
                    "Quantity",
                    inquiry.quantityNos ? `${inquiry.quantityNos} ${inquiry.quantityUom}` : null,
                  ],
                  ["Docs Given", inquiry.docsGiven?.length ? inquiry.docsGiven.join(", ") : null],
                  [
                    "Sample Received",
                    inquiry.sampleReceived === null ? null : inquiry.sampleReceived ? "Yes" : "No",
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
                  ["Enquiry Notes", inquiry.enquiryNotes],
                ]}
              />
            </div>
          </ReadCard>

          <FeasibilityPanel inquiry={inquiry} employees={employees} />
        </div>

        {/* ── Sticky sidebar — the transcript's "task sidebar" ─────────── */}
        <aside className="lg:sticky lg:top-24 flex flex-col gap-4 rounded-section border border-hairline bg-surface-card p-5">
          <div className="flex flex-col gap-2">
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
          <SidebarRow label="Sales Person" value={salesPerson ?? "Not allocated"} />
          <SidebarRow label="Created" value={formatDate(inquiry.createdAt)} />
          {createdBy && <SidebarRow label="Created By" value={createdBy} />}
          <SidebarRow label="Last Updated" value={formatDate(inquiry.updatedAt)} />
          {inquiry.smFolderLink && (
            <a
              href={inquiry.smFolderLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft transition-colors"
            >
              <ExternalLink size={14} />
              SM Folder
            </a>
          )}
        </aside>
      </div>
    </div>
  );
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

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong">{value}</span>
    </div>
  );
}
