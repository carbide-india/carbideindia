import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getItemById } from "@/lib/queries/items";
import { getItemDocuments } from "@/lib/queries/item-documents";
import { getAuditLog } from "@/lib/queries/audit";
import { ItemDetail } from "@/components/items/item-detail";

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
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [item, auditEntries, documents] = await Promise.all([
    getItemById(id),
    getAuditLog("item", id),
    getItemDocuments(id),
  ]);
  if (!item) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <ItemDetail item={item} auditEntries={auditEntries} documents={documents} />
    </main>
  );
}
