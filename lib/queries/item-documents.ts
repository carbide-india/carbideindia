import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, employees } from "@/db/schema";
import { getDocumentDownloadUrls } from "@/lib/storage/blob";

export interface ItemDocument {
  id: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  createdAt: Date;
  /** Short-lived presigned download URL (null if presigning failed). */
  downloadUrl: string | null;
}

/**
 * All drawings/documents attached to an item, newest first, each carrying a
 * fresh presigned download URL. Mirrors `getClientDocuments`: one read-scoped
 * token issuance, then every row's URL is presigned locally — so N docs never
 * become N HTTP round-trips. Presign failure degrades to downloadUrl:null.
 */
export async function getItemDocuments(itemId: string): Promise<ItemDocument[]> {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploadedByName: employees.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(employees, eq(documents.uploadedById, employees.id))
    .where(eq(documents.itemId, itemId))
    .orderBy(desc(documents.createdAt))
    .limit(500);

  let urlByPath = new Map<string, string>();
  try {
    urlByPath = await getDocumentDownloadUrls(rows.map((r) => r.storagePath));
  } catch {
    // presigning unavailable (e.g. missing BLOB_READ_WRITE_TOKEN) — degrade.
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    uploadedByName: r.uploadedByName ?? null,
    createdAt: r.createdAt,
    downloadUrl: urlByPath.get(r.storagePath) ?? null,
  }));
}
