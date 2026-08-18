"use client";

import { useSetModuleTitle } from "@/components/shell/module-title";

/**
 * A register's name and count.
 *
 * The NAME is published to the module header (beside the brand, level with the
 * end of the sidebar) via `useSetModuleTitle` — it is no longer drawn here.
 * What stays on the toolbar row is the count, which is live: it tracks the
 * rows actually listed, so a filtered register is never mistaken for an empty
 * one. Freeing the name from the toolbar is what lets Columns / Export sit on
 * the same line as the search and filters instead of wrapping below them.
 */
export function RegisterHeading({
  title,
  count,
  unit,
  filterLabel,
}: {
  title: string;
  /** Rows currently listed. */
  count: number;
  /** What one row IS — "enquiry", "line", "quotation". Always say it: the
   *  register's unit and the stage's unit are not always the same thing. */
  unit: string;
  /** Names the active filter, so a filtered register is never mistaken for an
   *  empty one. */
  filterLabel?: string | null;
}) {
  useSetModuleTitle(title);

  return (
    <span className="whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
      {count} {count === 1 ? unit : `${unit}s`}
      {filterLabel ? (
        <span className="ml-1.5 font-bold text-ink-soft">· {filterLabel}</span>
      ) : null}
    </span>
  );
}
