import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { getInquiryWorkspaceHeader, getInquiryProducts } from "@/lib/queries/sm-workspace";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import {
  listItemLockStates,
  getInquiryVarianceRows,
  listSecondaryFeasibilityStates,
} from "@/lib/queries/feasibility";
import { listMasterOptions } from "@/lib/queries/masters";
import { INQUIRY_PRIORITY_LABELS } from "@/db/enums";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import { FeasibilityEnquirySnapshot } from "@/components/feasibility/feasibility-enquiry-snapshot";
import { FeasibilityReviewWorkspace } from "@/components/feasibility/feasibility-review-workspace";
import { LockDimensionsControl } from "@/components/feasibility/lock-dimensions-control";
import { SecondaryFeasibilitySection } from "@/components/feasibility/secondary-feasibility-section";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feasibility Review - Carbide India",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FeasibilityReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [
    header,
    products,
    inquiry,
    employees,
    lockStates,
    varianceByItem,
    secondaryStates,
    gradeOptions,
    conditionOptions,
  ] = await Promise.all([
    getInquiryWorkspaceHeader(id),
    getInquiryProducts(id),
    getInquiryById(id),
    listEmployeeOptions(),
    listItemLockStates(id),
    getInquiryVarianceRows(id),
    listSecondaryFeasibilityStates(id),
    listMasterOptions("internal_grade"),
    listMasterOptions("condition"),
  ]);
  if (!header || !inquiry) notFound();

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <header
        className="relative mb-5 rounded-section border-2 border-[#2b303b] bg-surface-card px-6 py-4"
        style={{ boxShadow: "0 6px 20px -10px rgba(15,23,42,0.22)" }}
      >
        {/* Back to queue - lives inside the header, in the empty left gutter, so
            it wastes no vertical space and keeps the identity centered. */}
        <Link
          href={"/feasibility" as Route}
          className="group absolute left-5 top-1/2 hidden -translate-y-1/2 items-center gap-2 rounded-xl border-2 border-[#c7cae6] bg-surface-card px-[18px] py-2.5 text-[14.5px] font-extrabold text-ink-soft shadow-sm transition-all hover:-translate-y-1/2 hover:border-brand hover:text-brand hover:shadow-md lg:inline-flex"
        >
          <ArrowLeft
            className="h-[18px] w-[18px] transition-transform group-hover:-translate-x-0.5"
            strokeWidth={2.6}
          />
          Feasibility Queue
        </Link>
        {/* Compact back link for narrow screens (absolute button would overlap). */}
        <Link
          href={"/feasibility" as Route}
          className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-subtle transition-colors hover:text-brand lg:hidden"
        >
          <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2.6} /> Feasibility Queue
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
          <span className="font-mono text-[24px] font-black leading-none text-[#3f3f94]">{header.smNumber}</span>
          <Chip label={INQUIRY_PRIORITY_LABELS[header.priority]} tone={PRIORITY_TONES[header.priority]} />
          <span className="text-[22px] font-black leading-none tracking-tight text-ink-strong">
            {header.clientName}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center text-[13.5px] font-medium text-ink-soft">
          {inquiry.productDescription && (
            <span className="font-bold text-ink-strong">{inquiry.productDescription}</span>
          )}
          <span className="text-ink-subtle">
            {header.productCount} product{header.productCount === 1 ? "" : "s"}
          </span>
          {inquiry.country && <span className="text-ink-subtle">· {inquiry.country}</span>}
          {header.salesPersonName && <span className="text-ink-subtle">· {header.salesPersonName}</span>}
        </div>
      </header>

      {/* Auto-fetched enquiry snapshot (read-only) — exactly the sheet's fields. */}
      <div className="mb-5">
        <FeasibilityEnquirySnapshot inquiry={inquiry} product={products[0] ?? null} />
      </div>

      {/* ── Lock Dimensions & Specifications (Form 04 → Form 05 gate) ──────── */}
      {lockStates.length > 0 && (
        <section
          className="mb-5 overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card"
        >
          <div className="flex flex-wrap items-center gap-2.5 border-b-2 border-[#d6d9ea] bg-[#e7e9f6] px-4 py-2.5">
            <span className="h-4 w-1.5 shrink-0 rounded-full bg-[#3f3f94]" />
            <span className="text-[13.5px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">
              Lock Dimensions &amp; Specifications
            </span>
            <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle">
              Costing consumes the frozen baseline per locked line.
            </span>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {lockStates.map((line, i) => (
              <LockDimensionsControl
                key={line.inquiryItemId}
                line={line}
                lineNumber={i + 1}
                isAdmin={me.isAdmin}
                varianceRows={varianceByItem[line.inquiryItemId] ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Secondary / Technical Feasibility (Primary → Confirm) ─────────── */}
      {secondaryStates.length > 0 && (
        <section className="mb-5 overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
          <div className="flex flex-wrap items-center gap-2.5 border-b-2 border-[#d6d9ea] bg-[#e7e9f6] px-4 py-2.5">
            <span className="h-4 w-1.5 shrink-0 rounded-full bg-[#3f3f94]" />
            <span className="text-[13.5px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">
              Secondary / Technical Feasibility
            </span>
            <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle">
              Detailed technical spec per line — required before Confirm.
            </span>
          </div>
          <div className="flex flex-col gap-4 p-4">
            {secondaryStates.map((line, i) => (
              <SecondaryFeasibilitySection
                key={line.inquiryItemId}
                line={line}
                lineNumber={i + 1}
                gradeOptions={gradeOptions}
                conditionOptions={conditionOptions}
              />
            ))}
          </div>
        </section>
      )}

      <FeasibilityReviewWorkspace inquiry={inquiry} employees={employees} />
    </div>
  );
}
