"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ₹-prefixed number input — the rupee sign sits INSIDE the field so the amount
 * always reads as money. Shared across every pricing form (quotation, costing,
 * negotiation, sales order) so the treatment is identical everywhere.
 *
 * WHY the padding is inline (not a `pl-*` class): the `.nt-input` rule declares
 * `padding: 11px 15px` as UNLAYERED CSS, which beats a Tailwind `pl-*` utility
 * (utilities live in a cascade layer). So a `pl-7` class was being ignored and
 * the ₹ glyph got cramped / clipped against the left edge. An inline
 * `paddingLeft` has the highest specificity and always wins — the ₹ gets its
 * guaranteed room.
 */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function MoneyInput({ className, style, ...props }, ref) {
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold leading-none text-ink-subtle">
        ₹
      </span>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        placeholder="0"
        className={cn("nt-input w-full tabular-nums", className)}
        style={{ paddingLeft: 32, ...style }}
        {...props}
      />
    </div>
  );
});
