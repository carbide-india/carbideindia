"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Factory,
  FileSignature,
  History,
  Loader2,
  Paperclip,
  UserRound,
} from "lucide-react";
import type { CustomerPoRevision, SalesOrder } from "@/db/schema";
import {
  attachCustomerPo,
  issueSalesOrder,
  reviseCustomerPo,
  reviseSalesOrder,
} from "@/app/(app)/sales-orders/issue-actions";
import { SectionCard } from "@/components/inquiries/form-field";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Everything that happens to a sales order after the deal is won, in one card.
 *
 * The order matters and it is the order of the actual job: you get the client's
 * PO, you issue the order to the factory, you confirm it to the customer. So the
 * card reads top to bottom in exactly that sequence, and a step that cannot run
 * yet says why rather than sitting there greyed and mute — "Attach the client PO
 * before issuing" is a smaller sentence than the ten minutes somebody spends
 * wondering which button is broken.
 *
 * The two Issue rows are separate because they are separate events (Hetesh:
 * "Show SO Issued to Production. Show SO Issued to Cust separately"). Production
 * usually goes first and the customer sometimes never gets a copy at all; one
 * combined flag would misreport both.
 *
 * Revise sits at the bottom, quietly. It is the rarest thing you do here and the
 * most consequential — an order already on the factory floor is about to change.
 */

interface Props {
  salesOrder: SalesOrder;
  poHistory: CustomerPoRevision[];
  /** Names for the "issued by" line, keyed by employee id. */
  employeeNames: Record<string, string>;
}

export function SoIssueCard({ salesOrder, poHistory, employeeNames }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"attach" | "revise-po" | "revise-so" | null>(
    null,
  );
  const [issuing, setIssuing] = React.useState<"production" | "customer" | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);

  const hasPo = Boolean(salesOrder.customerPoNo);
  const superseded = !salesOrder.isLatestRevision;

  async function issue(to: "production" | "customer") {
    setIssuing(to);
    try {
      const res = await issueSalesOrder({ salesOrderId: salesOrder.id, to });
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({
        message: `${salesOrder.soNo} issued to ${to === "production" ? "production" : "the customer"}.`,
      });
      router.refresh();
    } finally {
      setIssuing(null);
    }
  }

  return (
    <>
      <SectionCard
        title="Client PO & Issue"
        hint="The customer's purchase order, then the two copies of this order — to the factory and to the customer. Each is recorded with who issued it and when."
      >
        <div className="flex flex-col gap-5">
          {/* ── 1. Client PO ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-hairline bg-[#fbfbfd] p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                  Client PO
                  {salesOrder.customerPoRevisionNo > 1 && (
                    <span className="ml-1.5 rounded-pill bg-[#efeffb] px-1.5 py-0.5 text-[10px] text-[#3f3f94]">
                      Rev {salesOrder.customerPoRevisionNo}
                    </span>
                  )}
                </p>
                {hasPo ? (
                  <>
                    <p className="mt-1 text-[15px] font-black tracking-tight text-ink-strong">
                      {salesOrder.customerPoNo}
                    </p>
                    <p className="mt-0.5 text-[12px] font-semibold text-ink-soft">
                      {salesOrder.customerPoDate
                        ? formatDate(salesOrder.customerPoDate)
                        : "No PO date recorded"}
                      {salesOrder.customerPoLink && (
                        <>
                          {" · "}
                          <a
                            href={salesOrder.customerPoLink}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-[#3f3f94] underline underline-offset-2"
                          >
                            Open document
                          </a>
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] font-semibold text-ink-soft">
                    Nothing attached yet. Nothing can be issued until it is.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setDialog(hasPo ? "revise-po" : "attach")}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border-[1.5px] border-[#c9cbe0] px-3.5 text-[12.5px] font-extrabold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#efeffb]"
              >
                <Paperclip size={14} strokeWidth={2.4} />
                {hasPo ? "Revise Cust PO" : "Attach Client PO"}
              </button>
            </div>

            {poHistory.length > 0 && (
              <div className="mt-3 border-t border-hairline pt-2.5">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-ink-soft hover:text-[#3f3f94]"
                >
                  <History size={13} strokeWidth={2.4} />
                  {showHistory ? "Hide" : "Show"} {poHistory.length} superseded{" "}
                  {poHistory.length === 1 ? "PO" : "POs"}
                </button>
                {showHistory && (
                  <ul className="mt-2 flex flex-col gap-2">
                    {poHistory.map((h) => (
                      <li
                        key={h.id}
                        className="rounded-lg border border-hairline bg-white px-3 py-2"
                      >
                        <p className="text-[12.5px] font-bold text-ink-strong">
                          Rev {h.revisionNo} · {h.customerPoNo ?? "—"}
                          {h.customerPoDate && (
                            <span className="font-semibold text-ink-soft">
                              {" "}
                              · {formatDate(h.customerPoDate)}
                            </span>
                          )}
                        </p>
                        {h.reason && (
                          <p className="mt-0.5 text-[12px] font-medium text-ink-soft">
                            {h.reason}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] font-semibold text-ink-subtle">
                          Replaced {formatDate(h.supersededAt)}
                          {h.supersededById && employeeNames[h.supersededById]
                            ? ` by ${employeeNames[h.supersededById]}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* ── 2. Issue ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <IssueRow
              title="SO Issued to Production"
              Icon={Factory}
              blurb="The factory copy — internal grade, production part numbers, production notes."
              sent={salesOrder.productionSoSent}
              sentAt={salesOrder.productionSoSentAt}
              sentBy={
                salesOrder.productionSoSentById
                  ? (employeeNames[salesOrder.productionSoSentById] ?? null)
                  : null
              }
              disabledReason={
                superseded
                  ? "This revision has been superseded."
                  : hasPo
                    ? null
                    : "Attach the client PO first."
              }
              pending={issuing === "production"}
              onIssue={() => void issue("production")}
            />
            <IssueRow
              title="SO Issued to Customer"
              Icon={UserRound}
              blurb="The customer copy — order header, their PO, commercial terms."
              sent={salesOrder.customerSoSent}
              sentAt={salesOrder.customerSoSentAt}
              sentBy={
                salesOrder.customerSoSentById
                  ? (employeeNames[salesOrder.customerSoSentById] ?? null)
                  : null
              }
              disabledReason={
                superseded
                  ? "This revision has been superseded."
                  : hasPo
                    ? null
                    : "Attach the client PO first."
              }
              pending={issuing === "customer"}
              onIssue={() => void issue("customer")}
            />
          </div>

          {/* ── 3. Revise ────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3.5">
            <p className="text-[12px] font-semibold text-ink-soft">
              {superseded ? (
                <>
                  Revision {salesOrder.revisionNo} — superseded. Open the latest
                  revision to make changes.
                </>
              ) : salesOrder.revisionNo > 1 ? (
                <>
                  Revision {salesOrder.revisionNo}
                  {salesOrder.revisionReason ? ` — ${salesOrder.revisionReason}` : ""}
                </>
              ) : (
                <>Revising freezes this order and opens a copy at R2.</>
              )}
            </p>
            {!superseded && (
              <button
                type="button"
                onClick={() => setDialog("revise-so")}
                className="inline-flex h-9 items-center gap-1.5 rounded-pill border-[1.5px] border-[#f0d3a4] bg-[#fdf6e7] px-3.5 text-[12.5px] font-extrabold text-[#8a5a08] transition hover:border-[#b45309] hover:bg-[#f9ecd2]"
              >
                <FileSignature size={14} strokeWidth={2.4} />
                Revise SO
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      {dialog === "attach" && (
        <PoDialog
          mode="attach"
          salesOrderId={salesOrder.id}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}
      {dialog === "revise-po" && (
        <PoDialog
          mode="revise"
          salesOrderId={salesOrder.id}
          currentPoNo={salesOrder.customerPoNo}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}
      {dialog === "revise-so" && (
        <ReviseSoDialog
          salesOrderId={salesOrder.id}
          soNo={salesOrder.soNo}
          issued={salesOrder.productionSoSent || salesOrder.customerSoSent}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            if (id) router.push(`/sales-orders/${id}`);
            else router.refresh();
          }}
        />
      )}
    </>
  );
}

// ── One issue row ─────────────────────────────────────────────────────────

function IssueRow({
  title,
  Icon,
  blurb,
  sent,
  sentAt,
  sentBy,
  disabledReason,
  pending,
  onIssue,
}: {
  title: string;
  Icon: typeof Factory;
  blurb: string;
  sent: boolean;
  sentAt: Date | null;
  sentBy: string | null;
  /** Null when it can be issued; otherwise the reason, shown in place of it. */
  disabledReason: string | null;
  pending: boolean;
  onIssue: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border-[1.5px] p-3.5",
        sent ? "border-[#b7e0c6] bg-[#eef8f2]" : "border-hairline bg-white",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          size={15}
          strokeWidth={2.4}
          className="shrink-0"
          style={{ color: sent ? "#1c7a44" : "#6b7280" }}
        />
        <p
          className="text-[12.5px] font-black tracking-tight"
          style={{ color: sent ? "#1c7a44" : "var(--color-ink-strong)" }}
        >
          {title}
        </p>
      </div>

      {sent ? (
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#1c7a44]">
          <CheckCircle2 size={13} strokeWidth={2.6} />
          {sentAt ? formatDate(sentAt) : "Issued"}
          {sentBy ? ` · ${sentBy}` : ""}
        </p>
      ) : (
        <>
          <p className="text-[11.5px] font-medium leading-snug text-ink-soft">{blurb}</p>
          {disabledReason ? (
            <p className="text-[11.5px] font-bold text-[#8a5a08]">{disabledReason}</p>
          ) : (
            <button
              type="button"
              onClick={onIssue}
              disabled={pending}
              className="inline-flex h-9 w-fit items-center gap-1.5 rounded-pill px-4 text-[12.5px] font-extrabold text-white transition-opacity disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))" }}
            >
              {pending && (
                <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} />
              )}
              {pending ? "Issuing…" : "Issue SO"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────────

function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  busy,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 p-4 sm:p-10"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-[min(94vw,520px)] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-hairline px-5 py-4">
          <h2 className="text-[16px] font-black tracking-tight text-ink-strong">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[12.5px] font-semibold text-ink-soft">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-col gap-3 p-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline bg-[#f9fafc] px-5 py-3.5">
          {footer}
        </div>
      </div>
    </div>
  );
}

const LABEL = "text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle";

function PoDialog({
  mode,
  salesOrderId,
  currentPoNo,
  onClose,
  onDone,
}: {
  mode: "attach" | "revise";
  salesOrderId: string;
  currentPoNo?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [poNo, setPoNo] = React.useState("");
  const [poDate, setPoDate] = React.useState("");
  const [poLink, setPoLink] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const isRevise = mode === "revise";
  const blocked = poNo.trim().length === 0 || (isRevise && reason.trim().length < 3);

  async function submit() {
    setBusy(true);
    try {
      const base = {
        salesOrderId,
        customerPoNo: poNo,
        customerPoDate: poDate || undefined,
        customerPoLink: poLink || undefined,
      };
      const res = isRevise
        ? await reviseCustomerPo({ ...base, reason })
        : await attachCustomerPo(base);
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({ message: isRevise ? "Customer PO revised." : "Client PO attached." });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isRevise ? "Revise Cust PO" : "Attach Client PO"}
      subtitle={
        isRevise
          ? `${currentPoNo ?? "The current PO"} will be filed as a superseded revision — it stays readable.`
          : "The purchase order the customer sent. Nothing can be issued until this is on the order."
      }
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded-pill px-4 text-[13px] font-bold text-ink-soft hover:text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || blocked}
            className="inline-flex h-9 items-center gap-2 rounded-pill px-5 text-[13px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))" }}
          >
            {busy && <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />}
            {busy ? "Saving…" : isRevise ? "Revise PO" : "Attach PO"}
          </button>
        </>
      }
    >
      <label className={LABEL}>Customer PO number</label>
      <input
        autoFocus
        className="nt-input"
        value={poNo}
        onChange={(e) => setPoNo(e.target.value)}
        placeholder="As printed on their PO"
      />
      <label className={LABEL}>PO date</label>
      <input
        type="date"
        className="nt-input"
        value={poDate}
        onChange={(e) => setPoDate(e.target.value)}
      />
      <label className={LABEL}>PO document link</label>
      <input
        className="nt-input"
        value={poLink}
        onChange={(e) => setPoLink(e.target.value)}
        placeholder="Optional — where the scanned PO lives"
      />
      {isRevise && (
        <>
          <label className={LABEL}>What changed (required)</label>
          <textarea
            rows={3}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Quantity revised from 500 to 750, rest unchanged."
          />
        </>
      )}
    </Modal>
  );
}

function ReviseSoDialog({
  salesOrderId,
  soNo,
  issued,
  onClose,
  onDone,
}: {
  salesOrderId: string;
  soNo: string;
  /** Whether either copy has already gone out — changes what this costs. */
  issued: boolean;
  onClose: () => void;
  onDone: (newId?: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await reviseSalesOrder({ salesOrderId, reason });
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({ message: `${res.soNo ?? "Revision"} opened.` });
      onDone(res.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Revise SO"
      subtitle={
        issued
          ? `${soNo} has already been issued. It will be frozen exactly as issued, and a new revision opened — issued to nobody.`
          : `${soNo} will be frozen and a new revision opened.`
      }
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded-pill px-4 text-[13px] font-bold text-ink-soft hover:text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || reason.trim().length < 3}
            className="inline-flex h-9 items-center gap-2 rounded-pill px-5 text-[13px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))" }}
          >
            {busy && <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />}
            {busy ? "Opening…" : "Open revision"}
          </button>
        </>
      }
    >
      <label className={LABEL}>Why is it being revised (required)</label>
      <textarea
        autoFocus
        rows={4}
        className="nt-input resize-y"
        style={{ fontWeight: 400 }}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Customer revised the PO quantity — delivery schedule reworked."
      />
      <p className="text-[11.5px] font-semibold text-ink-subtle">
        The frozen revision stays open to read, so what the factory and the customer
        were given is never lost.
      </p>
    </Modal>
  );
}
