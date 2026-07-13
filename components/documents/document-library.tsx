"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Download, Pencil, Trash2, RefreshCw, X, Check } from "lucide-react";
import { upload } from "@vercel/blob/client";
import {
  createDocumentRecord,
  updateDocument,
  deleteDocument,
  replaceDocumentFile,
} from "@/app/(app)/documents/actions";
import {
  DOCUMENTS_PATHNAME_PREFIX,
  MAX_DOCUMENT_BYTES,
  safeDocumentName,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";
import { fireToast } from "@/lib/toast";
import type { DocumentRow } from "@/lib/queries/documents";

function prettySize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Fast client-side pre-check (size + denylists) so obviously-bad files fail
 * before any network traffic. The server re-validates everything.
 */
function precheckFile(file: File): string | null {
  if (file.size === 0) return "Pick a file.";
  if (file.size > MAX_DOCUMENT_BYTES) return "File exceeds 25 MB.";
  const shape = validateDocumentFileShape({ name: file.name, contentType: file.type });
  return shape.ok ? null : shape.error;
}

/**
 * Uploads the file browser → Vercel Blob directly (the 25 MB files never
 * pass through a server action, which is body-capped at 1 MB by Next and
 * ~4.5 MB by Vercel). /api/documents/upload mints the scoped token;
 * contentType travels via clientPayload because handleUpload's token step
 * doesn't receive it otherwise.
 */
function uploadToBlob(file: File, onProgress?: (percentage: number) => void) {
  const contentType = file.type || "application/octet-stream";
  return upload(`${DOCUMENTS_PATHNAME_PREFIX}${safeDocumentName(file.name)}`, file, {
    access: "private",
    handleUploadUrl: "/api/documents/upload",
    contentType,
    clientPayload: JSON.stringify({ contentType }),
    onUploadProgress: onProgress ? (e) => onProgress(e.percentage) : undefined,
  });
}

export function DocumentLibrary({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return fireToast({ message: "Title is required." });
    if (!file) return fireToast({ message: "Pick a file." });
    const precheck = precheckFile(file);
    if (precheck) return fireToast({ message: precheck });
    setBusy(true);
    try {
      const blob = await uploadToBlob(file, setProgress);
      const res = await createDocumentRecord({
        title: title.trim(),
        description: description.trim(),
        pathname: blob.pathname,
        contentType: file.type || null,
        sizeBytes: file.size,
      });
      if (!res.ok) return fireToast({ message: res.error });
      fireToast({ message: `${title.trim()} uploaded.` });
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      fireToast({ message: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Upload form */}
      <form
        onSubmit={submit}
        className="rounded-section border border-hairline bg-surface-card p-5 flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-ink-subtle">
          <Upload size={15} strokeWidth={2.4} /> Upload a document
        </div>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (required)"
            maxLength={200}
            className="rounded-md border border-hairline-strong px-3 py-2 text-[15px] outline-none"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            maxLength={2000}
            className="rounded-md border border-hairline-strong px-3 py-2 text-[15px] outline-none"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[14px]"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md py-2 px-5 text-[14px] font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))" }}
          >
            {busy
              ? progress != null
                ? `Uploading ${Math.round(progress)}%`
                : "Uploading"
              : "Upload"}
          </button>
        </div>
      </form>

      {/* Library */}
      {documents.length === 0 ? (
        <div className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-12 text-center">
          <FileText size={28} className="mx-auto text-ink-subtle mb-2" />
          <p className="font-serif text-ink-strong" style={{ fontStyle: "italic", fontSize: 20 }}>
            No documents yet
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((d) => (
            <DocRow key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: DocumentRow }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(doc.title);
  const [description, setDescription] = React.useState(doc.description ?? "");
  const [pending, start] = React.useTransition();
  const replaceRef = React.useRef<HTMLInputElement>(null);

  function saveEdit() {
    start(async () => {
      const res = await updateDocument(doc.id, { title: title.trim(), description });
      if (!res.ok) fireToast({ message: res.error });
      else fireToast({ message: "Saved." });
      setEditing(false);
      router.refresh();
    });
  }
  function del() {
    start(async () => {
      const res = await deleteDocument(doc.id);
      if (!res.ok) fireToast({ message: res.error });
      else fireToast({ message: `${doc.title} deleted.` });
      router.refresh();
    });
  }
  function replace(f: File) {
    const precheck = precheckFile(f);
    if (precheck) return fireToast({ message: precheck });
    start(async () => {
      try {
        const blob = await uploadToBlob(f);
        const res = await replaceDocumentFile(doc.id, {
          pathname: blob.pathname,
          contentType: f.type || null,
          sizeBytes: f.size,
        });
        if (!res.ok) fireToast({ message: res.error });
        else fireToast({ message: "File replaced." });
        router.refresh();
      } catch (err) {
        fireToast({ message: err instanceof Error ? err.message : "Upload failed." });
      }
    });
  }

  return (
    <div className="group rounded-chip border border-hairline bg-white px-4 py-3 flex items-center gap-3">
      <FileText size={20} className="text-ink-subtle shrink-0" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-hairline-strong px-2 py-1 text-[14px] font-semibold outline-none" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="rounded border border-hairline px-2 py-1 text-[13px] outline-none" />
          </div>
        ) : (
          <>
            <div className="text-[15px] font-semibold text-ink-strong truncate">{doc.title}</div>
            {doc.description && <div className="text-[13px] text-ink-subtle truncate">{doc.description}</div>}
            <div className="text-[11.5px] text-ink-subtle mt-0.5">
              {doc.uploadedByName ? `${doc.uploadedByName} · ` : ""}
              {prettySize(doc.sizeBytes)}
            </div>
          </>
        )}
      </div>
      <input ref={replaceRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) replace(f); e.target.value = ""; }} />
      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <button type="button" onClick={saveEdit} disabled={pending} aria-label="Save" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft"><Check size={16} /></button>
            <button type="button" onClick={() => { setEditing(false); setTitle(doc.title); setDescription(doc.description ?? ""); }} aria-label="Cancel" className="p-1.5 rounded-md text-ink-muted hover:bg-surface-soft"><X size={16} /></button>
          </>
        ) : (
          <>
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noopener noreferrer" aria-label="Download" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft"><Download size={16} /></a>
            )}
            <button type="button" onClick={() => replaceRef.current?.click()} disabled={pending} aria-label="Replace file" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"><RefreshCw size={15} /></button>
            <button type="button" onClick={() => setEditing(true)} disabled={pending} aria-label="Edit" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"><Pencil size={15} /></button>
            <button type="button" onClick={del} disabled={pending} aria-label="Delete" className="p-1.5 rounded-md text-ink-soft hover:bg-surface-soft hover:text-[var(--color-red-deep)] opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"><Trash2 size={15} /></button>
          </>
        )}
      </div>
    </div>
  );
}
