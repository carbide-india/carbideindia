import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getNegotiationById } from "@/lib/queries/negotiations";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import {
  NegotiationDetail,
  type NegotiationInquiryLink,
} from "@/components/negotiations/negotiation-detail";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Negotiation — Carbide India" };
  const negotiation = await getNegotiationById(id);
  return {
    title: negotiation
      ? `${negotiation.negotiationNo} · Negotiation — Carbide India`
      : "Negotiation — Carbide India",
  };
}

export default async function NegotiationDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const negotiation = await getNegotiationById(id);
  if (!negotiation) notFound();

  // The linked enquiry (SM repo) supplies the header SM chip + number.
  const [employees, inquiry] = await Promise.all([
    listEmployeeOptions(),
    negotiation.inquiryId
      ? getInquiryById(negotiation.inquiryId)
      : Promise.resolve(null),
  ]);

  const inquiryLink: NegotiationInquiryLink | null = inquiry
    ? {
        id: inquiry.id,
        smNumber: inquiry.smNumber,
        companyName: inquiry.companyName,
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <NegotiationDetail
        negotiation={negotiation}
        employees={employees}
        inquiryLink={inquiryLink}
      />
    </main>
  );
}
