import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getSalesOrderDocInput } from "@/lib/queries/sales-orders";
import { buildSalesOrderDocument } from "@/lib/sales-orders/so-document";
import { SoCopyView } from "@/components/sales-orders/so-copy-view";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Sales Order - Carbide India" };
  const rec = await getSalesOrderDocInput(id);
  return {
    title: rec
      ? `${rec.soNo} · Customer Copy - Carbide India`
      : "Sales Order - Carbide India",
  };
}

/** Output 1 of 2 - the customer-facing copy, previewed on screen and printable. */
export default async function SalesOrderCustomerCopyPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const rec = await getSalesOrderDocInput(id);
  if (!rec) notFound();

  return (
    <SoCopyView
      document={buildSalesOrderDocument(rec, "customer")}
      salesOrderId={id}
      pdfHref={`/sales-orders/${id}/customer-copy.pdf`}
      otherCopyHref={`/sales-orders/${id}/factory-copy`}
      otherCopyLabel="Factory Copy"
    />
  );
}
