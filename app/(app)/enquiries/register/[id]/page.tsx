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
  getInquiryItemFeasibility,
} from "@/lib/queries/sm-workspace";
import { getCostingDecision, type CostingDecision } from "@/lib/queries/costings";
import { SmWorkspace } from "@/components/erp/sm-workspace";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Enquiry - Carbide India" };
  const inquiry = await getInquiryById(id);
  return {
    title: inquiry
      ? `${inquiry.smNumber} · ${inquiry.companyName} - Carbide India`
      : "Enquiry - Carbide India",
  };
}

/**
 * Enquiry SM Workspace, in-module route (`/enquiries/register/[id]`). Renders the
 * pipeline cockpit INSIDE the Enquiries module shell (applied by
 * `app/(app)/enquiries/layout.tsx`) via `SmWorkspace embedded`, so the chrome is
 * the white-sidebar + indigo-header module look rather than the ERP AppShell.
 * Data-loading matches the legacy `/inquiries/[id]` route verbatim: everything is
 * fetched server-side via `lib/queries/*` and resolves through FKs; the stage is
 * derived by `derive-stage.ts` (smRollupStage) alone.
 */
export default async function InquiryWorkspacePage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const header = await getInquiryWorkspaceHeader(id);
  if (!header) notFound();

  const [inquiry, products, drawers, stages, employees, auditEntries, itemFeasibility] =
    await Promise.all([
      getInquiryById(id),
      getInquiryProducts(id),
      getInquiryProductDrawers(id),
      getInquiryStageTabs(id),
      listEmployeeOptions(),
      getAuditLog("inquiry", id),
      getInquiryItemFeasibility(id),
    ]);
  if (!inquiry) notFound();

  // Per-product costing-decision bundles (recommendation + lock state) for the
  // Costing tab's approval panel. One bundle per product line.
  const decisionList = await Promise.all(
    products.map((p) => getCostingDecision(p.id)),
  );
  const costingDecisions: Record<string, CostingDecision> = {};
  for (const d of decisionList) costingDecisions[d.inquiryItemId] = d;

  return (
    <SmWorkspace
      embedded
      header={header}
      products={products}
      drawers={drawers}
      stages={stages}
      inquiry={inquiry}
      employees={employees}
      auditEntries={auditEntries}
      itemFeasibility={itemFeasibility}
      costingDecisions={costingDecisions}
      isAdmin={me.isAdmin}
    />
  );
}
