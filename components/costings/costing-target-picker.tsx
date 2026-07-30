"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search, ArrowRight, CheckCircle2 } from "lucide-react";
import type { CostableInquiryItem } from "@/lib/queries/costings";

/**
 * Picker shown when /costings/new is opened without a target product line.
 * A costing must attach to a specific inquiry_item, so instead of a 404 we
 * present the lines that have cleared Primary Feasibility and let the user
 * choose which one to cost. Keyboard-first: type to filter, ↑/↓ to move,
 * Enter to open.
 */
export function CostingTargetPicker({ items }: { items: CostableInquiryItem[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);

  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) =>
      [i.smNumber, i.companyName, i.custProductName]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(t)),
    );
  }, [items, q]);

  React.useEffect(() => {
    setActive(0);
  }, [q]);

  const open = React.useCallback(
    (i: CostableInquiryItem) => {
      router.push(
        `/costings/new?inquiryItemId=${i.inquiryItemId}&inquiryId=${i.inquiryId}` as Route,
      );
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const i = filtered[active];
      if (i) open(i);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <header className="mb-5">
        <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
          Start a Costing
        </h1>
        <p className="mt-1.5 text-[12.5px] font-semibold text-[#6b7280]">
          Pick the enquiry product line to cost. Only lines that have cleared
          Primary Feasibility appear here.
        </p>
      </header>

      <div className="relative mb-3">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa0b4]"
        />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search by SM number, company, or product…"
          className="nt-input w-full"
          style={{ paddingLeft: 38 }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#c6cbdd] bg-white/60 p-10 text-center">
          <p className="text-[15px] font-bold text-[#3f3f94]">
            {items.length === 0
              ? "No product lines are ready to cost yet."
              : "No lines match your search."}
          </p>
          <p className="mt-1.5 text-[12.5px] font-semibold text-[#6b7280]">
            {items.length === 0
              ? "A line becomes costable once its enquiry is approved in Primary Feasibility (status: Proceed to Costing)."
              : "Try a different SM number, company, or product name."}
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border-2 border-[#b7bcd2] bg-white">
          {filtered.map((i, idx) => (
            <li key={i.inquiryItemId}>
              <button
                type="button"
                onMouseEnter={() => setActive(idx)}
                onClick={() => open(i)}
                className={
                  "flex w-full items-center gap-4 border-b border-[#e5e7f0] px-5 py-3.5 text-left transition-colors last:border-b-0 " +
                  (idx === active ? "bg-[#eef0fb]" : "bg-white hover:bg-[#f6f7fd]")
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14.5px] font-black tabular-nums text-[#3f3f94]">
                      {i.smNumber ?? "—"}
                    </span>
                    {i.alreadyCosted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ed] px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide text-[#1c7a44]">
                        <CheckCircle2 size={11} strokeWidth={2.6} />
                        Costed
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[13.5px] font-bold text-[#1f2333]">
                    {i.custProductName ?? "Unnamed product"}
                  </div>
                  <div className="truncate text-[11.5px] font-semibold text-[#6b7280]">
                    {i.companyName ?? "—"}
                  </div>
                </div>
                <ArrowRight
                  size={18}
                  strokeWidth={2.4}
                  className={idx === active ? "text-[#3f3f94]" : "text-[#c6cbdd]"}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
