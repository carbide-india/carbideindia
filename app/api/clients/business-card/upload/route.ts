import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth/current";

export const runtime = "nodejs";

/** Every business-card scan blob lives under this pathname prefix. (Not
 *  exported - route files may only export Next.js route fields; the form
 *  hardcodes it.) */
const BUSINESS_CARDS_PATHNAME_PREFIX = "business-cards/";

/** Business-card scans + "Other" document tiles: images render via plain
 *  <img>; PDFs are allowed for the "Other" documents slot (shown as a file
 *  chip). Front/Back stay image-only via the form's own client-side gate. */
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

/** 25 MB - phone-camera shots of a business card, not large document scans. */
const MAX_BUSINESS_CARD_BYTES = 25 * 1024 * 1024;

/**
 * Token endpoint for client-direct business-card uploads (browser → Vercel
 * Blob) - same shape as /api/samples/upload, with a tighter contract:
 *
 *  - pathname must live under `business-cards/` (documents/avatars unreachable),
 *  - images only (jpeg/png/webp/heic), validated via clientPayload and pinned
 *    through allowedContentTypes (the Blob API enforces it on the PUT),
 *  - 25 MB cap, random suffix so pathnames are unguessable.
 *
 * Scans upload as PUBLIC blobs (unlike documents): the KYC form renders them
 * with plain <img> tags, same access model as avatars / sample photos.
 */
export async function POST(request: Request): Promise<NextResponse> {
  await requireUser();

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith(BUSINESS_CARDS_PATHNAME_PREFIX)) {
          throw new Error(
            "Business cards must be uploaded under business-cards/.",
          );
        }

        // upload() does not forward the file's contentType to this endpoint,
        // so the client sends it via clientPayload (same dance as documents).
        let contentType = "";
        if (clientPayload) {
          try {
            const parsed: unknown = JSON.parse(clientPayload);
            const ct = (parsed as { contentType?: unknown } | null)?.contentType;
            if (typeof ct === "string") contentType = ct;
          } catch {
            // Malformed payload - falls through to the allowlist rejection.
          }
        }
        if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
          throw new Error("Only JPEG, PNG, WebP, HEIC images or PDF files are allowed.");
        }

        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: MAX_BUSINESS_CARD_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // No-op by design: the URL is persisted by createClientKyc /
        // updateClientKyc. Observability only - never fires on localhost.
        console.log("[business-cards] blob upload completed", blob.pathname);
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
