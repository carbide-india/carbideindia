import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth/current";
import {
  DISALLOWED_MIME_TYPES,
  DOCUMENTS_PATHNAME_PREFIX,
  MAX_DOCUMENT_BYTES,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";

export const runtime = "nodejs";

/**
 * Token endpoint for client-direct document uploads (browser → Vercel Blob).
 *
 * Files used to travel through a server action (FormData), but Next's default
 * action body limit is 1 MB and Vercel functions cap request bodies at
 * ~4.5 MB - while the UI promises 25 MB. With client uploads the file never
 * touches our server: the browser asks this route for a scoped client token,
 * PUTs the bytes straight to Blob, then registers the metadata via the
 * `createDocumentRecord` / `replaceDocumentFile` server actions.
 *
 * Security boundary = the token constraints below:
 *  - pathname must live under `documents/` (avatars etc. are unreachable),
 *  - extension + MIME denylists (same lists as the metadata actions),
 *  - 25 MB cap, random suffix so pathnames are unguessable.
 *
 * Access note: documents are PRIVATE blobs. In @vercel/blob 2.4.0 the client
 * `upload()` supports `access: "private"` (sent with the PUT itself), but the
 * client token cannot pin the access level - `onBeforeGenerateToken` has no
 * `access` option. A tampered client could therefore upload its OWN file as
 * public; that file is one the caller already possesses, and download links
 * for everyone else are still minted as private presigned URLs, so nothing
 * third-party leaks.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Auth: documents are open to all signed-in employees (same rule as
        // listDocuments); requireUser rejects deactivated employees too. Done
        // HERE (not at the top) so the Blob `blob.upload-completed` callback —
        // which carries no session cookie and skips this hook — isn't blocked;
        // Blob verifies that callback via its signed token. The route is public
        // in middleware so the callback can reach it at all.
        await requireUser();
        if (!pathname.startsWith(DOCUMENTS_PATHNAME_PREFIX)) {
          throw new Error("Documents must be uploaded under documents/.");
        }
        const shape = validateDocumentFileShape({ name: pathname });
        if (!shape.ok) throw new Error(shape.error);

        // upload() does not forward the file's contentType to this endpoint,
        // so the client sends it via clientPayload. We validate it against
        // the denylist here and pin it via allowedContentTypes - the Blob API
        // enforces that constraint on the actual PUT.
        let contentType = "application/octet-stream";
        if (clientPayload) {
          try {
            const parsed: unknown = JSON.parse(clientPayload);
            const ct = (parsed as { contentType?: unknown } | null)?.contentType;
            if (typeof ct === "string" && ct.length > 0) contentType = ct;
          } catch {
            // Malformed payload - fall through to the octet-stream default.
          }
        }
        if (DISALLOWED_MIME_TYPES.has(contentType)) {
          throw new Error("This file type is not allowed.");
        }

        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: MAX_DOCUMENT_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // No-op by design: the client confirms the upload by calling the
        // metadata server action, which is what creates the DB row. This
        // callback is observability only - and per Vercel docs it never
        // fires on localhost (Blob can't call back into your dev machine).
        console.log("[documents] blob upload completed", blob.pathname);
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
