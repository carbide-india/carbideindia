import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/current";
import { getClientDocuments } from "@/lib/queries/client-documents";
import {
  getClientHeader,
  getClientKpis,
  getClientEnquiries,
  getClientPipeline,
  getClientProducts,
  getClientFinancials,
  getClientTimeline,
} from "@/lib/queries/client-workspace";
import { ClientWorkspace } from "@/components/erp/client-workspace";
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
  if (!UUID_RE.test(id)) return { title: "Client — Carbide India" };
  const header = await getClientHeader(id);
  return {
    title: header ? `${header.name} — Carbide India` : "Client — Carbide India",
  };
}

export default async function ClientWorkspacePage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  // Header first — a missing client 404s before we fan out the heavy aggregates.
  const header = await getClientHeader(id);
  if (!header) notFound();

  const [kpis, enquiries, pipeline, products, financials, timeline, documents] =
    await Promise.all([
      getClientKpis(id),
      getClientEnquiries(id),
      getClientPipeline(id),
      getClientProducts(id),
      getClientFinancials(id),
      getClientTimeline(id),
      getClientDocuments(id),
    ]);

  return (
    <EnquiryModuleShell title="Client Record" userMenu={<UserMenuServer />}>
      <ClientWorkspace
        header={header}
        kpis={kpis}
        enquiries={enquiries}
        pipeline={pipeline}
        products={products}
        financials={financials}
        timeline={timeline}
        documents={documents}
        isAdmin
        embedded
      />
    </EnquiryModuleShell>
  );
}
