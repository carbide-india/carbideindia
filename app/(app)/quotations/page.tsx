import Link from "next/link";
import { Plus } from "lucide-react";
import {
  QuotationTable,
  NEW_QUOTATION_ROUTE,
} from "@/components/quotations/quotation-table";
import { QuotationBucketStrip } from "@/components/quotations/quotation-bucket-strip";
import { RegisterHeading } from "@/components/registers/register-heading";
import {
  buildQuotationBucketTiles,
  parseQuotationSelection,
} from "@/components/quotations/quotation-buckets";
import { SidebarBuckets } from "@/components/layout/sidebar-buckets";
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

  // The sidebar shows the SAME tiles the strip above the table renders, so the
  // two can never disagree — one derivation, two presentations.
  const sidebarTiles = buildQuotationBucketTiles(counts, selection);

  return (
    <EnquiryModuleShell
      title="Quotation Register"
      userMenu={<UserMenuServer />}
      registerChildren={
        <SidebarBuckets
          tiles={sidebarTiles.filter((t) => t.key !== "all")}
          ariaLabel="Quotation status distribution"
          unit="quotation"
        />
      }
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <QuotationBucketStrip readyToQuote={readyToQuote} />

        <QuotationTable
          rows={rows}
          filtered={Boolean(filterLabel)}
          heading={
            <RegisterHeading
              title="Quotation Register"
              count={rows.length}
              unit="quotation"
              filterLabel={filterLabel ? `${filterLabel} of ${counts.total}` : null}
            />
          }
          actions={
            <Link
              href={NEW_QUOTATION_ROUTE}
              className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
              style={{
                background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
                boxShadow: "0 4px 12px rgba(63,63,148,0.30)",
              }}
            >
              <Plus size={15} strokeWidth={2.4} />
              New Quotation
            </Link>
          }
        />
      </div>
    </EnquiryModuleShell>
  );
}
