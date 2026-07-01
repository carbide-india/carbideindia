import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getItemById } from "@/lib/queries/items";
import { getItemDocuments } from "@/lib/queries/item-documents";
import { getAuditLog } from "@/lib/queries/audit";
import { getItemStageCounts, stageFromCounts } from "@/lib/queries/item-stage";
import { ItemWorkspace } from "@/components/erp/item-workspace";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Item — Carbide India" };
  const item = await getItemById(id);
  return {
    title: item ? `${item.itemCode} — Carbide India` : "Item — Carbide India",
  };
}

export default async function ItemDetailPage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [item, auditEntries, documents, counts] = await Promise.all([
    getItemById(id),
    getAuditLog("item", id),
    getItemDocuments(id),
    getItemStageCounts(id),
  ]);
  if (!item) notFound();

  const stageIndex = stageFromCounts(counts, item.status);

  return (
    <ItemWorkspace
      item={item}
      auditEntries={auditEntries}
      documents={documents}
      counts={counts}
      stageIndex={stageIndex}
      isAdmin={me.isAdmin}
    />
  );
}
