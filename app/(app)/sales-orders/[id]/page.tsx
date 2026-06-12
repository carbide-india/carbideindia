import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getSalesOrderById } from "@/lib/queries/sales-orders";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import {
  SoDetail,
  type SalesOrderInquiryLink,
} from "@/components/sales-orders/so-detail";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Sales Order — Carbide India" };
  const salesOrder = await getSalesOrderById(id);
  return {
    title: salesOrder
      ? `${salesOrder.soNo} · Sales Order — Carbide India`
      : "Sales Order — Carbide India",
  };
}

export default async function SalesOrderDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const salesOrder = await getSalesOrderById(id);
  if (!salesOrder) notFound();

  // The linked enquiry (SM repo) supplies the header SM chip + number.
  const [employees, inquiry] = await Promise.all([
    listEmployeeOptions(),
    salesOrder.inquiryId
      ? getInquiryById(salesOrder.inquiryId)
      : Promise.resolve(null),
  ]);

  const inquiryLink: SalesOrderInquiryLink | null = inquiry
    ? {
        id: inquiry.id,
        smNumber: inquiry.smNumber,
        companyName: inquiry.companyName,
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <SoDetail
        salesOrder={salesOrder}
        employees={employees}
        inquiryLink={inquiryLink}
      />
    </main>
  );
}
