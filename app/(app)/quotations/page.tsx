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
  getQuotationRevisionCounts,
  listQuotations,
} from "@/lib/queries/quotations";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { QuotationRevisionSummary } from "@/components/quotations/quotation-revision-summary";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ bucket?: string; sent?: string; rev?: string }>;
}

export default async function QuotationsPage({ searchParams }: PageProps) {
  await requireUser();

  // The dashboard tiles are URL-driven (`?bucket=` / `?sent=no`) and filter the
  // register SERVER-side, so the list a tile opens is exactly what it counted.
  // The counts themselves are always read over the whole table.
  const sp = await searchParams;
  const selection = parseQuotationSelection(sp);
  const rev = sp.rev === "original" || sp.rev === "revised" ? sp.rev : undefined;

  const [counts, revCounts, readyToQuote, rows] = await Promise.all([
    getQuotationBucketCounts(),
    getQuotationRevisionCounts(),
    countLinesReadyToQuote(),
    listQuotations({
      bucket: selection.bucket ?? undefined,
      sent: selection.notSentOnly ? "no" : undefined,
      rev,
    }),
  ]);

  // Header sub-line names the active filter so a filtered register can never be
  // mistaken for an empty one.
  const filterLabel = [
    selection.bucket ? QUOTATION_STATUS_LABELS[selection.bucket] : null,
    selection.notSentOnly ? "Not Sent" : null,
    rev === "original" ? "Originals" : rev === "revised" ? "Revised" : null,
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
        <QuotationRevisionSummary counts={revCounts} active={rev ?? null} />
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
                background: "#454595",
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
