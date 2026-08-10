"use client";

import { Printer } from "lucide-react";

/**
 * The one interactive control on a Sales Order copy preview. Kept in its own
 * tiny client island so the copy itself (`SoCopyView`) stays a server component
 * and renders the exact same document object the PDF route renders.
 */
export function PrintCopyButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-hairline-strong hover:bg-surface-soft"
    >
      <Printer size={14} strokeWidth={2.4} />
      Print
    </button>
  );
}
