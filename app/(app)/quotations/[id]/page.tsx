import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getQuotationById } from "@/lib/queries/quotations";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getQuotationItems } from "@/lib/queries/quotes";
import {
  QuotationDetail,
  type QuotationInquiryLink,
} from "@/components/quotations/quotation-detail";

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

  // The linked enquiry (SM repo) supplies the header SM chip + number.
  const [employees, inquiry, lines] = await Promise.all([
    listEmployeeOptions(),
    quotation.inquiryId
      ? getInquiryById(quotation.inquiryId)
      : Promise.resolve(null),
    getQuotationItems(quotation.id),
  ]);

  const inquiryLink: QuotationInquiryLink | null = inquiry
    ? {
        id: inquiry.id,
        smNumber: inquiry.smNumber,
        companyName: inquiry.companyName,
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <QuotationDetail
        quotation={quotation}
        employees={employees}
        inquiryLink={inquiryLink}
        lines={lines}
      />
    </main>
  );
}
