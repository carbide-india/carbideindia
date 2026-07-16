/**
 * Primary-Feasibility attachment rules (drawings, specs, photos). Shared by the
 * client uploader and the /api/feasibility/upload token endpoint. Public blobs
 * (rendered/downloaded via plain links), same access model as sample photos.
 */

export const FEAS_ATTACHMENT_TYPES = new Set<string>([
  // images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  // CAD-ish
  "application/dxf",
  "image/vnd.dxf",
  "application/acad",
  "application/octet-stream",
]);

/** 20 MB per feasibility attachment. */
export const FEAS_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Sanitise a file name for a blob pathname. */
export function safeFeasFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "file";
  const ext = dot > 0 ? name.slice(dot).replace(/[^a-zA-Z0-9.]+/g, "").slice(0, 12) : "";
  return `${base}${ext}`;
}
