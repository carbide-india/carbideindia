import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import {
  getQuotationById,
  getLatestCostingRevisionsForItems,
} from "@/lib/queries/quotations";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getQuotationItems, getInquiryItemSeeds } from "@/lib/queries/quotes";
import {
  QuotationDetail,
  type QuotationInquiryLink,
} from "@/components/quotations/quotation-detail";
import { SyncProductsBanner } from "@/components/pipeline/sync-products-banner";
import { syncProductsFromEnquiry } from "@/app/(app)/quotations/actions";
import { SendQuoteButton } from "@/components/quotations/send-quote-button";
import { ReviseButton } from "@/components/quotations/revise-buttons";
import { resolveRecipients } from "@/lib/email/quotation-recipients";
import { formatDateTime } from "@/lib/format";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Quotation - Carbide India" };
  const quotation = await getQuotationById(id);
  return {
    title: quotation
      ? `${quotation.quoteNo} · Quotation - Carbide India`
      : "Quotation - Carbide India",
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

  // Which costing REVISION each line's frozen cost basis came from, and whether
  // a newer one has since landed. Read here (not inside the line query, which
  // another workstream owns) and handed down as a plain serializable record.
  const revisionMap = await getLatestCostingRevisionsForItems([...presentIds]);
  const latestCostings = Object.fromEntries(revisionMap);

  // Resolve the send recipients SERVER-side so the preview shows exactly what
  // the send will use — a dialog that guesses would be worse than none.
  const { to, cc } = resolveRecipients({
    contactEmail: inquiry?.contactEmail,
    ccEmails: inquiry?.ccEmails,
  });

  return (
    <EnquiryModuleShell title="Quotation" userMenu={<UserMenuServer />}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ReviseButton
            kind="costing"
            quotationId={quotation.id}
            disabled={!quotation.isLatestRevision}
            disabledHint="This is a superseded revision — open the latest one."
          />
          <ReviseButton
            kind="quotation"
            quotationId={quotation.id}
            disabled={!quotation.isLatestRevision}
            disabledHint="This is a superseded revision — open the latest one."
          />
          <SendQuoteButton
            quotationId={quotation.id}
            quoteNo={quotation.quoteNo}
            approved={quotation.quotationStatus === "quotation_approved"}
            alreadySent={quotation.quoteSent}
            sentAt={quotation.quoteSentAt ? formatDateTime(quotation.quoteSentAt) : null}
            to={to}
            cc={cc}
          />
        </div>
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
          latestCostings={latestCostings}
        />
      </div>
    </EnquiryModuleShell>
  );
}
