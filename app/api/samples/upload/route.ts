import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth/current";
import {
  SAMPLE_ATTACHMENT_TYPES,
  SAMPLE_MAX_ATTACHMENT_BYTES,
} from "@/lib/samples/attachments";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Every sample attachment blob lives under this pathname prefix. */
const SAMPLES_PATHNAME_PREFIX = "samples/";

/**
 * Sample-photo upload — SERVER-SIDE. The browser POSTs the file as multipart
 * form-data (see `uploadFileToServer`) and this route `put()`s it to Vercel Blob
 * server-to-server. Replaced the client-direct `upload()` flow, which fails on
 * this deployment (browser → Blob PUT 404s). Same pattern as the business-card
 * scan.
 *
 * Contract preserved: pathname pinned under `samples/`, images only, 10 MB cap,
 * random suffix. Photos are PUBLIC blobs (the detail page renders them via
 * plain <img>, same as avatars).
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
    if (typeof pathname !== "string" || !pathname.startsWith(SAMPLES_PATHNAME_PREFIX)) {
      return NextResponse.json(
        { error: "Sample photos must be uploaded under samples/." },
        { status: 400 },
      );
    }
    const contentType = file.type || "application/octet-stream";
    if (!SAMPLE_ATTACHMENT_TYPES.has(contentType)) {
      return NextResponse.json({ error: "This file type isn't supported." }, { status: 400 });
    }
    if (file.size > SAMPLE_MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "This file is too large." }, { status: 400 });
    }

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });
    return NextResponse.json({ url: blob.url, pathname: blob.pathname, downloadUrl: blob.url });
  } catch (err) {
    console.error("[samples] server upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
