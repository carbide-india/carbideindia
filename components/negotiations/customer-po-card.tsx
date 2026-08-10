"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  CircleDashed,
  Award,
  Loader2,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import {
  markNegotiationAwarded,
  saveCustomerPo,
  acceptAndConvertToSalesOrder,
} from "@/app/(app)/negotiations/actions";
import {
  MAX_DOCUMENT_BYTES,
  safeDocumentName,
  validateDocumentFileShape,
} from "@/lib/documents/upload-validation";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Field, SectionCard } from "@/components/inquiries/form-field";
import { NotesField } from "@/components/ui/notes-field";
import { MoneyInput } from "@/components/ui/money-input";
import type { NegotiationStage } from "@/db/enums";

/** Customer-PO blobs nest under the shared `documents/` prefix the token route enforces. */
const CUSTOMER_PO_PREFIX = "documents/customer-po/";

interface Props {
  negotiationId: string;
  stage: NegotiationStage;
  po: {
    customerPoNo: string | null;
    customerPoDate: Date | null;
    customerPoLink: string | null;
    customerPoRemarks: string | null;
    poMatchStatus: string | null;
  };
  /** Revised total of the latest PI — the amount the PO total is reconciled against. */
  latestPiTotal: string | null;
  /** Presigned download URL for an already-uploaded PO document (page-provided). */
  poDownloadUrl: string | null;
  /** Whether the negotiation is approved — an APPROVED negotiation is what
   *  enables Issue Sales Order (mirrors the server-side gate in
   *  acceptAndConvertToSalesOrder, which is the real authority). */
  approvedForSo: boolean;
}

function num(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function dateInputDefault(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function precheckFile(file: File): string | null {
  if (file.size === 0) return "Pick a file.";
  if (file.size > MAX_DOCUMENT_BYTES) return "File exceeds 25 MB.";
  const shape = validateDocumentFileShape({ name: file.name, contentType: file.type });
  return shape.ok ? null : shape.error;
}

/**
 * Customer PO capture — the tail of the negotiation pipeline. When the stage is
 * `pi_issued` it shows a "Mark Negotiation Awarded" prompt (you cannot capture a
 * PO before the negotiation is won). Once awarded it exposes the PO card: PO No,
 * PO Date, remarks, a PO total to drive the PI↔PO reconciliation, and a real
 * private Blob upload for the PO document (fills customerPoLink). Saving advances
 * the stage to Customer PO Received; the PO-vs-PI match badge reflects
 * poMatchStatus. Finally, "Accept PO → Sales Order" converts and stamps the SO
 * "Okay for processing".
 */
export function CustomerPoCard({
  negotiationId,
  stage,
  po,
  latestPiTotal,
  poDownloadUrl,
  approvedForSo,
}: Props) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [poNo, setPoNo] = React.useState(po.customerPoNo ?? "");
  const [poDate, setPoDate] = React.useState(dateInputDefault(po.customerPoDate));
  const [remarks, setRemarks] = React.useState(po.customerPoRemarks ?? "");
  const [poTotal, setPoTotal] = React.useState<string>("");
  // customerPoLink stores the private blob PATHNAME; keep the pathname + a label.
  const [poPath, setPoPath] = React.useState<string | null>(po.customerPoLink);
  const [poFileName, setPoFileName] = React.useState<string | null>(null);

  const [uploading, setUploading] = React.useState(false);
  const [savingPo, setSavingPo] = React.useState(false);
  const [awarding, setAwarding] = React.useState(false);
  const [accepting, setAccepting] = React.useState(false);

  const awaitingAward = stage === "pi_issued";
  const poReceived = stage === "customer_po_received";
  const hasPo = Boolean((poNo.trim() || poPath) );

  const piTotalNum = num(latestPiTotal);
  const poTotalNum = num(poTotal);
  // Live preview of the reconciliation while the user types the PO total.
  const livematch: "matched" | "mismatch" | null =
    poTotalNum !== undefined && piTotalNum !== undefined
      ? Math.abs(piTotalNum - poTotalNum) < 0.01
        ? "matched"
        : "mismatch"
      : null;

  async function onMarkAwarded(): Promise<void> {
    setAwarding(true);
    try {
      const res = await markNegotiationAwarded(negotiationId);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Negotiation marked awarded." });
      router.refresh();
    } finally {
      setAwarding(false);
    }
  }

  async function onUpload(file: File): Promise<void> {
    const bad = precheckFile(file);
    if (bad) {
      fireToast({ message: bad });
      return;
    }
    setUploading(true);
    try {
      const contentType = file.type || "application/octet-stream";
      const blob = await upload(
        `${CUSTOMER_PO_PREFIX}${negotiationId}/${safeDocumentName(file.name)}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/documents/upload",
          contentType,
          clientPayload: JSON.stringify({ contentType }),
        },
      );
      setPoPath(blob.pathname);
      setPoFileName(file.name);
      fireToast({ message: "PO document attached — save to record it." });
    } catch (err) {
      fireToast({ message: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSavePo(): Promise<void> {
    if (!poNo.trim() && !poPath) {
      fireToast({ message: "Enter a PO number or attach the PO document." });
      return;
    }
    setSavingPo(true);
    try {
      const res = await saveCustomerPo({
        negotiationId,
        customerPoNo: poNo.trim() || undefined,
        customerPoDate: poDate || undefined,
        customerPoLink: poPath ?? undefined,
        customerPoRemarks: remarks.trim() || undefined,
        poTotal: poTotalNum,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Customer PO saved." });
      router.refresh();
    } finally {
      setSavingPo(false);
    }
  }

  async function onAccept(): Promise<void> {
    setAccepting(true);
    try {
      const res = await acceptAndConvertToSalesOrder(negotiationId);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: "Sales order created — stamped “Okay for processing”.",
        type: "success",
      });
      router.push(`/sales-orders/${res.id}` as Route);
    } finally {
      setAccepting(false);
    }
  }

  // ── pi_issued: only the award prompt ──────────────────────────────────────
  if (awaitingAward) {
    return (
      <SectionCard
        title="Customer PO"
        hint="Mark the negotiation awarded to start capturing the customer purchase order."
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-hairline bg-surface-soft px-4 py-4">
          <p className="text-[13.5px] text-ink-muted">
            A proforma invoice has been issued. Once the customer confirms, mark the
            negotiation awarded.
          </p>
          <button
            type="button"
            onClick={() => void onMarkAwarded()}
            disabled={awarding}
            className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--color-purple), var(--color-purple-deep))",
              boxShadow: "0 6px 16px rgba(124, 58, 237, 0.28)",
            }}
          >
            {awarding ? (
              <Loader2 size={15} style={{ animation: "spinFast 0.8s linear infinite" }} />
            ) : (
              <Award size={16} strokeWidth={2.4} />
            )}
            Mark Negotiation Awarded
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Customer PO"
      hint="Capture the received purchase order, reconcile it against the latest PI, then accept it into a sales order."
    >
      <div className="flex flex-col gap-5">
        {/* Match indicator */}
        <MatchBadge status={po.poMatchStatus} latestPiTotal={latestPiTotal} />

        {/* PO fields */}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="po-no" label="Customer PO No">
            <input
              id="po-no"
              type="text"
              className="nt-input"
              placeholder="e.g. PO/2026/00123"
              value={poNo}
              onChange={(e) => setPoNo(e.target.value)}
            />
          </Field>
          <Field id="po-date" label="Customer PO Date">
            <input
              id="po-date"
              type="date"
              className="nt-input"
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
            />
          </Field>
        </div>

        <Field
          id="po-total"
          label="PO Total (for PI ↔ PO match)"
        >
          <div className="flex flex-col gap-1.5">
            <span className="block w-[220px]">
              <MoneyInput
                id="po-total"
                aria-label="PO total"
                value={poTotal}
                onChange={(e) => setPoTotal(e.target.value)}
              />
            </span>
            {latestPiTotal != null && (
              <span className="text-[12.5px] text-ink-subtle">
                Latest PI total:{" "}
                <span className="tabular-nums font-semibold text-ink-muted">
                  {num(latestPiTotal) !== undefined ? formatInr(num(latestPiTotal)!) : "—"}
                </span>
                {livematch && (
                  <span
                    className="ml-2 font-bold"
                    style={{
                      color:
                        livematch === "matched"
                          ? "var(--color-green-deep)"
                          : "var(--color-red, #D32F2F)",
                    }}
                  >
                    {livematch === "matched" ? "· will match" : "· will mismatch"}
                  </span>
                )}
              </span>
            )}
          </div>
        </Field>

        <Field id="po-remarks" label="PO Remarks">
          <NotesField
            id="po-remarks"
            rows={3}
            ariaLabel="PO remarks"
            placeholder="Delivery instructions, terms noted on the PO, anything worth recording"
            value={remarks}
            onChange={setRemarks}
          />
        </Field>

        {/* PO document upload */}
        <div className="flex flex-col gap-2">
          <span className="font-bold text-[14px] text-ink-strong">PO Document</span>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
            {poPath ? (
              <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
                <FileText size={16} className="text-ink-subtle" />
                {poFileName ?? "PO document attached"}
              </span>
            ) : (
              <span className="text-[13px] text-ink-muted">
                No PO document attached yet (max 25 MB).
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              {poDownloadUrl && (
                <a
                  href={poDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                >
                  View current
                  <ArrowUpRight size={13} strokeWidth={2.4} />
                </a>
              )}
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-hairline-strong hover:bg-surface-soft ${
                  uploading ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <Upload size={15} strokeWidth={2.4} />
                {uploading ? "Uploading…" : poPath ? "Replace" : "Upload PO"}
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,application/pdf"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={() => void onSavePo()}
            disabled={savingPo || uploading}
            className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
            }}
          >
            {savingPo && (
              <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
            )}
            Save Customer PO
          </button>
          <button
            type="button"
            onClick={() => void onAccept()}
            disabled={accepting || !poReceived || !hasPo || !approvedForSo}
            title={
              !poReceived
                ? "Save the customer PO first"
                : !hasPo
                  ? "Record a PO number or document first"
                  : !approvedForSo
                    ? "Approve the negotiation first"
                    : "Convert this negotiation into a sales order"
            }
            className="inline-flex items-center gap-2 rounded-pill px-6 py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
              boxShadow: "0 6px 16px rgba(22, 163, 74, 0.26)",
            }}
          >
            {accepting ? (
              <Loader2 size={15} style={{ animation: "spinFast 0.8s linear infinite" }} />
            ) : (
              <CheckCircle2 size={16} strokeWidth={2.4} />
            )}
            Accept PO → Sales Order
          </button>
        </div>
        <p className="text-right text-[12px] text-ink-subtle">
          {approvedForSo
            ? "Accepting stamps the sales order “Okay for processing”."
            : "Approve the negotiation (above) to unlock Issue Sales Order."}
        </p>
      </div>
    </SectionCard>
  );
}

function MatchBadge({
  status,
  latestPiTotal,
}: {
  status: string | null;
  latestPiTotal: string | null;
}) {
  const has = latestPiTotal != null;
  const config =
    status === "matched"
      ? {
          tone: "green",
          icon: <CheckCircle2 size={16} strokeWidth={2.4} />,
          label: "PO matches the latest PI total",
        }
      : status === "mismatch"
        ? {
            tone: "red",
            icon: <AlertTriangle size={16} strokeWidth={2.4} />,
            label: "PO total does not match the latest PI",
          }
        : {
            tone: "slate",
            icon: <CircleDashed size={16} strokeWidth={2.4} />,
            label: has
              ? "PO total not yet reconciled against the PI"
              : "No PI total to reconcile against yet",
          };
  const isGreen = config.tone === "green";
  const isRed = config.tone === "red";
  const bg = isGreen
    ? "color-mix(in srgb, var(--color-green) 12%, transparent)"
    : isRed
      ? "color-mix(in srgb, #D32F2F 12%, transparent)"
      : "var(--color-surface-soft)";
  const fg = isGreen
    ? "var(--color-green-deep)"
    : isRed
      ? "#D32F2F"
      : "var(--color-ink-muted)";
  const border = isGreen
    ? "color-mix(in srgb, var(--color-green) 30%, transparent)"
    : isRed
      ? "color-mix(in srgb, #D32F2F 30%, transparent)"
      : "var(--color-hairline)";
  return (
    <div
      className="inline-flex items-center gap-2 self-start rounded-xl border px-4 py-2.5 text-[13.5px] font-bold"
      style={{ background: bg, color: fg, borderColor: border }}
    >
      {config.icon}
      {config.label}
    </div>
  );
}
