import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { canApprove } from "@/lib/approval/gate";
import { getSalesOrderById } from "@/lib/queries/sales-orders";
import {
  getQuotationPdfModel,
  getLatestQuotationRevisionId,
} from "@/lib/queries/quotations";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import {
  SoDetail,
  type SalesOrderInquiryLink,
} from "@/components/sales-orders/so-detail";
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
  if (!UUID_RE.test(id)) return { title: "Sales Order - Carbide India" };
  const salesOrder = await getSalesOrderById(id);
  return {
    title: salesOrder
      ? `${salesOrder.soNo} · Sales Order - Carbide India`
      : "Sales Order - Carbide India",
  };
}

export default async function SalesOrderDetailPage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const salesOrder = await getSalesOrderById(id);
  if (!salesOrder) notFound();

  // The linked enquiry (SM repo) supplies the header SM chip + number, and the
  // linked quotation is shown read-only — resolved to the LATEST revision of its
  // chain, so a re-quote made anywhere upstream shows through here too.
  const [employees, inquiry, quotationPdf] = await Promise.all([
    listEmployeeOptions(),
    salesOrder.inquiryId
      ? getInquiryById(salesOrder.inquiryId)
      : Promise.resolve(null),
    salesOrder.quotationId
      ? getLatestQuotationRevisionId(salesOrder.quotationId).then((latestId) =>
          getQuotationPdfModel(latestId),
        )
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
    <EnquiryModuleShell title="Sales Order" userMenu={<UserMenuServer />} isAdmin={me.isAdmin}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <SoDetail
          salesOrder={salesOrder}
          employees={employees}
          inquiryLink={inquiryLink}
          quotationPdf={quotationPdf}
          canApprove={canApprove(me)}
        />
      </div>
    </EnquiryModuleShell>
  );
}
