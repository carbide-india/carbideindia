import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getQuotationById } from "@/lib/queries/quotations";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getQuotationItems, getInquiryItemSeeds } from "@/lib/queries/quotes";
import {
  QuotationDetail,
  type QuotationInquiryLink,
} from "@/components/quotations/quotation-detail";
import { SyncProductsBanner } from "@/components/pipeline/sync-products-banner";
import { syncProductsFromEnquiry } from "@/app/(app)/quotations/actions";
import { WorkflowStepper } from "@/components/workflow/workflow-stepper";
import { itemFurthestStage, stageIndex } from "@/lib/flow/derive-stage";
import { isWorkflowFlagOn } from "@/lib/workflow/flags";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Quotation — Carbide India" };
  const quotation = await getQuotationById(id);
  return {
    title: quotation
      ? `${quotation.quoteNo} · Quotation — Carbide India`
      : "Quotation — Carbide India",
  };
}

export default async function QuotationDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const quotation = await getQuotationById(id);
  if (!quotation) notFound();

  // The linked enquiry (SM repo) supplies the header SM chip + number, and the
  // seed list lets us flag products added to the enquiry after this quote.
  const [employees, inquiry, lines, seeds] = await Promise.all([
    listEmployeeOptions(),
    quotation.inquiryId
      ? getInquiryById(quotation.inquiryId)
      : Promise.resolve(null),
    getQuotationItems(quotation.id),
    quotation.inquiryId
      ? getInquiryItemSeeds(quotation.inquiryId)
      : Promise.resolve([]),
  ]);

  const inquiryLink: QuotationInquiryLink | null = inquiry
    ? {
        id: inquiry.id,
        smNumber: inquiry.smNumber,
        companyName: inquiry.companyName,
      }
    : null;

  const presentIds = new Set(
    lines.map((l) => l.inquiryItemId).filter((v): v is string => v !== null),
  );
  const missingCount = seeds.filter((s) => !presentIds.has(s.inquiryItemId)).length;

  // Phase 8 — read-only pipeline stepper (safe even flag-off) + flag-gated CTA.
  const quotationFlagOn = await isWorkflowFlagOn("quotation");
  const resolvedStage = quotation.quoteSent
    ? { stage: "negotiation" as const, index: stageIndex("negotiation") }
    : itemFurthestStage({ quotationCount: 1 });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <WorkflowStepper
        resolved={resolvedStage}
        flagOn={quotationFlagOn && !quotation.quoteSent}
        advance={{ entity: "quotation", id: quotation.id, label: "Send Quote" }}
      />
      <SyncProductsBanner
        missingCount={missingCount}
        recordId={quotation.id}
        recordLabel="quotation"
        syncAction={syncProductsFromEnquiry}
      />
      <QuotationDetail
        quotation={quotation}
        employees={employees}
        inquiryLink={inquiryLink}
        lines={lines}
      />
    </main>
  );
}
