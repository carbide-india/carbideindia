import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listRevisedQuotationChains } from "@/lib/queries/quotations";
import { RevisionLogBrowser } from "@/components/quotations/revision-log-browser";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Revision Log · Quotation - Carbide India",
};

/**
 * Revision Log — every quote that was re-quoted, each shown as a matrix
 * (parameters down the left, latest revision → original across the top, changed
 * cells highlighted). One place to review exactly what moved across every quote
 * revision, without opening each quote.
 */
export default async function QuotationRevisionsPage() {
  await requireUser();
  const chains = await listRevisedQuotationChains();

  return (
    <EnquiryModuleShell title="Revision Log" userMenu={<UserMenuServer />}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#d03232]">
            Quotation
          </span>
          <h1 className="mt-1 text-[24px] font-black tracking-tight text-[#1f2547]">
            Revision Log
          </h1>
          <p className="mt-1 text-[13px] text-[#777985]">
            Every re-quoted quotation, latest revision first. Search a quote, and pick
            which revisions to compare (e.g. just R1 &amp; R5, or only the latest).
          </p>
        </div>

        <RevisionLogBrowser chains={chains} />
      </div>
    </EnquiryModuleShell>
  );
}
