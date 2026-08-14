import Link from "next/link";
import type { Route } from "next";
import { RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/format";

/**
 * "We picked up where you left off."
 *
 * Shown on a new-form page that has resumed the caller's last unfinished draft.
 * It exists because the resume is now AUTOMATIC: without a note, someone opening
 * a blank form and finding it half-filled would reasonably think the app was
 * confused. The "Start fresh" link is the way out, and it is the only way to
 * abandon a draft now that the "Unfinished Forms" list is gone.
 */
export function ResumedDraftNote({
  updatedAt,
  newRoute,
}: {
  updatedAt: Date;
  /** This form's own new-form route, e.g. "/quotations/new". */
  newRoute: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[#c7cae6] bg-[#f3f3fb] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#3a4152]">
      <RotateCcw size={14} strokeWidth={2.5} className="shrink-0 text-[#3f3f94]" />
      Picked up your unsaved work from{" "}
      <span className="tabular-nums text-ink-strong">{formatDate(updatedAt)}</span>.
      <Link
        href={`${newRoute}?fresh=1` as Route}
        className="font-bold text-[#3f3f94] underline underline-offset-2 hover:text-[#2f2f6f]"
      >
        Start fresh instead
      </Link>
    </div>
  );
}
