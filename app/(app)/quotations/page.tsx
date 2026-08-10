import Link from "next/link";
import { Plus } from "lucide-react";
import {
  QuotationTable,
  NEW_QUOTATION_ROUTE,
} from "@/components/quotations/quotation-table";
import { QuotationBucketStrip } from "@/components/quotations/quotation-bucket-strip";
import { parseQuotationSelection } from "@/components/quotations/quotation-buckets";
import { QUOTATION_STATUS_LABELS } from "@/db/enums";
import { requireUser } from "@/lib/auth/current";
import {
  countLinesReadyToQuote,
  getQuotationBucketCounts,
  listQuotations,
} from "@/lib/queries/quotations";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ bucket?: string; sent?: string }>;
}

export default async function QuotationsPage({ searchParams }: PageProps) {
  await requireUser();

  // The dashboard tiles are URL-driven (`?bucket=` / `?sent=no`) and filter the
  // register SERVER-side, so the list a tile opens is exactly what it counted.
  // The counts themselves are always read over the whole table.
  const selection = parseQuotationSelection(await searchParams);

  const [counts, readyToQuote, rows] = await Promise.all([
    getQuotationBucketCounts(),
    countLinesReadyToQuote(),
    listQuotations({
      bucket: selection.bucket ?? undefined,
      sent: selection.notSentOnly ? "no" : undefined,
    }),
  ]);

  // Header sub-line names the active filter so a filtered register can never be
  // mistaken for an empty one.
  const filterLabel = [
    selection.bucket ? QUOTATION_STATUS_LABELS[selection.bucket] : null,
    selection.notSentOnly ? "Not Sent" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <EnquiryModuleShell title="Quotation Register" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Quotation Register
              {filterLabel && (
                <span className="ml-2 text-[16px] font-bold text-ink-subtle">
                  · {filterLabel}
                </span>
              )}
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {rows.length} {rows.length === 1 ? "quotation" : "quotations"}
              {filterLabel && ` of ${counts.total}`}
            </p>
          </div>
          <Link
            href={NEW_QUOTATION_ROUTE}
            className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
              boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
              fontWeight: 800,
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Quotation
          </Link>
        </div>

        <QuotationBucketStrip
          counts={counts}
          selection={selection}
          readyToQuote={readyToQuote}
        />

        <QuotationTable rows={rows} filtered={Boolean(filterLabel)} />
      </div>
    </EnquiryModuleShell>
  );
}
