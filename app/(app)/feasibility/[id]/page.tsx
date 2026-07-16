import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { getFeasibilityScorecard } from "@/lib/queries/feasibility";
import { getInquiryWorkspaceHeader, getInquiryProducts } from "@/lib/queries/sm-workspace";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { INQUIRY_PRIORITY_LABELS } from "@/db/enums";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import { ProductFeasibilityContext } from "@/components/inquiries/feasibility-context";
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

  const [scorecard, header, products, inquiry, employees, me] = await Promise.all([
    getFeasibilityScorecard(id),
    getInquiryWorkspaceHeader(id),
    getInquiryProducts(id),
    getInquiryById(id),
    listEmployeeOptions(),
    getCurrentEmployee(),
  ]);
  if (!header) notFound();

  const isAdmin = me?.isAdmin ?? false;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <Link
        href={"/feasibility" as Route}
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle transition-colors hover:text-brand"
      >
        <ArrowLeft className="h-[15px] w-[15px]" /> Feasibility Queue
      </Link>

      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-section border border-hairline bg-surface-card px-5 py-4">
        <span className="font-mono text-[18px] font-black text-[#3f3f94]">{header.smNumber}</span>
        <Chip label={INQUIRY_PRIORITY_LABELS[header.priority]} tone={PRIORITY_TONES[header.priority]} />
        <span className="text-[15px] font-semibold text-ink-strong">{header.clientName}</span>
        <span className="text-[13px] text-ink-subtle">
          {header.productCount} product{header.productCount === 1 ? "" : "s"}
          {header.salesPersonName ? ` · ${header.salesPersonName}` : ""}
        </span>
      </header>

      {/* Product spec context — collapsible so the scorecard stays the focus. */}
      {inquiry && products.length > 0 && (
        <details open className="group mb-5 rounded-section border border-hairline bg-surface-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-[12px] font-black uppercase tracking-[0.12em] text-[#3f3f94]">
            <span className="grid size-5 place-items-center rounded-md bg-[#efeffb] text-[#3f3f94] transition-transform group-open:rotate-90">
              <ArrowLeft className="h-[13px] w-[13px] rotate-180" />
            </span>
            Product Details
            <span className="font-sans text-[12px] font-medium normal-case tracking-normal text-ink-subtle">
              — {products.length} product{products.length === 1 ? "" : "s"} on this enquiry
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-hairline px-5 py-4">
            {products.map((p, i) => (
              <div key={p.id} className="flex flex-col gap-2">
                {products.length > 1 && (
                  <span className="text-[12px] font-bold text-ink-strong">
                    Product {i + 1}
                    {p.custProductName ? ` · ${p.custProductName}` : ""}
                  </span>
                )}
                <ProductFeasibilityContext product={p} inquiry={inquiry} />
              </div>
            ))}
          </div>
        </details>
      )}

      <FeasibilityReviewWorkspace
        inquiryId={header.id}
        dimensions={scorecard.dimensions}
        scores={scorecard.scores}
        review={scorecard.review}
        employees={employees}
        isAdmin={isAdmin}
      />
    </div>
  );
}
