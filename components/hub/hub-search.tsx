"use client";

import { Search } from "lucide-react";

const MONO = "var(--font-mono-display)";

/**
 * Hub launchpad search. Looks like the mockup's inline search field but is a
 * real trigger: clicking (or pressing Enter/⌘K within it) opens the app-wide
 * command palette (⌘K), so search is functional from the Hub without
 * duplicating the palette's logic. The palette listens for ⌘K/Ctrl-K on the
 * document, so we re-dispatch that event.
 */
export function HubSearch() {
  function openPalette() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true, bubbles: true }),
    );
  }

  return (
    <div className="flex flex-1 justify-center">
      <button
        type="button"
        onClick={openPalette}
        className="group flex h-[50px] w-full max-w-[580px] items-center gap-3 rounded-xl border border-[#dfe1e6] bg-white px-4 text-left transition-all duration-200 hover:border-[#c9c9ea] hover:shadow-[0_2px_10px_rgba(63,63,148,0.10)] focus-visible:border-[#3f3f94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f94]/25"
        aria-label="Open search"
      >
        <Search className="h-[20px] w-[20px] shrink-0 text-[#9aa0ab] transition-colors group-hover:text-[#3f3f94]" />
        <span className="min-w-0 flex-1 truncate text-[15.5px] text-[#98a0ac]">
          Search by Part No., Material, or Keyword
        </span>
        <span
          className="shrink-0 border-l border-[#e6e8ec] pl-3 text-[13px] font-medium tracking-[0.14em] text-[#8a90a0] transition-colors group-hover:text-[#3f3f94]"
          style={{ fontFamily: MONO }}
        >
          FILTERS
        </span>
      </button>
    </div>
  );
}
