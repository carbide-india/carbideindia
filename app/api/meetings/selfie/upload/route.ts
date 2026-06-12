import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth/current";

export const runtime = "nodejs";

/** Every meeting selfie blob lives under this pathname prefix. (Not exported —
 *  route files may only export Next.js route fields; the form hardcodes it.) */
const SELFIE_PATHNAME_PREFIX = "meeting-selfies/";

/** Selfies are images only — phone-camera proof-of-visit shots. HEIC is
 *  included because iPhones default to it. */
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/** 25 MB — sane for a single phone selfie (the form copy said 1GB; this is the
 *  practical cap for one image). */
const MAX_SELFIE_BYTES = 25 * 1024 * 1024;

/**
 * Token endpoint for client-direct meeting-selfie uploads (browser → Vercel
 * Blob) — same shape as /api/samples/upload, with a tighter contract:
 *
 *  - pathname must live under `meeting-selfies/`,
 *  - images only (jpeg/png/webp/heic), validated via clientPayload and pinned
 *    through allowedContentTypes (the Blob API enforces it on the PUT),
 *  - 25 MB cap, random suffix so pathnames are unguessable.
 *
 * Selfies upload as PUBLIC blobs (like sample photos / avatars): the detail
 * page renders them with plain <img>.
 */
export async function POST(request: Request): Promise<NextResponse> {
  await requireUser();

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith(SELFIE_PATHNAME_PREFIX)) {
          throw new Error("Selfies must be uploaded under meeting-selfies/.");
        }

        // upload() does not forward the file's contentType to this endpoint,
        // so the client sends it via clientPayload (same dance as samples).
        let contentType = "";
        if (clientPayload) {
          try {
            const parsed: unknown = JSON.parse(clientPayload);
            const ct = (parsed as { contentType?: unknown } | null)?.contentType;
            if (typeof ct === "string") contentType = ct;
          } catch {
            // Malformed payload — falls through to the allowlist rejection.
          }
        }
        if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
          throw new Error("Only JPEG, PNG, WebP or HEIC images are allowed.");
        }

        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: MAX_SELFIE_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // No-op by design: the selfie URL is persisted by createClientMeeting /
        // updateClientMeeting. Observability only — never fires on localhost.
        console.log("[meetings] selfie upload completed", blob.pathname);
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
