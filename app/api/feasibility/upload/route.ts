import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth/current";
import { FEAS_ATTACHMENT_TYPES, FEAS_MAX_ATTACHMENT_BYTES } from "@/lib/feasibility/attachments";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Every feasibility attachment blob lives under this prefix. */
const FEAS_PATHNAME_PREFIX = "feasibility/";

/**
 * Feasibility-attachment upload — SERVER-SIDE. The browser POSTs the file as
 * multipart form-data (see `uploadFileToServer`), and this route `put()`s it to
 * Vercel Blob server-to-server. This replaced the client-direct `upload()` flow
 * (browser → Blob PUT), which fails on this deployment — the direct PUT returned
 * 404 and the file never landed. Same server-relayed pattern as the KYC
 * business-card scan.
 *
 * Contract preserved from the old token route: pathname pinned under
 * `feasibility/`, an allowlist of drawing/spec/photo content types, a 20 MB cap,
 * a random suffix. Public blobs, downloaded via plain links.
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
    if (typeof pathname !== "string" || !pathname.startsWith(FEAS_PATHNAME_PREFIX)) {
      return NextResponse.json(
        { error: "Feasibility attachments must be uploaded under feasibility/." },
        { status: 400 },
      );
    }
    const contentType = file.type || "application/octet-stream";
    if (!FEAS_ATTACHMENT_TYPES.has(contentType)) {
      return NextResponse.json({ error: "This file type isn't supported." }, { status: 400 });
    }
    if (file.size > FEAS_MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "This file is too large." }, { status: 400 });
    }

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });
    return NextResponse.json({ url: blob.url, pathname: blob.pathname, downloadUrl: blob.url });
  } catch (err) {
    console.error("[feasibility] server upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
