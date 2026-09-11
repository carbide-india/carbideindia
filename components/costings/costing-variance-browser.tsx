"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import type { CostingVarianceChain } from "@/lib/queries/costings";
import { CostingRevisionTimeline } from "./costing-revision-timeline";

/**
 * Costing Variance browser — the costing analogue of the Quotation Revision Log,
 * built with the SAME layout + functionality: search across re-costed lines,
 * per-line presets (All / Latest only / First & latest) and per-version toggle
 * chips that hide/show columns, over a side-by-side parameter comparison table
 * (`CostingRevisionTimeline`). Change highlighting is computed over the full
 * chain regardless of which columns are shown.
 */

type Chain = CostingVarianceChain;

export function CostingVarianceBrowser({ chains }: { chains: Chain[] }) {
  const [q, setQ] = React.useState("");
  // Selected version ids per chain — default: all.
  const [selected, setSelected] = React.useState<Record<string, string[]>>(() =>
    Object.fromEntries(chains.map((c) => [c.inquiryItemId, c.entries.map((e) => e.id)])),
  );

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? chains.filter((c) =>
        `${c.smNumber ?? ""} ${c.companyName ?? ""} ${c.custProductName ?? ""} ${c.entries
          .map((e) => e.code)
          .join(" ")}`
          .toLowerCase()
          .includes(needle),
      )
    : chains;

  const toggle = (chainId: string, id: string) =>
    setSelected((prev) => {
      const cur = prev[chainId] ?? [];
      return {
        ...prev,
        [chainId]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
      };
    });

  const setPreset = (chain: Chain, preset: "all" | "latest" | "firstlast") => {
    const ids = chain.entries.map((e) => e.id);
    const first = ids[0]!;
    const last = ids[ids.length - 1]!;
    const next =
      preset === "all" ? ids : preset === "latest" ? [last] : Array.from(new Set([first, last]));
    setSelected((prev) => ({ ...prev, [chain.inquiryItemId]: next }));
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
          placeholder="Search by SM, company, product or costing code…"
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
            ? "No product line has more than one costing yet."
            : "No re-costed lines match your search."}
        </div>
      ) : (
        filtered.map((chain) => {
          const sel = selected[chain.inquiryItemId] ?? chain.entries.map((e) => e.id);
          const versions = chain.entries.length;
          // Newest-first for the chip row.
          const chips = [...chain.entries].reverse();
          return (
            <section
              key={chain.inquiryItemId}
              className="rounded-section border border-[#e2dfdc] bg-white p-5"
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[15px] font-black text-[#1f2547]">
                  {chain.smNumber ?? "—"}
                </span>
                {chain.custProductName && (
                  <span className="text-[13px] font-semibold text-[#57534e]">
                    {chain.custProductName}
                  </span>
                )}
                {chain.companyName && (
                  <span className="text-[13px] text-[#57534e]">· {chain.companyName}</span>
                )}
                <span className="ml-auto rounded-[4px] bg-[#d03232]/10 px-2 py-0.5 text-[11px] font-bold text-[#d03232]">
                  {versions} versions
                </span>
              </div>

              {/* Presets + per-version toggles */}
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
                  const isBase = i === chips.length - 1;
                  const active = sel.includes(e.id);
                  const color = isBase ? "#16a34a" : "#d03232";
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggle(chain.inquiryItemId, e.id)}
                      aria-pressed={active}
                      className="rounded-pill px-2.5 py-1 text-[11.5px] font-bold transition-all"
                      style={
                        active
                          ? { color: "#fff", background: color, border: `1px solid ${color}` }
                          : {
                              color,
                              background: `color-mix(in srgb, ${color} 8%, transparent)`,
                              border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
                            }
                      }
                    >
                      {e.code}
                    </button>
                  );
                })}
              </div>

              <CostingRevisionTimeline entries={chain.entries} visibleIds={sel} />
            </section>
          );
        })
      )}
    </div>
  );
}
