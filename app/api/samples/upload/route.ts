import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth/current";

export const runtime = "nodejs";

/** Every sample photo blob lives under this pathname prefix. (Not exported —
 *  route files may only export Next.js route fields; the form hardcodes it.) */
const SAMPLES_PATHNAME_PREFIX = "samples/";

/** Sample photos are images only — render via plain <img> on the detail page. */
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 10 MB — phone-camera shots of physical samples, not document scans. */
const MAX_SAMPLE_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Token endpoint for client-direct sample-photo uploads (browser → Vercel
 * Blob) — same shape as /api/documents/upload, with a tighter contract:
 *
 *  - pathname must live under `samples/` (documents/avatars unreachable),
 *  - images only (jpeg/png/webp), validated via clientPayload and pinned
 *    through allowedContentTypes (the Blob API enforces it on the PUT),
 *  - 10 MB cap, random suffix so pathnames are unguessable.
 *
 * Photos upload as PUBLIC blobs (unlike documents): the detail page renders
 * them with plain <img> tags, same access model as avatars.
 */
export async function POST(request: Request): Promise<NextResponse> {
  await requireUser();

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith(SAMPLES_PATHNAME_PREFIX)) {
          throw new Error("Sample photos must be uploaded under samples/.");
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
            // Malformed payload — falls through to the allowlist rejection.
          }
        }
        if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
          throw new Error("Only JPEG, PNG or WebP images are allowed.");
        }

        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: MAX_SAMPLE_PHOTO_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // No-op by design: the photo URL is persisted by createSample /
        // updateSample. Observability only — never fires on localhost.
        console.log("[samples] blob upload completed", blob.pathname);
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
