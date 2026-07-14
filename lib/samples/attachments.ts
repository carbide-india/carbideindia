/**
 * Sample attachments - the file kinds a sample can carry (photos, videos,
 * audio, documents). All are stored as public Blob URLs in the sample's
 * `photoUrls` column; the kind is derived from the URL so the form + detail
 * view can render each appropriately. Client-safe (no server imports) so the
 * form, the detail view, and the upload route can all share it.
 */

/** 100 MB - generous enough for short clips / voice notes / scans. */
export const SAMPLE_MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** MIME allowlist enforced on the upload token + validated in the form. */
export const SAMPLE_ATTACHMENT_TYPES = new Set<string>([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

/** `accept` attribute for the file input. */
export const SAMPLE_ATTACHMENT_ACCEPT =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

export type AttachmentKind = "image" | "video" | "audio" | "file";

/** Derive the display kind from a URL's file extension. */
export function attachmentKind(url: string): AttachmentKind {
  const clean = (url.split("?")[0] ?? "").toLowerCase();
  if (/\.(jpe?g|png|webp|gif|avif|bmp)$/.test(clean)) return "image";
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(clean)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|weba)$/.test(clean)) return "audio";
  return "file";
}

/** A readable file name from the URL's last path segment. */
export function attachmentName(url: string): string {
  const clean = url.split("?")[0] ?? "";
  const base = clean.substring(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(base) || "file";
  } catch {
    return base || "file";
  }
}
