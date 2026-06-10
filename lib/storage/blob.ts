import "server-only";

import { put, del, list, issueSignedToken, presignUrl } from "@vercel/blob";

/**
 * All Vercel Blob I/O lives here. Requires BLOB_READ_WRITE_TOKEN at runtime
 * (auto-injected on Vercel; set manually for local / self-hosted deploys).
 *
 * Access model:
 * - Avatars are PUBLIC — they render in plain <img> tags across the app,
 *   so the permanent blob URL is stored directly on employees.avatarUrl.
 * - Documents are PRIVATE — business files. @vercel/blob 2.x supports
 *   `access: "private"` plus presigned GET URLs: `issueSignedToken()` is a
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

/**
 * Documents: private business files. Returns the blob PATHNAME (stored in
 * documents.storage_path); download links are minted per-render via
 * getDocumentDownloadUrls().
 */
export async function uploadDocument(
  key: string,
  file: Blob | Buffer,
  contentType: string,
): Promise<string> {
  const blob = await put(`documents/${key}`, file, {
    access: "private",
    contentType,
    addRandomSuffix: true,
  });
  return blob.pathname;
}

/** Delete a single blob by URL or pathname. Callers treat this as best-effort. */
export async function deleteBlob(urlOrPathname: string): Promise<void> {
  await del(urlOrPathname);
}

/**
 * Delete every blob under a prefix (e.g. `avatars/<employeeId>/`).
 * Best-effort cleanup helper — callers catch failures.
 */
export async function deleteByPrefix(prefix: string): Promise<void> {
  const { blobs } = await list({ prefix });
  if (blobs.length > 0) {
    await del(blobs.map((b) => b.url));
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
