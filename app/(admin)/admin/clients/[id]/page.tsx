import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/current";
import { getClientRecord } from "@/lib/queries/clients";
import { getClientDocuments } from "@/lib/queries/client-documents";
import { ClientRecord } from "@/components/admin/client-record";

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

  const [record, documents] = await Promise.all([
    getClientRecord(id),
    getClientDocuments(id),
  ]);

  if (!record) notFound();

  return (
    <div>
      <ClientRecord record={record} documents={documents} />
    </div>
  );
}
