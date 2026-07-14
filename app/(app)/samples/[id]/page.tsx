import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getSampleById } from "@/lib/queries/samples";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import {
  SampleDetail,
  type SampleInquiryLink,
} from "@/components/samples/sample-detail";
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
  if (!UUID_RE.test(id)) return { title: "Sample - Carbide India" };
  const sample = await getSampleById(id);
  return {
    title: sample
      ? `${sample.sampleNo} · Sample - Carbide India`
      : "Sample - Carbide India",
  };
}

export default async function SampleDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const sample = await getSampleById(id);
  if (!sample) notFound();

  // The linked enquiry (SM repo) for the header link - getInquiryById is the
  // simple correct thing here; one extra round-trip on one detail page.
  const [employees, inquiry] = await Promise.all([
    listEmployeeOptions(),
    sample.inquiryId ? getInquiryById(sample.inquiryId) : Promise.resolve(null),
  ]);

  const inquiryLink: SampleInquiryLink | null = inquiry
    ? {
        id: inquiry.id,
        smNumber: inquiry.smNumber,
        companyName: inquiry.companyName,
      }
    : null;

  return (
    <EnquiryModuleShell title="Sample Register" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1400px]">
        <SampleDetail sample={sample} employees={employees} inquiryLink={inquiryLink} />
      </div>
    </EnquiryModuleShell>
  );
}
