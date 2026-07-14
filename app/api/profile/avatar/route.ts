import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { uploadAvatar, deleteByPrefix } from "@/lib/storage/blob";
import { updateTag } from "next/cache";
import { CACHE_TAGS, PROFILE_CACHE_TAGS } from "@/lib/cache-tags";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Avatar upload - multipart POST. The client uploads the cropped square
 * blob (handled by react-easy-crop). We re-validate server-side: MIME,
 * size, and reject anything else. The blob is stored publicly at
 * `avatars/<employeeId>/avatar-<suffix>.<ext>` on Vercel Blob and the
 * permanent public URL is stored as the employee's avatarUrl - no signed
 * URL refresh needed.
 *
 * Returns: { ok: true, url } | { ok: false, error }
 */
export async function POST(req: Request) {
  const me = await requireUser();

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "Missing 'file' field" },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: "Only JPEG, PNG, or WebP images are accepted" },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image must be 2MB or smaller" },
      { status: 413 },
    );
  }

  const ext =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : "webp";

  let url: string;
  try {
    url = await uploadAvatar(`${me.id}/avatar.${ext}`, file, file.type);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Storage: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  try {
    await db
      .update(employees)
      .set({ avatarUrl: url })
      .where(eq(employees.id, me.id));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `DB: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // Best-effort reap of the user's OLDER avatar blobs (each upload mints a
  // new random-suffixed blob, so without this re-uploads leak forever).
  // Runs after the DB points at the new URL; `keepUrl` protects it.
  try {
    await deleteByPrefix(`avatars/${me.id}/`, { keepUrl: url });
  } catch (err) {
    console.warn("[avatar] blob cleanup failed", err);
  }

  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  updateTag(CACHE_TAGS.employees);

  return NextResponse.json({ ok: true, url });
}

/**
 * DELETE - clears the avatar back to initials. Removes the user's stored
 * blobs (best-effort) and nulls out avatarUrl.
 */
export async function DELETE() {
  const me = await requireUser();

  try {
    await db
      .update(employees)
      .set({ avatarUrl: null })
      .where(eq(employees.id, me.id));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `DB: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // Best-effort cleanup of the user's avatar blobs. Failure here is
  // non-fatal - the row is already updated.
  try {
    await deleteByPrefix(`avatars/${me.id}/`);
  } catch (err) {
    console.warn("[avatar] blob cleanup failed", err);
  }

  updateTag(PROFILE_CACHE_TAGS.profile(me.id));
  updateTag(CACHE_TAGS.employees);

  return NextResponse.json({ ok: true });
}
