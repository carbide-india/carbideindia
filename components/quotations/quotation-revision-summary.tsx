"use client";

import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import type { QuotationRevisionCounts } from "@/lib/queries/quotations";

/**
 * Original-vs-revised summary for the Quotation register: three clickable tiles
 * (All / Originals / Revised) showing how many quotes fall in each. Clicking a
 * tile drills the register to that set via `?rev=`; the active tile is
 * highlighted, and clicking it again clears the filter. Green = originals, red =
 * revised, matching the quote-number colouring in the table.
 */
export function QuotationRevisionSummary({
  counts,
  active,
}: {
  counts: QuotationRevisionCounts;
  active: "original" | "revised" | null;
}) {
  const tiles: {
    key: "all" | "original" | "revised";
    label: string;
    value: number;
    color: string;
    href: Route;
  }[] = [
    { key: "all", label: "All Quotes", value: counts.total, color: "#454595", href: "/quotations" as Route },
    { key: "original", label: "Originals", value: counts.originals, color: "#16a34a", href: "/quotations?rev=original" as Route },
    { key: "revised", label: "Revised", value: counts.revised, color: "#d03232", href: "/quotations?rev=revised" as Route },
  ];

  return (
    <div className="mb-4 grid grid-cols-3 gap-2.5 sm:max-w-[560px]">
      {tiles.map((t) => {
        const isActive = t.key === "all" ? active === null : active === t.key;
        // Clicking the active Originals/Revised tile clears the filter.
        const href = isActive && t.key !== "all" ? ("/quotations" as Route) : t.href;
        return (
          <Link
            key={t.key}
            href={href}
            className={cn(
              "rounded-lg border bg-surface-card px-3 py-2.5 transition-all hover:-translate-y-px",
              isActive ? "shadow-[0_2px_10px_rgba(15,23,42,0.10)]" : "hover:shadow-sm",
            )}
            style={{
              borderColor: isActive
                ? `color-mix(in srgb, ${t.color} 55%, transparent)`
                : "var(--color-hairline)",
              background: isActive
                ? `color-mix(in srgb, ${t.color} 7%, transparent)`
                : undefined,
            }}
          >
            <div className="text-[24px] font-black leading-none tabular-nums" style={{ color: t.color }}>
              {t.value}
            </div>
            <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
              {t.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
