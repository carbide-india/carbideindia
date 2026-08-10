import * as React from "react";
import { CHECK_STATE_LABELS, type CheckState } from "@/db/enums";
import { formatDate } from "@/lib/format";
import type { Inquiry } from "@/db/schema";

/**
 * Presentational atoms + the read-only bands shared by the two enquiry-snapshot
 * panels: the Primary review's fully read-only `FeasibilityEnquirySnapshot` and
 * the Secondary review's `SecondaryProductDetailsPanel`, which swaps the Product
 * & Quantity and Dimensions & Specification bands for editable ones. Everything
 * here is pure markup (no server-only imports) so the client panel can use it.
 */

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return formatDate(date);
}

export const dash = (v: React.ReactNode): React.ReactNode =>
  v == null || v === "" ? <span className="text-[#b3b8c2]">-</span> : v;

export const dim = (v: string | number | null | undefined): React.ReactNode =>
  v ? `${v} mm` : <span className="text-[#b3b8c2]">-</span>;

export const check = (v: string | null | undefined): React.ReactNode =>
  v ? CHECK_STATE_LABELS[v as CheckState] ?? v : <span className="text-[#b3b8c2]">-</span>;

/** The 4-up cell grid used by the read-only bands. */
export const GRID_CLASS =
  "grid grid-cols-2 divide-x divide-y divide-[#c6cbdd] sm:grid-cols-3 lg:grid-cols-4";

/** One label/value cell. */
export function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">{label}</span>
      <span className="text-[15.5px] font-bold leading-snug text-[#14151a]">{value}</span>
    </div>
  );
}

/** A titled section band - prominent indigo accent + larger heading. */
export function Band({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-y-2 border-[#d6d9ea] bg-[#e7e9f6] px-4 py-2.5">
      <span className="h-4 w-1.5 shrink-0 rounded-full bg-[#3f3f94]" />
      <span className="text-[13.5px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">
        {title}
      </span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/* ── Read-only bands shared by both panels ─────────────────────────────────── */

export function EnquiryCustomerBand({ inquiry }: { inquiry: Inquiry }) {
  return (
    <>
      <Band title="Enquiry & Customer" />
      <div className={GRID_CLASS}>
        <Cell label="Enquiry Date" value={fmtDate(inquiry.enquiryDate)} />
        <Cell label="SM Number" value={dash(inquiry.smNumber)} />
        <Cell label="Company Name" value={dash(inquiry.companyName)} />
        <Cell label="Customer First Name" value={dash(inquiry.contactFirstName)} />
        <Cell label="Customer Last Name" value={dash(inquiry.contactLastName)} />
        <Cell label="Contact No" value={dash(inquiry.contactNo)} />
        <Cell label="Country Name" value={dash(inquiry.country)} />
      </div>
    </>
  );
}

export function EnquiryChecksBand({ inquiry }: { inquiry: Inquiry }) {
  return (
    <>
      <Band title="Enquiry Checks (from the enquiry form)" />
      <div className={GRID_CLASS}>
        <Cell label="Shape & Dimension Check" value={check(inquiry.shapeDimensionCheck)} />
        <Cell label="Grade (Customer) Check" value={check(inquiry.gradeCheck)} />
        <Cell label="Tolerance Check" value={check(inquiry.toleranceCheck)} />
        <Cell label="Condition Check" value={check(inquiry.conditionCheck)} />
      </div>
    </>
  );
}

export function LinksNotesBand({ inquiry }: { inquiry: Inquiry }) {
  return (
    <>
      <Band title="Links & Notes" />
      <div className={GRID_CLASS}>
        <div className="col-span-full sm:col-span-2 lg:col-span-2">
          <Cell
            label="SM Folder Link"
            value={
              inquiry.smFolderLink ? (
                <a
                  href={inquiry.smFolderLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-semibold text-[#3f3f94] hover:underline"
                >
                  {inquiry.smFolderLink}
                </a>
              ) : (
                dash(null)
              )
            }
          />
        </div>
        <div className="col-span-full sm:col-span-3 lg:col-span-2">
          <Cell label="Enquiry Notes" value={dash(inquiry.enquiryNotes)} />
        </div>
      </div>
    </>
  );
}
