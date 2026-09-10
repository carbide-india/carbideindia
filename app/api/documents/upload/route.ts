import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth/current";
import {
  DISALLOWED_MIME_TYPES,
  DOCUMENTS_PATHNAME_PREFIX,
  MAX_DOCUMENT_BYTES,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Document upload — SERVER-SIDE. The browser POSTs the file as multipart
 * form-data (see `uploadFileToServer`) and this route `put()`s it to Vercel Blob
 * server-to-server, then the client registers the metadata via the
 * `createDocumentRecord` / `replaceDocumentFile` server actions.
 *
 * This replaced the client-direct `upload()` flow (browser → Blob PUT), which
 * fails on this deployment: the direct PUT returned 404 and the file never
 * landed. A route handler accepts up to Vercel's ~100 MB body limit, so our
 * 25 MB cap is comfortably within reach. Same pattern as the business-card scan.
 *
 * Security boundary (unchanged): pathname must live under `documents/`,
 * extension + MIME denylists, 25 MB cap, random suffix so pathnames are
 * unguessable. Documents are stored PRIVATE (downloaded via presigned URLs); a
 * caller may request `access: "public"` for blobs meant to be embedded directly
 * (e.g. sample voice notes), the only place that field is used.
 */
export async function POST(request: Request): Promise<NextResponse> {
  await requireUser();

  try {
    const form = await request.formData();
    const file = form.get("file");
    const pathname = form.get("pathname");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (typeof pathname !== "string" || !pathname.startsWith(DOCUMENTS_PATHNAME_PREFIX)) {
      return NextResponse.json(
        { error: "Documents must be uploaded under documents/." },
        { status: 400 },
      );
    }
    const shape = validateDocumentFileShape({ name: pathname });
    if (!shape.ok) {
      return NextResponse.json({ error: shape.error }, { status: 400 });
    }

    const contentType = file.type || "application/octet-stream";
    if (DISALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json({ error: "This file type is not allowed." }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: "This file is too large." }, { status: 400 });
    }

    // Private by default; a caller can opt a blob public (audio notes are
    // embedded directly). Anything else falls back to private.
    const requested = form.get("access");
    const access: "public" | "private" = requested === "public" ? "public" : "private";

    const blob = await put(pathname, file, {
      access,
      addRandomSuffix: true,
      contentType,
    });
    const downloadUrl = (blob as { downloadUrl?: string }).downloadUrl ?? blob.url;
    return NextResponse.json({ url: blob.url, pathname: blob.pathname, downloadUrl });
  } catch (err) {
    console.error("[documents] server upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
