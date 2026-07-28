"use client";

import { Search } from "lucide-react";

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
        className="group flex h-[50px] w-full max-w-[580px] items-center gap-3 rounded-xl border-[1.5px] border-[#c9c9ea] bg-[#f7f7fd] px-4 text-left shadow-[inset_0_1px_3px_rgba(63,63,148,0.07)] transition-all duration-200 hover:border-[#3f3f94] hover:bg-white hover:shadow-[0_2px_12px_rgba(63,63,148,0.15)] focus-visible:border-[#3f3f94] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f94]/25"
        aria-label="Open search"
      >
        <Search className="h-[20px] w-[20px] shrink-0 text-[#9aa0ab] transition-colors group-hover:text-[#3f3f94]" />
        <span className="min-w-0 flex-1 truncate text-[15.5px] text-[#98a0ac]">
          Search by Part No., Material, or Keyword
        </span>
      </button>
    </div>
  );
}
