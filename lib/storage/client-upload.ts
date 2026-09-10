/**
 * Client-side file upload helper — the browser POSTs the file as multipart
 * form-data to one of our upload routes, which `put()`s it to Vercel Blob
 * server-to-server and returns `{ url, pathname }`.
 *
 * This REPLACED the `@vercel/blob/client` `upload()` flow (browser → Blob
 * direct PUT), which fails on this deployment: the direct PUT to the Blob API
 * returns 4xx (404 / CORS-blocked 400) and the file never lands. The
 * server-relayed path is the same one the KYC business-card scan already uses
 * (see /api/clients/business-card/upload). A route handler accepts up to
 * Vercel's ~100 MB body limit, so our ≤25 MB files are fine.
 *
 * Uses XMLHttpRequest (not fetch) so callers can show real upload progress —
 * fetch cannot report request-body upload progress.
 */

export interface UploadedBlob {
  /** Public URL of the blob (for public uploads, this is directly usable). */
  url: string;
  /** The stored pathname (with the random suffix applied by Blob) — this is what
   *  we persist as `storagePath` for private blobs and presign on download. */
  pathname: string;
  /** A download URL from `put()`; falls back to `url` when the API omits it. */
  downloadUrl: string;
}

/**
 * Upload `file` to `routeUrl` under the given (already-prefixed) `pathname`.
 * `access` tells the route whether to store the blob public or private
 * (defaults to the route's own default). `onProgress` receives 0-100 as the
 * bytes upload. Throws with the route's error message on failure so callers can
 * toast it.
 */
export function uploadFileToServer(
  routeUrl: string,
  pathname: string,
  file: Blob,
  opts: { access?: "public" | "private"; onProgress?: (percentage: number) => void } = {},
): Promise<UploadedBlob> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("pathname", pathname);
  if (opts.access) fd.append("access", opts.access);

  return new Promise<UploadedBlob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", routeUrl);
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          opts.onProgress!(Math.round((e.loaded / e.total) * 100));
        }
      };
    }
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText) as unknown;
      } catch {
        /* non-JSON response */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as UploadedBlob);
      } else {
        const msg =
          (body as { error?: string } | null)?.error ?? `Upload failed (${xhr.status}).`;
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error."));
    xhr.send(fd);
  });
}
