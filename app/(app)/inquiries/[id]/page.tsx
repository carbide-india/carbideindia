import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getAuditLog } from "@/lib/queries/audit";
import {
  getInquiryWorkspaceHeader,
  getInquiryProducts,
  getInquiryProductDrawers,
  getInquiryStageTabs,
} from "@/lib/queries/sm-workspace";
import { SmWorkspace } from "@/components/erp/sm-workspace";

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

/**
 * Enquiry SM Workspace (ERP redesign — Phase 9d, §9). The pipeline cockpit for
 * one SM number: a sticky "where am I" header + derived PipelineStepper, a tab
 * rail (Overview / Products / Feasibility / Costing / Quotation / Negotiation /
 * Sales Order / Documents / Activity) and a right-side product drawer. All data
 * is fetched server-side via `lib/queries/*` and resolves through FKs; the stage
 * is derived by `derive-stage.ts` (smRollupStage) alone.
 */
export default async function InquiryDetailPage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const header = await getInquiryWorkspaceHeader(id);
  if (!header) notFound();

  const [inquiry, products, drawers, stages, employees, auditEntries] =
    await Promise.all([
      getInquiryById(id),
      getInquiryProducts(id),
      getInquiryProductDrawers(id),
      getInquiryStageTabs(id),
      listEmployeeOptions(),
      getAuditLog("inquiry", id),
    ]);
  if (!inquiry) notFound();

  return (
    <SmWorkspace
      header={header}
      products={products}
      drawers={drawers}
      stages={stages}
      inquiry={inquiry}
      employees={employees}
      auditEntries={auditEntries}
      isAdmin={me.isAdmin}
    />
  );
}
