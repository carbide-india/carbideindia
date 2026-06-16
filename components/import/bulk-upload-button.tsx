import Link from "next/link";
import type { Route } from "next";
import { Upload } from "lucide-react";

/** "Bulk upload" link shown on a New-form header (admin-only callers render it). */
export function BulkUploadButton({ href }: { href: string }) {
  return (
    <Link href={href as Route} className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft transition-colors">
      <Upload size={14} strokeWidth={2.4} />
      Bulk upload
    </Link>
  );
}
