/**
 * Shared validation for document-library uploads. Imported from three places:
 *  - the client uploader (fast pre-checks before any network call),
 *  - /api/documents/upload (handleUpload token generation — the security
 *    boundary that constrains what the browser may put into Blob storage),
 *  - the documents server actions (re-validation of client-supplied metadata
 *    before the DB row is written).
 *
 * Must stay free of server-only imports — the client bundle includes it.
 */

/** UI promise: documents up to 25 MB. Enforced in the upload token AND re-checked in the actions. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Every document blob lives under this pathname prefix (avatars live under `avatars/`). */
export const DOCUMENTS_PATHNAME_PREFIX = "documents/";

/**
 * Server-side guard against the obvious dangerous uploads. The client
 * passes `file.type` verbatim, which a malicious caller can spoof —
 * but it's still useful as a coarse first filter, paired with an
 * extension deny-list on the filename (which is harder to lie about
 * without it looking suspicious to a human admin reviewing later).
 *
 * NOT a substitute for magic-byte sniffing; if document integrity
 * matters more, layer a `file-type` check on top of this.
 */
export const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget)$/i;

export const DISALLOWED_MIME_TYPES = new Set<string>([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-mach-binary",
  "application/vnd.microsoft.portable-executable",
  "application/x-sh",
  "application/x-shellscript",
  "text/x-shellscript",
]);

/** Sanitize a user filename into something safe to use in a blob pathname. */
export function safeDocumentName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

/**
 * Denylist check shared by the client pre-check, the upload-token route and
 * the metadata actions. `name` may be a bare filename or a blob pathname —
 * the extension regex anchors on the end either way.
 */
export function validateDocumentFileShape(input: {
  name: string;
  contentType?: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (DISALLOWED_EXTENSIONS.test(input.name)) {
    return { ok: false, error: "This file type is not allowed." };
  }
  if (input.contentType && DISALLOWED_MIME_TYPES.has(input.contentType)) {
    return { ok: false, error: "This file type is not allowed." };
  }
  return { ok: true };
}
