"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Download, Trash2 } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { saveClientDocument, deleteClientDocument } from "@/app/(app)/clients/document-actions";
import {
  MAX_DOCUMENT_BYTES,
  safeDocumentName,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";
import { fireToast } from "@/lib/toast";
import type { ClientDocument } from "@/lib/queries/client-documents";

/** Client document blobs nest under the shared `documents/` prefix that the
 *  reused /api/documents/upload token route enforces. */
const CLIENT_DOCS_PREFIX = "documents/client-documents/";

function prettySize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Coarse type chip from the MIME type. */
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
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Fast client-side pre-check so obviously-bad files fail before any network. */
function precheckFile(file: File): string | null {
  if (file.size === 0) return "Pick a file.";
  if (file.size > MAX_DOCUMENT_BYTES) return "File exceeds 25 MB.";
  const shape = validateDocumentFileShape({ name: file.name, contentType: file.type });
  return shape.ok ? null : shape.error;
}

export function ClientDocuments({
  clientId,
  documents,
}: {
  clientId: string;
  documents: ClientDocument[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File): Promise<void> {
    const bad = precheckFile(file);
    if (bad) {
      fireToast({ message: bad });
      return;
    }
    setBusy(true);
    try {
      const contentType = file.type || "application/octet-stream";
      // Browser → Vercel Blob directly (the file never passes through a server
      // action, which Next caps at 1 MB). The reused /api/documents/upload
      // route mints the private token; contentType travels via clientPayload
      // because handleUpload's token step doesn't receive it otherwise.
      const blob = await upload(
        `${CLIENT_DOCS_PREFIX}${clientId}/${safeDocumentName(file.name)}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/documents/upload",
          contentType,
          clientPayload: JSON.stringify({ contentType }),
        },
      );
      const res = await saveClientDocument({
        clientId,
        title: file.name,
        storagePath: blob.pathname,
        mimeType: file.type || null,
        sizeBytes: file.size,
      });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Document uploaded." });
      router.refresh();
    } catch (err) {
      fireToast({ message: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await deleteClientDocument(id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Document deleted." });
      router.refresh();
    } catch (err) {
      fireToast({ message: err instanceof Error ? err.message : "Delete failed." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">Documents</h3>
        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Upload className="h-4 w-4" />
          {busy ? "Uploading…" : "Upload"}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-gray-500">No documents attached yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900" title={doc.title}>
                    {doc.title}
                  </span>
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                    {typeChip(doc.mimeType)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
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
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-indigo-700 hover:bg-indigo-50"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              ) : (
                <span className="px-2 py-1 text-xs text-gray-400">Unavailable</span>
              )}
              <button
                type="button"
                onClick={() => void handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {deletingId === doc.id ? "Deleting…" : "Delete"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
