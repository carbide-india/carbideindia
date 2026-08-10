import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import {
  getSalesOrderById,
  getSalesOrderItems,
  getSalesOrderLineNotes,
} from "@/lib/queries/sales-orders";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getInquiryItemSeeds } from "@/lib/queries/quotes";
import {
  SoDetail,
  type SalesOrderInquiryLink,
} from "@/components/sales-orders/so-detail";
import { SoOutputsCard } from "@/components/sales-orders/so-outputs-card";
import { SyncProductsBanner } from "@/components/pipeline/sync-products-banner";
import { syncProductsFromEnquiry } from "@/app/(app)/sales-orders/actions";
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
  if (!UUID_RE.test(id)) return { title: "Sales Order - Carbide India" };
  const salesOrder = await getSalesOrderById(id);
  return {
    title: salesOrder
      ? `${salesOrder.soNo} · Sales Order - Carbide India`
      : "Sales Order - Carbide India",
  };
}

export default async function SalesOrderDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const salesOrder = await getSalesOrderById(id);
  if (!salesOrder) notFound();

  // The linked enquiry (SM repo) supplies the header SM chip + number, and the
  // seed list lets us flag products added to the enquiry after this sales order.
  const [employees, inquiry, lines, seeds, lineNotes] = await Promise.all([
    listEmployeeOptions(),
    salesOrder.inquiryId
      ? getInquiryById(salesOrder.inquiryId)
      : Promise.resolve(null),
    getSalesOrderItems(salesOrder.id),
    salesOrder.inquiryId
      ? getInquiryItemSeeds(salesOrder.inquiryId)
      : Promise.resolve([]),
    // Per-line factory notes for the dual-output panel (factory copy only).
    getSalesOrderLineNotes(salesOrder.id),
  ]);

  const inquiryLink: SalesOrderInquiryLink | null = inquiry
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

  // Phase 8 - pipeline stepper + flag-gated "Confirm Order" CTA. Confirmed
  // (customerSoSent) ⇒ show Job Card stage.
  const salesOrderFlagOn = await isWorkflowFlagOn("sales_order");
  const isConfirmed = salesOrder.customerSoSent === true;
  const soStageKey = isConfirmed ? ("job_card" as const) : ("sales_order" as const);
  const resolvedStage = { stage: soStageKey, index: stageIndex(soStageKey) };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <WorkflowStepper
        resolved={resolvedStage}
        flagOn={salesOrderFlagOn && !isConfirmed}
        advance={{ entity: "sales_order", id: salesOrder.id, label: "Confirm Order" }}
      />
      <SyncProductsBanner
        missingCount={missingCount}
        recordId={salesOrder.id}
        recordLabel="sales order"
        syncAction={syncProductsFromEnquiry}
      />
      <SoDetail
        salesOrder={salesOrder}
        employees={employees}
        inquiryLink={inquiryLink}
        lines={lines}
      />
      {/* One SO, two outputs — stage bucket + customer/factory copies. */}
      <SoOutputsCard
        salesOrderId={salesOrder.id}
        soNo={salesOrder.soNo}
        status={salesOrder.salesOrderStatus}
        customerSoSent={salesOrder.customerSoSent}
        customerSoLink={salesOrder.customerSoLink}
        productionSoSent={salesOrder.productionSoSent}
        productionSoLink={salesOrder.productionSoLink}
        productionNotes={salesOrder.productionNotes}
        lines={lineNotes}
      />
    </main>
  );
}
