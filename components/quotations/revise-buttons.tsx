"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Loader2, RotateCcw, Undo2 } from "lucide-react";
import {
  reviseCostingFromQuotation,
  reviseQuotation,
} from "@/app/(app)/quotations/revise-actions";
import { fireToast } from "@/lib/toast";

type Kind = "costing" | "quotation";

const COPY: Record<
  Kind,
  { label: string; title: string; blurb: string; placeholder: string; cta: string }
> = {
  costing: {
    label: "Revise Costing",
    title: "Send the costing back",
    blurb:
      "Opens a new costing revision for every product line on this quote. The approved costing stays frozen and readable — nothing is overwritten. This quotation drops to Need Info until the costing comes back.",
    placeholder: "Why is the costing going back? e.g. RM rate moved, wrong grade used…",
    cta: "Send back to Costing",
  },
  quotation: {
    label: "Revise Quotation",
    title: "Open the next revision",
    blurb:
      "Freezes this quotation and opens a copy at the next revision number. The frozen one keeps its price and, if it was sent, the record of who received it.",
    placeholder: "Why is the quote being revised? e.g. customer asked for 500 nos instead of 100…",
    cta: "Create revision",
  },
};

/**
 * "Revise Costing" / "Revise Quotation" — the two ways work leaves the
 * Quotation stage backwards.
 *
 * Both demand a written reason before they will run. A revision with no reason
 * is unreadable a month later, and both of these change a number a customer may
 * already have seen.
 */
export function ReviseButton({
  kind,
  quotationId,
  disabled,
  disabledHint,
}: {
  kind: Kind;
  quotationId: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const router = useRouter();
  const copy = COPY[kind];
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const Icon = kind === "costing" ? Undo2 : RotateCcw;
  const tooShort = reason.trim().length < 3;

  async function run() {
    setPending(true);
    try {
      if (kind === "costing") {
        const res = await reviseCostingFromQuotation({ quotationId, reason });
        if (!res.ok) {
          fireToast({ type: "error", message: res.error });
          return;
        }
        fireToast({
          type: "success",
          message:
            res.skipped > 0
              ? `${res.revised} costing revision(s) opened · ${res.skipped} could not be revised.`
              : `${res.revised} costing revision(s) opened.`,
        });
        setOpen(false);
        router.refresh();
      } else {
        const res = await reviseQuotation({ quotationId, reason });
        if (!res.ok) {
          fireToast({ type: "error", message: res.error });
          return;
        }
        fireToast({ type: "success", message: `Revision ${res.revisionNo} created.` });
        setOpen(false);
        router.push(`/quotations/${res.id}` as Route);
      }
    } finally {
      setPending(false);
    }
  }

  if (disabled) {
    return (
      <span
        title={disabledHint}
        className="inline-flex h-9 cursor-default items-center gap-1.5 rounded-pill border border-hairline px-3.5 text-[13px] font-bold text-ink-subtle"
      >
        <Icon size={14} strokeWidth={2.3} />
        {copy.label}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-pill border-[1.5px] border-[#c7cae6] bg-white px-3.5 text-[13px] font-bold text-[#3f3f94] transition-colors hover:border-[#3f3f94] hover:bg-[#f3f3fb]"
      >
        <Icon size={14} strokeWidth={2.3} />
        {copy.label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 p-4 sm:p-10"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-[min(94vw,520px)] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-hairline px-5 py-4">
              <h2 className="text-[16px] font-black tracking-tight text-ink-strong">
                {copy.title}
              </h2>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-relaxed text-ink-soft">
                {copy.blurb}
              </p>
            </div>
            <div className="p-5">
              <label className="mb-1.5 block text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                Reason (required)
              </label>
              <textarea
                autoFocus
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={copy.placeholder}
                className="nt-input w-full resize-y"
                style={{ fontWeight: 400 }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-hairline bg-[#f9fafc] px-5 py-3.5">
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
                onClick={() => void run()}
                disabled={pending || tooShort}
                title={tooShort ? "Write a reason first" : undefined}
                className="inline-flex h-9 items-center gap-2 rounded-pill px-5 text-[13px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  background: "#454595",
                }}
              >
                {pending && (
                  <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
                )}
                {pending ? "Working…" : copy.cta}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
