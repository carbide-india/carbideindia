"use client";

import { ArrowUpRight, CheckCircle2, CircleDashed } from "lucide-react";
import type { NegotiationStage } from "@/db/enums";
import { formatInr } from "@/lib/format";
import { NegotiationStageStrip } from "@/components/negotiations/negotiation-stage-strip";

/** Source-quote summary the negotiation was raised from. */
export interface QuoteSendSummary {
  quoteNo: string | null;
  quotePrice: string | null;
  quotationLink: string | null;
  quoteSent: boolean;
}

interface Props {
  negotiationId: string;
  stage: NegotiationStage;
  quoteSend: QuoteSendSummary;
}

function money(value: string | null): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "—";
}

/**
 * QUOTE SEND anchor — the top-of-negotiation grouping (like Form 04). Shows the
 * 4-stage PI progress strip, the source quote's identity (quote no, quote
 * price, document link, whether it was sent), and the prominent trigger to
 * Issue a Proforma Invoice (PI). Client-facing wording is always "Proforma
 * Invoice (PI)", never "Revised Quote".
 */
export function QuoteSendHeader({ stage, quoteSend }: Props) {
  return (
    <section
      className="flex flex-col gap-5 rounded-section border border-hairline bg-surface-card p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      {/* Stage strip */}
      <NegotiationStageStrip stage={stage} />

      {/* Quote send summary */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-t border-hairline pt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              Quote Send
            </h2>
            <span
              className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: quoteSend.quoteSent
                  ? "color-mix(in srgb, var(--color-green) 14%, transparent)"
                  : "var(--color-surface-soft)",
                color: quoteSend.quoteSent
                  ? "var(--color-green-deep)"
                  : "var(--color-ink-subtle)",
                border: `1px solid ${
                  quoteSend.quoteSent
                    ? "color-mix(in srgb, var(--color-green) 30%, transparent)"
                    : "var(--color-hairline)"
                }`,
              }}
            >
              {quoteSend.quoteSent ? (
                <CheckCircle2 size={12} strokeWidth={2.6} />
              ) : (
                <CircleDashed size={12} strokeWidth={2.6} />
              )}
              {quoteSend.quoteSent ? "Quote sent" : "Quote not sent"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Stat label="Quote No" value={quoteSend.quoteNo ?? "—"} mono />
            <Stat label="Quote Price" value={money(quoteSend.quotePrice)} emphasis />
            {quoteSend.quotationLink && (
              <a
                href={quoteSend.quotationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 self-end text-[13.5px] font-semibold text-brand hover:underline"
              >
                Open quotation
                <ArrowUpRight size={13} strokeWidth={2.4} />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
        {label}
      </span>
      <span
        className="tabular-nums text-ink-strong"
        style={{
          fontFamily: mono ? "var(--font-mono)" : undefined,
          fontWeight: emphasis ? 800 : 600,
          fontSize: emphasis ? 18 : 14.5,
        }}
      >
        {value}
      </span>
    </div>
  );
}
