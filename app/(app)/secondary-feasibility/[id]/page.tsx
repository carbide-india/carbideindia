import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { canApprove } from "@/lib/approval/gate";
import { getInquiryWorkspaceHeader, getInquiryProducts } from "@/lib/queries/sm-workspace";
import { getInquiryById } from "@/lib/queries/inquiries";
import { getFreezeState } from "@/lib/queries/pipeline-tracker";
import { ApproverBar } from "@/components/pipeline/approver-bar";
import {
  listItemLockStates,
  getInquiryVarianceRows,
  listSecondaryFeasibilityStates,
} from "@/lib/queries/feasibility";
import { getShapeProfiles, listMasterOptions } from "@/lib/queries/masters";
import { INQUIRY_PRIORITY_LABELS } from "@/db/enums";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import { SecondaryProductDetailsPanel } from "@/components/feasibility/secondary-product-details-panel";
import { LockDimensionsControl } from "@/components/feasibility/lock-dimensions-control";
import { SecondaryFeasibilitySection } from "@/components/feasibility/secondary-feasibility-section";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Secondary Feasibility - Carbide India",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Secondary / Technical Feasibility review — its own module page, separate from
 * the Primary (5-check DFM) review. Reached from the Secondary Feasibility queue.
 * Holds the detailed technical-spec capture per line (dimensions + tolerances,
 * weights, grade/condition, manufacturability, verdict) plus the Lock/baseline +
 * variance. Marking Secondary done confirms the line (→ costable). The Primary
 * review lives in its own module at /feasibility/[id].
 */
export default async function SecondaryFeasibilityReviewPage({
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
    lockStates,
    varianceByItem,
    secondaryStates,
    gradeOptions,
    conditionOptions,
    toleranceOptions,
    shapeProfiles,
    freeze,
  ] = await Promise.all([
    getInquiryWorkspaceHeader(id),
    getInquiryProducts(id),
    getInquiryById(id),
    listItemLockStates(id),
    getInquiryVarianceRows(id),
    listSecondaryFeasibilityStates(id),
    listMasterOptions("internal_grade"),
    listMasterOptions("condition"),
    listMasterOptions("tolerance"),
    getShapeProfiles(),
    getFreezeState(id),
  ]);
  if (!header || !inquiry) notFound();

  // The editable spec band edits product line 1 — frozen once that line is
  // locked / confirmed (the PF baseline must not move under Costing).
  const firstLock = lockStates[0] ?? null;
  const specLocked = Boolean(firstLock?.isLocked || firstLock?.feasibilityConfirmed);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <header
        className="relative mb-5 rounded-section border-2 border-[#2b303b] bg-surface-card px-6 py-4"
        style={{ boxShadow: "0 6px 20px -10px rgba(15,23,42,0.22)" }}
      >
        <Link
          href={"/secondary-feasibility" as Route}
          className="group absolute left-5 top-1/2 hidden -translate-y-1/2 items-center gap-2 rounded-xl border-2 border-[#c7cae6] bg-surface-card px-[18px] py-2.5 text-[14.5px] font-extrabold text-ink-soft shadow-sm transition-all hover:-translate-y-1/2 hover:border-brand hover:text-brand hover:shadow-md lg:inline-flex"
        >
          <ArrowLeft className="h-[18px] w-[18px] transition-transform group-hover:-translate-x-0.5" strokeWidth={2.6} />
          Secondary Queue
        </Link>
        <Link
          href={"/secondary-feasibility" as Route}
          className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-subtle transition-colors hover:text-brand lg:hidden"
        >
          <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2.6} /> Secondary Queue
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
          <span className="font-mono text-[24px] font-black leading-none text-[#3f3f94]">{header.smNumber}</span>
          <Chip label={INQUIRY_PRIORITY_LABELS[header.priority]} tone={PRIORITY_TONES[header.priority]} />
          <span className="text-[22px] font-black leading-none tracking-tight text-ink-strong">
            {header.clientName}
          </span>
          <span className="rounded-full bg-[#ececf7] px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#3f3f94]">
            Secondary / Technical
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
          {/* Cross-link to the Primary review for the same SM. */}
          <Link
            href={`/feasibility/${id}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c7cae6] px-2.5 py-1 text-[12px] font-bold text-[#3f3f94] transition-colors hover:border-brand hover:bg-[#f3f3fb]"
          >
            <ClipboardList className="h-[13px] w-[13px]" strokeWidth={2.4} /> Primary Review
          </Link>
        </div>
      </header>

      {/* Approver decisions for this inquiry — right on the review page. */}
      {canApprove(me) && (
        <div className="mb-5">
          <ApproverBar inquiryId={id} stage="secondary" isApprover frozen={freeze} />
        </div>
      )}

      {/* Enquiry context — customer/checks/links read-only, but the two product
          bands are editable here so a reviewer can correct the spec in place. */}
      <div className="mb-5">
        <SecondaryProductDetailsPanel
          inquiry={inquiry}
          product={products[0] ?? null}
          line={secondaryStates[0] ?? null}
          lineCount={secondaryStates.length}
          specLocked={specLocked}
          toleranceOptions={toleranceOptions}
          shapeProfiles={shapeProfiles}
        />
      </div>

      {/* ── Secondary / Technical Feasibility (detailed spec → confirm) ─────── */}
      {secondaryStates.length > 0 ? (
        <section className="mb-5 overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
          <div className="flex flex-wrap items-center gap-2.5 border-b-2 border-[#d6d9ea] bg-[#e7e9f6] px-4 py-2.5">
            <span className="h-4 w-1.5 shrink-0 rounded-full bg-[#3f3f94]" />
            <span className="text-[13.5px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">
              Secondary / Technical Feasibility
            </span>
            <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle">
              Marking done confirms the line for costing.
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
      ) : (
        <p className="mb-5 rounded-section border-2 border-dashed border-[#c6cbdd] bg-white/60 px-6 py-8 text-center text-[13.5px] font-semibold text-ink-subtle">
          No product lines on this enquiry to review.
        </p>
      )}

      {/* ── Lock Dimensions & baseline (variance vs Costing) ───────────────── */}
      {lockStates.length > 0 && (
        <section className="mb-5 overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
          <div className="flex flex-wrap items-center gap-2.5 border-b-2 border-[#d6d9ea] bg-[#e7e9f6] px-4 py-2.5">
            <span className="h-4 w-1.5 shrink-0 rounded-full bg-[#3f3f94]" />
            <span className="text-[13.5px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">
              Locked Baseline &amp; Variance
            </span>
            <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle">
              Costing consumes the frozen baseline per confirmed line.
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
    </div>
  );
}
