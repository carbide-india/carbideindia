import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth/current";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Business-card scans + "Other" document tiles: images render via <img>; PDFs
 *  are allowed for the "Other" slot. */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

/** 25 MB — phone-camera shots of a business card, not large document scans. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Business-card upload — SERVER-SIDE. The browser POSTs the file as multipart
 * form-data to this route, and the route `put()`s it to Vercel Blob server-to-
 * server. This replaced the previous client-direct `upload()` flow, which the
 * browser blocked cross-origin (the PUT to vercel.com/api/blob returned 400 with
 * no Access-Control-Allow-Origin → the SDK retried forever). A route handler
 * accepts up to Vercel's 100 MB body limit, so a ≤25 MB image is fine.
 *
 * Scans are PUBLIC blobs (the KYC form renders them with plain <img>), same
 * access model as avatars / sample photos.
 */
export async function POST(request: Request): Promise<NextResponse> {
  await requireUser();

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, HEIC images or PDF files are allowed." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 25 MB." }, { status: 400 });
    }

    const safeName =
      file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "card";

    const blob = await put(`business-cards/${safeName}`, file, {
      access: "public",
      addRandomSuffix: true, // unguessable pathnames
      contentType: file.type,
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("[business-cards] server upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
