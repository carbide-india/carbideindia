import "server-only";

import { put, del, list, issueSignedToken, presignUrl } from "@vercel/blob";

/**
 * All server-side Vercel Blob I/O lives here. Requires BLOB_READ_WRITE_TOKEN
 * at runtime (auto-injected on Vercel; set manually for local / self-hosted
 * deploys).
 *
 * Access model:
 * - Avatars are PUBLIC — they render in plain <img> tags across the app,
 *   so the permanent blob URL is stored directly on employees.avatarUrl.
 *   Small (≤2 MB), so they upload through /api/profile/avatar.
 * - Documents are PRIVATE — business files up to 25 MB, which exceeds
 *   Vercel's ~4.5 MB function body cap, so the FILE goes browser → Blob
 *   directly: the client calls `upload()` (@vercel/blob/client) against the
 *   /api/documents/upload token route, then registers metadata via a server
 *   action. Downloads use presigned GET URLs: `issueSignedToken()` is a
 *   single network call to the Blob API, after which `presignUrl()` signs
 *   each pathname locally (HMAC, no network). The documents page issues one
 *   short-lived token per render and presigns every row's download URL in
 *   one batch.
 */

/** How long presigned document download URLs stay valid (1 hour). */
const DOWNLOAD_URL_TTL_MS = 60 * 60 * 1000;

/** Avatars: public (rendered in <img> across the app). Returns the permanent public URL. */
export async function uploadAvatar(
  key: string,
  file: Blob | Buffer,
  contentType: string,
): Promise<string> {
  const blob = await put(`avatars/${key}`, file, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });
  return blob.url;
}

/** Delete a single blob by URL or pathname. Callers treat this as best-effort. */
export async function deleteBlob(urlOrPathname: string): Promise<void> {
  await del(urlOrPathname);
}

/**
 * Delete every blob under a prefix (e.g. `avatars/<employeeId>/`), optionally
 * keeping one URL (used after an avatar re-upload to reap the older blobs
 * without touching the one just stored). Best-effort cleanup helper —
 * callers catch failures.
 */
export async function deleteByPrefix(
  prefix: string,
  opts?: { keepUrl?: string },
): Promise<void> {
  const { blobs } = await list({ prefix });
  const urls = blobs.map((b) => b.url).filter((u) => u !== opts?.keepUrl);
  if (urls.length > 0) {
    await del(urls);
  }
}

/**
 * Mint short-lived presigned download URLs for a batch of private document
 * pathnames. One network round-trip (token issuance scoped to read-only),
 * then each URL is signed locally. Returns pathname → presigned URL.
 */
export async function getDocumentDownloadUrls(
  pathnames: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (pathnames.length === 0) return out;
  const token = await issueSignedToken({
    pathname: "*",
    operations: ["get"],
    validUntil: Date.now() + DOWNLOAD_URL_TTL_MS,
  });
  for (const pathname of pathnames) {
    const { presignedUrl } = await presignUrl(token, {
      operation: "get",
      pathname,
      access: "private",
    });
    out.set(pathname, presignedUrl);
  }
  return out;
}
