import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getNegotiationById, getNegotiationItems } from "@/lib/queries/negotiations";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getInquiryItemSeeds } from "@/lib/queries/quotes";
import { getQuotationById } from "@/lib/queries/quotations";
import { listProformaInvoicesForNegotiation } from "@/lib/queries/proforma-invoices";
import { getDocumentDownloadUrls } from "@/lib/storage/blob";
import {
  NegotiationDetail,
  type NegotiationInquiryLink,
} from "@/components/negotiations/negotiation-detail";
import type { QuoteSendSummary } from "@/components/negotiations/quote-send-header";
import { SyncProductsBanner } from "@/components/pipeline/sync-products-banner";
import { syncProductsFromEnquiry } from "@/app/(app)/negotiations/actions";
import { WorkflowStepper } from "@/components/workflow/workflow-stepper";
import { stageIndex } from "@/lib/flow/derive-stage";
import { isWorkflowFlagOn } from "@/lib/workflow/flags";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Negotiation - Carbide India" };
  const negotiation = await getNegotiationById(id);
  return {
    title: negotiation
      ? `${negotiation.negotiationNo} · Negotiation - Carbide India`
      : "Negotiation - Carbide India",
  };
}

export default async function NegotiationDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const negotiation = await getNegotiationById(id);
  if (!negotiation) notFound();

  // The linked enquiry (SM repo) supplies the header SM chip + number, and the
  // seed list lets us flag products added to the enquiry after this negotiation.
  // The linked quotation drives the Quote Send anchor; the PI list feeds the
  // iteration history + the customer-PO reconciliation.
  const [employees, inquiry, lines, seeds, quotation, proformaInvoices] = await Promise.all([
    listEmployeeOptions(),
    negotiation.inquiryId
      ? getInquiryById(negotiation.inquiryId)
      : Promise.resolve(null),
    getNegotiationItems(negotiation.id),
    negotiation.inquiryId
      ? getInquiryItemSeeds(negotiation.inquiryId)
      : Promise.resolve([]),
    negotiation.quotationId
      ? getQuotationById(negotiation.quotationId)
      : Promise.resolve(null),
    listProformaInvoicesForNegotiation(negotiation.id),
  ]);

  // Quote Send summary — the source quote's identity, falling back to the
  // negotiation's own snapshotted price/link when there is no linked quote.
  const quoteSend: QuoteSendSummary = {
    quoteNo: quotation?.quoteNo ?? null,
    quotePrice: quotation?.quotePrice ?? negotiation.quotePrice ?? null,
    quotationLink: quotation?.quotationLink ?? negotiation.quotationLink ?? null,
    quoteSent: quotation?.quoteSent ?? false,
  };

  // Latest PI total (list is newest-iteration first) for PI↔PO reconciliation.
  const latestPiTotal = proformaInvoices[0]?.revisedTotal ?? null;

  // Presign the stored customer-PO document pathname for a working "view" link.
  let poDownloadUrl: string | null = null;
  if (negotiation.customerPoLink) {
    try {
      const urls = await getDocumentDownloadUrls([negotiation.customerPoLink]);
      poDownloadUrl = urls.get(negotiation.customerPoLink) ?? null;
    } catch {
      poDownloadUrl = null;
    }
  }

  const inquiryLink: NegotiationInquiryLink | null = inquiry
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

  // Phase 8 - pipeline stepper + flag-gated "Mark Won" CTA. Won ⇒ show SO stage.
  const negotiationFlagOn = await isWorkflowFlagOn("negotiation");
  const isWon = negotiation.negotiationStatus === "order_won";
  const negStageKey = isWon ? ("sales_order" as const) : ("negotiation" as const);
  const resolvedStage = { stage: negStageKey, index: stageIndex(negStageKey) };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <WorkflowStepper
        resolved={resolvedStage}
        flagOn={negotiationFlagOn && !isWon}
        advance={{ entity: "negotiation", id: negotiation.id, label: "Mark Won" }}
      />
      <SyncProductsBanner
        missingCount={missingCount}
        recordId={negotiation.id}
        recordLabel="negotiation"
        syncAction={syncProductsFromEnquiry}
      />
      <NegotiationDetail
        negotiation={negotiation}
        employees={employees}
        inquiryLink={inquiryLink}
        lines={lines}
        quoteSend={quoteSend}
        proformaInvoices={proformaInvoices}
        latestPiTotal={latestPiTotal}
        poDownloadUrl={poDownloadUrl}
      />
    </main>
  );
}
