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
      ? `${rec.soNo} · Factory Copy (Internal) - Carbide India`
      : "Sales Order - Carbide India",
  };
}

/**
 * Output 2 of 2 - the internal factory / production copy. Same auth gate as the
 * customer copy (`requireUser`): the whole app is already IP-gated and
 * invite-only, so no separate role gate is invented here.
 */
export default async function SalesOrderFactoryCopyPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const rec = await getSalesOrderDocInput(id);
  if (!rec) notFound();

  return (
    <SoCopyView
      document={buildSalesOrderDocument(rec, "factory")}
      salesOrderId={id}
      pdfHref={`/sales-orders/${id}/factory-copy.pdf`}
      otherCopyHref={`/sales-orders/${id}/customer-copy`}
      otherCopyLabel="Customer Copy"
    />
  );
}
