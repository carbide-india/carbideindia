import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/current";
import { getClientRecord } from "@/lib/queries/clients";
import { getClientDocuments } from "@/lib/queries/client-documents";
import { getAuditLog } from "@/lib/queries/audit";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ClientRecord } from "@/components/clients/client-record";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Client — Carbide India" };
  const record = await getClientRecord(id);
  return {
    title: record ? `${record.name} — Carbide India` : "Client — Carbide India",
  };
}

export default async function ClientRecordPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [record, documents, auditEntries] = await Promise.all([
    getClientRecord(id),
    getClientDocuments(id),
    getAuditLog("client", id),
  ]);

  if (!record) notFound();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <ClientRecord
          record={record}
          documents={documents}
          auditEntries={auditEntries}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
