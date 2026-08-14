import Link from "next/link";
import type { Route } from "next";

/**
 * "Carbide India" in the top-left of every module header.
 *
 * It sits directly above the sidebar's first row, so the brand reads as the
 * masthead of the whole app rather than decoration inside a stage. Clicking it
 * is the way back to the Hub — the dedicated "Hub" button was removed from
 * every module header, so the name carries that navigation now.
 *
 * The centred module-title pill that used to sit mid-header is gone with it:
 * the sidebar already names the module one row below, and the two together read
 * as the same word twice.
 */
export function ModuleBrand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link
      href={"/hub" as Route}
      aria-label="Carbide India — back to the Hub"
      title="Back to the Hub"
      className="shrink-0 whitespace-nowrap rounded-lg px-1.5 py-1 text-[19px] font-extrabold leading-none tracking-tight text-[#3f3f94] transition-colors hover:text-[#2f2f6f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f94]/35"
    >
      {/* Collapsed rail is 72px — only the short form fits above it. */}
      {collapsed ? "CI" : "Carbide India"}
    </Link>
  );
}
