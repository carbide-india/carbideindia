import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getInquiryById, getInquiryItems } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listMasterOptions } from "@/lib/queries/masters";
import { InquiryDetail } from "@/components/inquiries/inquiry-detail";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Enquiry — Carbide India" };
  const inquiry = await getInquiryById(id);
  return {
    title: inquiry
      ? `${inquiry.smNumber} · ${inquiry.companyName} — Carbide India`
      : "Enquiry — Carbide India",
  };
}

export default async function InquiryDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const inquiry = await getInquiryById(id);
  if (!inquiry) notFound();

  const [employees, grades, tolerances, conditions, items] = await Promise.all([
    listEmployeeOptions(),
    listMasterOptions("internal_grade"),
    listMasterOptions("tolerance"),
    listMasterOptions("condition"),
    getInquiryItems(id),
  ]);

  // Resolve master ids → display names server-side; the detail view is
  // read-only for these, so names are all it needs.
  const masterNames = {
    grade: grades.find((g) => g.id === inquiry.gradeId)?.name ?? null,
    tolerance: tolerances.find((t) => t.id === inquiry.toleranceId)?.name ?? null,
    condition: conditions.find((c) => c.id === inquiry.conditionId)?.name ?? null,
  };

  const products = items.map((it) => ({
    ...it,
    gradeName: grades.find((g) => g.id === it.gradeId)?.name ?? null,
    toleranceName: tolerances.find((t) => t.id === it.toleranceId)?.name ?? null,
    conditionName: conditions.find((c) => c.id === it.conditionId)?.name ?? null,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <InquiryDetail inquiry={inquiry} employees={employees} masterNames={masterNames} products={products} />
    </main>
  );
}
