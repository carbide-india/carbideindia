"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import type { QuotationRevisionChain } from "@/lib/queries/quotations";
import { QuotationRevisionTimeline } from "./quotation-revision-history";

/**
 * Revision Log browser (client): search across revised quotes, and per quote
 * choose exactly which revisions to compare (e.g. only R1 and R5, or just the
 * latest). Selection is view-only — it hides/shows columns; the change
 * highlighting is still computed over the full chain inside the timeline.
 */

type Chain = QuotationRevisionChain;

function chipLabel(revisionNo: number, isOriginal: boolean): string {
  return isOriginal ? "Original" : `R${Math.max(1, revisionNo - 1)}`;
}

export function RevisionLogBrowser({ chains }: { chains: Chain[] }) {
  const [q, setQ] = React.useState("");
  // Selected revision ids per chain — default: all.
  const [selected, setSelected] = React.useState<Record<string, string[]>>(() =>
    Object.fromEntries(chains.map((c) => [c.rootId, c.entries.map((e) => e.id)])),
  );

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? chains.filter((c) =>
        `${c.baseQuoteNo} ${c.companyName ?? ""}`.toLowerCase().includes(needle),
      )
    : chains;

  const toggle = (rootId: string, id: string) =>
    setSelected((prev) => {
      const cur = prev[rootId] ?? [];
      return {
        ...prev,
        [rootId]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
      };
    });

  const setPreset = (chain: Chain, preset: "all" | "latest" | "firstlast") => {
    const ids = chain.entries.map((e) => e.id);
    const first = ids[0]!;
    const last = ids[ids.length - 1]!;
    const next =
      preset === "all" ? ids : preset === "latest" ? [last] : Array.from(new Set([first, last]));
    setSelected((prev) => ({ ...prev, [chain.rootId]: next }));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <div className="relative max-w-[440px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by quote number or company…"
          className="h-10 w-full rounded-lg border border-hairline bg-surface-card pl-9 pr-9 text-[13.5px] text-ink-strong outline-none transition-colors focus:border-[#454595] focus:ring-2 focus:ring-[#454595]/20"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-subtle hover:text-ink-strong"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-[#e2dfdc] bg-white p-10 text-center text-[13.5px] text-[#777985]">
          {chains.length === 0
            ? "No quotations have been revised yet."
            : "No revised quotes match your search."}
        </div>
      ) : (
        filtered.map((chain) => {
          const sel = selected[chain.rootId] ?? chain.entries.map((e) => e.id);
          const revs = chain.entries.length - 1;
          // Newest-first for the chip row.
          const chips = [...chain.entries].reverse();
          return (
            <section
              key={chain.rootId}
              className="rounded-section border border-[#e2dfdc] bg-white p-5"
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[15px] font-black text-[#1f2547]">
                  {chain.baseQuoteNo}
                </span>
                {chain.companyName && (
                  <span className="text-[13px] font-semibold text-[#57534e]">
                    {chain.companyName}
                  </span>
                )}
                <span className="ml-auto rounded-[4px] bg-[#d03232]/10 px-2 py-0.5 text-[11px] font-bold text-[#d03232]">
                  {revs} revision{revs === 1 ? "" : "s"}
                </span>
              </div>

              {/* Presets + per-revision toggles */}
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                  Show:
                </span>
                {(
                  [
                    ["all", "All"],
                    ["latest", "Latest only"],
                    ["firstlast", "First & latest"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(chain, key)}
                    className="rounded-pill border border-hairline bg-surface-soft px-2.5 py-1 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-[#454595] hover:text-[#454595]"
                  >
                    {label}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-hairline" />
                {chips.map((e, i) => {
                  const isOriginal = i === chips.length - 1;
                  const active = sel.includes(e.id);
                  const color = isOriginal ? "#16a34a" : "#d03232";
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggle(chain.rootId, e.id)}
                      aria-pressed={active}
                      className="rounded-pill px-2.5 py-1 text-[11.5px] font-bold transition-all"
                      style={
                        active
                          ? {
                              color: "#fff",
                              background: color,
                              border: `1px solid ${color}`,
                            }
                          : {
                              color,
                              background: `color-mix(in srgb, ${color} 8%, transparent)`,
                              border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
                            }
                      }
                    >
                      {chipLabel(e.revisionNo, isOriginal)}
                    </button>
                  );
                })}
              </div>

              <QuotationRevisionTimeline entries={chain.entries} visibleIds={sel} />
            </section>
          );
        })
      )}
    </div>
  );
}
