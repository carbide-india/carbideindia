"use client";

import { Check, Minus } from "lucide-react";

/**
 * Controlled checkbox with an indeterminate ("mixed") state, styled to match
 * the app's chip language. Stops click propagation so ticking a row checkbox
 * never triggers the row's own click/navigation.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  className = "",
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const mixed = indeterminate && !checked;
  const filled = checked || mixed;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
        filled
          ? "bg-brand border-brand text-white"
          : "bg-white border-[#9aa1b0] text-transparent shadow-[0_1px_1.5px_rgba(15,23,42,0.08)] hover:border-brand hover:bg-[#f4f4fd]"
      } ${className}`}
    >
      {mixed ? (
        <Minus size={13} strokeWidth={3} />
      ) : checked ? (
        <Check size={13} strokeWidth={3} />
      ) : null}
    </button>
  );
}
