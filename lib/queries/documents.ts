import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, employees } from "@/db/schema";
import { getDocumentDownloadUrls } from "@/lib/storage/blob";

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  createdAt: Date;
  /** Short-lived presigned download URL (null if presigning failed). */
  url: string | null;
}

/** Document library, newest first, each with a fresh presigned download URL. */
export async function listDocuments(): Promise<DocumentRow[]> {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      description: documents.description,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploadedByName: employees.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(employees, eq(documents.uploadedById, employees.id))
    .orderBy(desc(documents.createdAt))
    .limit(500);

  // Documents live in private Vercel Blob storage. One read-scoped token
  // issuance (single network call), then every row's download URL is
  // presigned locally - so 500 docs never become 500 HTTP round-trips.
  // Failure degrades to url:null (the UI hides the download button).
  let urlByPath = new Map<string, string>();
  try {
    urlByPath = await getDocumentDownloadUrls(rows.map((r) => r.storagePath));
  } catch {
    // presigning unavailable (e.g. missing BLOB_READ_WRITE_TOKEN) - degrade.
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    uploadedByName: r.uploadedByName ?? null,
    createdAt: r.createdAt,
    url: urlByPath.get(r.storagePath) ?? null,
  }));
}
