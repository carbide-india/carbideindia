"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Download, Trash2 } from "lucide-react";
import { upload } from "@vercel/blob/client";
import {
  saveSalesOrderDocument,
  deleteSalesOrderDocument,
} from "@/app/(app)/sales-orders/document-actions";
import {
  MAX_DOCUMENT_BYTES,
  safeDocumentName,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import type { SalesOrderDocument } from "@/lib/queries/sales-orders";

/**
 * Sales-order attachments — above all the CUSTOMER PO.
 *
 * The order already recorded the PO's number, date and a link, but a link means
 * the document lives somewhere else and someone pastes a URL: the one piece of
 * paper the whole order rests on was the one thing the system never held.
 *
 * Same uploader the vendor and client records use: the browser PUTs the file
 * straight to Vercel Blob via the shared /api/documents/upload token route,
 * then registers the metadata through `saveSalesOrderDocument`. The bytes NEVER
 * travel through a server action (Next caps those bodies at 1 MB while this UI
 * promises 25 MB).
 *
 * The blobs are PRIVATE and downloads are presigned — a customer PO carries
 * prices and terms and has no business being a public URL.
 */

/** SO blobs nest under the shared `documents/` prefix the token route enforces. */
const SO_DOCS_PREFIX = "documents/sales-order-documents/";

/** What a customer PO realistically arrives as. */
const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,application/pdf";

function prettySize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Coarse type chip from the MIME type (mirrors the client documents list). */
function typeChip(mimeType: string | null): string {
  if (!mimeType) return "FILE";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "IMG";
  if (
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType.includes("officedocument") ||
    mimeType === "application/msword" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv"
  ) {
    return "DOC";
  }
  return "FILE";
}

function fmtDate(d: Date): string {
  return formatDate(new Date(d));
}

/** Fast client-side pre-check so obviously-bad files fail before any network. */
function precheckFile(file: File): string | null {
  if (file.size === 0) return "Pick a file.";
  if (file.size > MAX_DOCUMENT_BYTES) return "File exceeds 25 MB.";
  const shape = validateDocumentFileShape({ name: file.name, contentType: file.type });
  return shape.ok ? null : shape.error;
}

export function SalesOrderDocuments({
  salesOrderId,
  documents,
  canEdit,
}: {
  salesOrderId: string;
  documents: SalesOrderDocument[];
  /** Anyone who can see the order may attach its PO; read-only when false. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File): Promise<void> {
    const bad = precheckFile(file);
    if (bad) {
      fireToast({ message: bad, type: "error" });
      return;
    }
    setBusy(true);
    try {
      const contentType = file.type || "application/octet-stream";
      const blob = await upload(
        `${SO_DOCS_PREFIX}${salesOrderId}/${safeDocumentName(file.name)}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/documents/upload",
          contentType,
          // handleUpload's token step never receives the file's contentType,
          // so it rides along here and is pinned onto the PUT.
          clientPayload: JSON.stringify({ contentType }),
        },
      );
      const res = await saveSalesOrderDocument({
        salesOrderId,
        title: file.name,
        storagePath: blob.pathname,
        mimeType: file.type || null,
        sizeBytes: file.size,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${file.name} attached.`, type: "success" });
      router.refresh();
    } catch (err) {
      fireToast({
        message: err instanceof Error ? err.message : "Upload failed.",
        type: "error",
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string, title: string): Promise<void> {
    if (!window.confirm(`Remove "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await deleteSalesOrderDocument(id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Attachment removed.", type: "success" });
      router.refresh();
    } catch (err) {
      fireToast({
        message: err instanceof Error ? err.message : "Delete failed.",
        type: "error",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="px-4 py-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] font-bold tabular-nums text-[#6b7280]">
          {documents.length === 0
            ? "No files attached"
            : `${documents.length} ${documents.length === 1 ? "file" : "files"}`}
        </span>
        {canEdit && (
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-chip border border-[#d4d7e3] bg-white px-3.5 py-2 text-[13px] font-bold text-[#3a4152] transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94] ${
              busy ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <Upload size={15} strokeWidth={2.4} />
            {busy ? "Uploading" : "Attach PO"}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={ACCEPT}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="text-[13.5px] text-[#8a90a0]">
          {canEdit
            ? "Attach the customer PO — PDF, scan or photo, up to 25 MB per file."
            : "Nothing attached yet."}
        </p>
      ) : (
        <ul className="divide-y divide-[#e5e7eb] overflow-hidden rounded-xl border border-[#e5e7eb]">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 bg-white px-3 py-2.5">
              <FileText size={18} strokeWidth={2.2} className="shrink-0 text-[#9aa0ab]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="truncate text-[13.5px] font-bold text-[#14151a]"
                    title={doc.title}
                  >
                    {doc.title}
                  </span>
                  <span className="shrink-0 rounded bg-[#f1f2f6] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6b7280]">
                    {typeChip(doc.mimeType)}
                  </span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#8a90a0]">
                  {prettySize(doc.sizeBytes)}
                  {doc.sizeBytes ? " · " : ""}
                  {fmtDate(doc.createdAt)}
                  {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
                </div>
              </div>
              {doc.downloadUrl ? (
                <a
                  href={doc.downloadUrl}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold text-[#3f3f94] hover:bg-[#eef0fa]"
                  title="Download"
                >
                  <Download size={15} strokeWidth={2.3} />
                  <span className="max-sm:hidden">Download</span>
                </a>
              ) : (
                <span className="px-2 py-1 text-[11.5px] text-[#b3b8c2]">Unavailable</span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDelete(doc.id, doc.title)}
                  disabled={deletingId === doc.id}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold text-[#D32F2F] hover:bg-[rgba(211,47,47,0.08)] disabled:opacity-50"
                  title="Remove"
                >
                  <Trash2 size={15} strokeWidth={2.3} />
                  <span className="max-sm:hidden">
                    {deletingId === doc.id ? "Removing" : "Remove"}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
