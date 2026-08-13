import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { canApprove } from "@/lib/approval/gate";
import { getInquiryWorkspaceHeader, getInquiryProducts } from "@/lib/queries/sm-workspace";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { INQUIRY_PRIORITY_LABELS } from "@/db/enums";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import { FeasibilityEnquirySnapshot } from "@/components/feasibility/feasibility-enquiry-snapshot";
import { FeasibilityReviewWorkspace } from "@/components/feasibility/feasibility-review-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Primary Feasibility Review - Carbide India",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Primary Feasibility review — the 5-check DFM sign-off ONLY. The detailed
 * technical-spec stage (Secondary / Technical Feasibility) + the Lock/baseline
 * live in their own module at /secondary-feasibility/[id], reached from the
 * Secondary Feasibility queue (and the cross-link below).
 */
export default async function FeasibilityReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [header, products, inquiry, employees] = await Promise.all([
    getInquiryWorkspaceHeader(id),
    getInquiryProducts(id),
    getInquiryById(id),
    listEmployeeOptions(),
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
          Primary Queue
        </Link>
        {/* Compact back link for narrow screens (absolute button would overlap). */}
        <Link
          href={"/feasibility" as Route}
          className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-subtle transition-colors hover:text-brand lg:hidden"
        >
          <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2.6} /> Primary Queue
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
          <span className="font-mono text-[24px] font-black leading-none text-[#3f3f94]">{header.smNumber}</span>
          <Chip label={INQUIRY_PRIORITY_LABELS[header.priority]} tone={PRIORITY_TONES[header.priority]} />
          <span className="text-[22px] font-black leading-none tracking-tight text-ink-strong">
            {header.clientName}
          </span>
          <span className="rounded-full bg-[#ececf7] px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#3f3f94]">
            Primary
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
          {/* Cross-link to the separate Secondary / Technical Feasibility review. */}
          <Link
            href={`/secondary-feasibility/${id}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c7cae6] px-2.5 py-1 text-[12px] font-bold text-[#3f3f94] transition-colors hover:border-brand hover:bg-[#f3f3fb]"
          >
            <FlaskConical className="h-[13px] w-[13px]" strokeWidth={2.4} /> Secondary Review
          </Link>
        </div>
      </header>

      {/* Auto-fetched enquiry snapshot (read-only) — exactly the sheet's fields. */}
      <div className="mb-5">
        <FeasibilityEnquirySnapshot inquiry={inquiry} product={products[0] ?? null} />
      </div>

      <FeasibilityReviewWorkspace
        inquiry={inquiry}
        employees={employees}
        canApprove={canApprove(me)}
      />
    </div>
  );
}
