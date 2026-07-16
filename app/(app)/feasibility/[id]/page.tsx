import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { getInquiryWorkspaceHeader, getInquiryProducts } from "@/lib/queries/sm-workspace";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { INQUIRY_PRIORITY_LABELS } from "@/db/enums";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import { FeasibilityEnquirySnapshot } from "@/components/feasibility/feasibility-enquiry-snapshot";
import { FeasibilityReviewWorkspace } from "@/components/feasibility/feasibility-review-workspace";

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
  await requireUser();
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
      <Link
        href={"/feasibility" as Route}
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle transition-colors hover:text-brand"
      >
        <ArrowLeft className="h-[15px] w-[15px]" /> Feasibility Queue
      </Link>

      <header
        className="mb-5 rounded-section border-2 border-[#2b303b] bg-surface-card px-6 py-4"
        style={{ boxShadow: "0 6px 20px -10px rgba(15,23,42,0.22)" }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-mono text-[24px] font-black leading-none text-[#3f3f94]">{header.smNumber}</span>
          <Chip label={INQUIRY_PRIORITY_LABELS[header.priority]} tone={PRIORITY_TONES[header.priority]} />
          <span className="text-[22px] font-black leading-none tracking-tight text-ink-strong">
            {header.clientName}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] font-medium text-ink-soft">
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

      <FeasibilityReviewWorkspace inquiry={inquiry} employees={employees} />
    </div>
  );
}
