"use client";

import { Search } from "lucide-react";

/**
 * App-wide search affordance. A single icon button (no full bar) that opens the
 * app-wide command palette (⌘K) on click — the palette listens for ⌘K/Ctrl-K on
 * the document, so we re-dispatch that event. Used in the Hub header and every
 * module shell header.
 */
export function HubSearch() {
  function openPalette() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true, bubbles: true }),
    );
  }

  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Search"
      title="Search (Ctrl K)"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#4b5563] transition-colors hover:bg-[#eef1fb] hover:text-[#3f3f94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f94]/30"
    >
      <Search className="h-[20px] w-[20px]" strokeWidth={2.1} />
    </button>
  );
}
