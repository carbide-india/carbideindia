import Link from "next/link";
import type { Route } from "next";
import { FileClock } from "lucide-react";

interface Props {
  /** Approved+locked product lines with no quotation line yet - the stage's
   *  inflow. Rendered as a note, NOT as a bucket: these rows are not in the
   *  register, so no tile could filter to them. */
  readyToQuote: number;
}

export function QuotationBucketStrip({ readyToQuote }: Props) {
  if (readyToQuote <= 0) return null;
  return (
    <p className="mb-5 flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
      <FileClock size={13} strokeWidth={2.4} className="text-brand" />
      <span className="tabular-nums text-ink-strong">{readyToQuote}</span>
      {readyToQuote === 1 ? "product line has" : "product lines have"} an approved
      &amp; locked costing but no quotation yet
      <Link href={"/quotations/new" as Route} className="font-bold text-brand hover:underline">
        - start one
      </Link>
    </p>
  );
}
