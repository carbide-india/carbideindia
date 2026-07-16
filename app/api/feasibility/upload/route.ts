import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth/current";
import { FEAS_ATTACHMENT_TYPES, FEAS_MAX_ATTACHMENT_BYTES } from "@/lib/feasibility/attachments";

export const runtime = "nodejs";

/** Every feasibility attachment blob lives under this prefix. */
const FEAS_PATHNAME_PREFIX = "feasibility/";

/**
 * Token endpoint for client-direct feasibility-attachment uploads
 * (browser → Vercel Blob), same shape as /api/samples/upload: pathname pinned
 * under `feasibility/`, an allowlist of drawing/spec/photo content types
 * (sent via clientPayload since upload() doesn't forward contentType), a 20 MB
 * cap, and a random suffix. Public blobs, downloaded via plain links.
 */
export async function POST(request: Request): Promise<NextResponse> {
  await requireUser();

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith(FEAS_PATHNAME_PREFIX)) {
          throw new Error("Feasibility attachments must be uploaded under feasibility/.");
        }
        let contentType = "";
        if (clientPayload) {
          try {
            const parsed: unknown = JSON.parse(clientPayload);
            const ct = (parsed as { contentType?: unknown } | null)?.contentType;
            if (typeof ct === "string") contentType = ct;
          } catch {
            // Malformed payload → falls through to the allowlist rejection.
          }
        }
        if (!FEAS_ATTACHMENT_TYPES.has(contentType)) {
          throw new Error("This file type isn't supported.");
        }
        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: FEAS_MAX_ATTACHMENT_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("[feasibility] blob upload completed", blob.pathname);
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
