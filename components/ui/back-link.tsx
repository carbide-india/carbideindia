import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";

/**
 * Standard back link — a consistent, accessible "← Label" control used at the
 * top of every detail / sub-page so users always have a clear way back.
 */
export function BackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href as Route}
      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
    >
      <ArrowLeft size={15} strokeWidth={2.4} />
      {label}
    </Link>
  );
}
