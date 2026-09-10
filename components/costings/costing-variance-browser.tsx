"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Search, GitCompareArrows, Undo2, Check } from "lucide-react";
import {
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
  COSTING_ROUTE_LABELS,
} from "@/db/enums";
import { Chip } from "@/components/inquiries/chip";
import { formatInr, formatDate } from "@/lib/format";
import type { CostingVarianceChain } from "@/lib/queries/costings";

/**
 * Costing Variance Log — every product line that has more than one costing
 * version (a revision `-R1`/`-R2`, and/or a second series `C02`), newest
 * activity first. Each version shows its code (green original / red revision),
 * status, cost, why it was opened, and whether a quotation/negotiation sent it
 * back. The costing analogue of the Quotation Revision Log.
 */
export function CostingVarianceBrowser({
  chains,
}: {
  chains: CostingVarianceChain[];
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    if (!q) return chains;
    return chains.filter((c) => {
      const hay = [
        c.smNumber,
        c.companyName,
        c.custProductName,
        ...c.entries.map((e) => e.code),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [chains, q]);

  if (chains.length === 0) {
    return (
      <div className="rounded-section border border-dashed border-hairline-strong bg-surface-soft px-6 py-14 text-center">
        <GitCompareArrows size={26} className="mx-auto text-ink-subtle" strokeWidth={1.8} />
        <p className="mt-3 text-[15px] font-bold text-ink-strong">No costing variance yet.</p>
        <p className="mt-1 text-[13px] text-ink-soft">
          A line appears here once it has more than one costing — a revision
          (C01-R1) or a second costing (C02).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 rounded-chip border border-hairline bg-surface-card px-3.5 focus-within:border-brand">
        <Search size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SM, company, product or costing code"
          className="h-11 flex-1 bg-transparent text-[14px] text-ink-strong outline-none placeholder:text-ink-subtle"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-ink-subtle">
          No costing matches “{query}”.
        </p>
      ) : (
        filtered.map((chain) => <ChainCard key={chain.inquiryItemId} chain={chain} />)
      )}
    </div>
  );
}

function ChainCard({ chain }: { chain: CostingVarianceChain }) {
  // Newest version first — that is the one people care about most.
  const versions = [...chain.entries].reverse();
  return (
    <div className="overflow-hidden rounded-section border border-hairline bg-surface-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline bg-surface-soft px-5 py-3.5">
        <span className="font-mono text-[14px] font-black text-ink-strong">
          {chain.smNumber ?? "—"}
        </span>
        <span className="text-[14px] font-semibold text-ink-strong">
          {chain.custProductName ?? "Product"}
        </span>
        {chain.companyName && (
          <span className="text-[13px] text-ink-soft">· {chain.companyName}</span>
        )}
        <span className="ml-auto text-[12px] font-semibold text-ink-subtle">
          {chain.entries.length} versions
        </span>
      </div>

      <ol className="flex flex-col">
        {versions.map((e) => {
          const isRevised = e.revisionNo > 1;
          const codeColor = isRevised ? "#d03232" : "#16a34a";
          return (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-5 py-3 last:border-b-0"
            >
              <span
                className="font-mono text-[13.5px] font-black"
                style={{ color: codeColor }}
              >
                {e.code}
              </span>
              <Chip
                label={COSTING_DONE_STATUS_LABELS[e.status]}
                tone={COSTING_DONE_STATUS_COLORS[e.status]}
              />
              <span className="text-[12px] font-semibold text-ink-subtle">
                {COSTING_ROUTE_LABELS[e.costingType]}
              </span>
              {e.isChosen && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-bold text-brand">
                  <Check size={11} strokeWidth={3} />
                  Chosen
                </span>
              )}
              {e.finalCostPerPiece != null && (
                <span className="text-[13px] font-bold tabular-nums text-ink-strong">
                  {formatInr(Number(e.finalCostPerPiece))}/pc
                </span>
              )}
              <span className="ml-auto text-[12px] text-ink-subtle">
                {formatDate(e.createdAt)}
              </span>
              {(e.revisedFromQuotationId || e.revisedFromNegotiationId || e.revisionReason) && (
                <div className="mt-0.5 flex w-full flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
                  {e.revisedFromQuotationId && (
                    <span className="inline-flex items-center gap-1 rounded-chip bg-amber-bg px-2 py-0.5 text-[11px] font-bold text-amber-deep">
                      <Undo2 size={11} strokeWidth={2.6} />
                      Sent back from Quotation
                    </span>
                  )}
                  {e.revisedFromNegotiationId && (
                    <span className="inline-flex items-center gap-1 rounded-chip bg-amber-bg px-2 py-0.5 text-[11px] font-bold text-amber-deep">
                      <Undo2 size={11} strokeWidth={2.6} />
                      From Negotiation
                    </span>
                  )}
                  {e.revisionReason && (
                    <span className="text-[12px] italic text-ink-soft">“{e.revisionReason}”</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
