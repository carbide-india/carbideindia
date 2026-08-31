"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { sendQuotation } from "@/app/(app)/quotations/actions";
import { fireToast } from "@/lib/toast";

/**
 * "Send Quote" — the customer send, with a preview first.
 *
 * The dialog shows the exact PDF that will be attached and the exact addresses
 * it will go to BEFORE anything leaves the building, because this is the one
 * action in the app that a customer sees and that cannot be taken back. To and
 * CC come from the enquiry; the sender can add addresses and a covering note
 * but never has to retype what is already on file.
 *
 * Only offered once the quotation is APPROVED — sending an unapproved price is
 * the mistake this button could most easily cause.
 */
export function SendQuoteButton({
  quotationId,
  quoteNo,
  approved,
  alreadySent,
  sentAt,
  to,
  cc,
}: {
  quotationId: string;
  quoteNo: string;
  approved: boolean;
  alreadySent: boolean;
  sentAt: string | null;
  /** Resolved from the enquiry, server-side, so the preview is truthful. */
  to: string[];
  cc: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [extraTo, setExtraTo] = React.useState("");
  const [extraCc, setExtraCc] = React.useState("");
  const [message, setMessage] = React.useState("");

  const pdfHref = `/quotations/${quotationId}/quotation.pdf?view=1`;
  const noRecipient = to.length === 0 && extraTo.trim() === "";

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  async function send() {
    setPending(true);
    try {
      const res = await sendQuotation({
        id: quotationId,
        extraTo: extraTo.trim() || null,
        extraCc: extraCc.trim() || null,
        message: message.trim() || null,
      });
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      const n = res.to.length + res.cc.length;
      fireToast({
        type: "success",
        message: `${quoteNo} sent to ${n} recipient${n === 1 ? "" : "s"}.`,
      });
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!approved) {
    return (
      <span
        title="Approve the quotation before sending it to the customer."
        className="inline-flex h-9 cursor-default items-center gap-1.5 rounded-pill border border-hairline px-3.5 text-[13px] font-bold text-ink-subtle"
      >
        <Send size={14} strokeWidth={2.3} />
        Send Quote
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          alreadySent
            ? "inline-flex h-9 items-center gap-1.5 rounded-pill border-[1.5px] border-[#b7e0c6] bg-[#eef8f2] px-3.5 text-[13px] font-bold text-[#1c7a44] transition-colors hover:border-[#16a34a]"
            : "inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
        }
        style={
          alreadySent
            ? undefined
            : {
                background: "#454595",
                boxShadow: "0 4px 12px rgba(63,63,148,0.30)",
              }
        }
      >
        {alreadySent ? (
          <CheckCircle2 size={14} strokeWidth={2.6} />
        ) : (
          <Send size={14} strokeWidth={2.3} />
        )}
        {alreadySent ? "Sent — send again" : "Send Quote"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 p-4 sm:p-8"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-[min(96vw,940px)] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
              <div>
                <h2 className="text-[16px] font-black tracking-tight text-ink-strong">
                  Send {quoteNo} to the customer
                </h2>
                <p className="mt-1 text-[12.5px] font-semibold text-ink-subtle">
                  {alreadySent && sentAt
                    ? `Already sent on ${sentAt}. Sending again will email it a second time.`
                    : "This leaves the building. Check the addresses and the PDF below."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-bold text-ink-subtle hover:text-ink-strong"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,320px)_1fr]">
              <div className="flex flex-col gap-3">
                <Recipients label="To" list={to} emptyHint="No contact email on the enquiry" />
                <input
                  value={extraTo}
                  onChange={(e) => setExtraTo(e.target.value)}
                  placeholder="Add To addresses (comma separated)"
                  className="nt-input"
                />
                <Recipients label="CC" list={cc} emptyHint="No CC on the enquiry" />
                <input
                  value={extraCc}
                  onChange={(e) => setExtraCc(e.target.value)}
                  placeholder="Add CC addresses (comma separated)"
                  className="nt-input"
                />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Covering note (optional) — appears above the summary in the email"
                  className="nt-input resize-y"
                  style={{ fontWeight: 400 }}
                />
              </div>

              {/* The actual attachment, not a mock-up of it. */}
              <div className="min-h-[380px] overflow-hidden rounded-xl border-2 border-[#b7bcd2] bg-[#f4f5fa]">
                <iframe
                  src={pdfHref}
                  title={`${quoteNo} preview`}
                  className="h-[440px] w-full"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-[#f9fafc] px-5 py-3.5">
              <a
                href={`/quotations/${quotationId}/quotation.pdf`}
                className="text-[12.5px] font-bold text-brand hover:underline"
              >
                Download the PDF
              </a>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="h-9 rounded-pill px-4 text-[13px] font-bold text-ink-soft hover:text-ink-strong"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={pending || noRecipient}
                  title={noRecipient ? "Add at least one To address" : undefined}
                  className="inline-flex h-9 items-center gap-2 rounded-pill px-5 text-[13px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                  style={{
                    background: "#454595",
                  }}
                >
                  {pending && (
                    <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
                  )}
                  {pending ? "Sending…" : "Send now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Recipients({
  label,
  list,
  emptyHint,
}: {
  label: string;
  list: string[];
  emptyHint: string;
}) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
        {label} · from the enquiry
      </p>
      {list.length === 0 ? (
        <p className="text-[12.5px] font-semibold text-[#b45309]">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {list.map((e) => (
            <span
              key={e}
              className="inline-flex items-center rounded-chip bg-[#eef0fb] px-2 py-0.5 text-[12px] font-semibold text-[#3f3f94]"
            >
              {e}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
