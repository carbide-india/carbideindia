import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { listEnquiryDrafts } from "@/lib/queries/enquiry-drafts";
import { DraftsList } from "@/components/enquiries/drafts-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Drafts - Carbide India",
};

const MONO = "var(--font-mono-display)";

export default async function EnquiryDraftsPage() {
  const drafts = await listEnquiryDrafts();

  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-[#9aa0ab]" style={{ fontFamily: MONO }}>
        <FolderOpen className="h-3.5 w-3.5" />
        DIRECTORY <span className="text-[#c7ccd4]">/</span> DRAFTS
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">Drafts</h1>
        {drafts.length > 0 && (
          <span className="rounded-full bg-[#eef1fb] px-3 py-1 text-[13px] font-bold tabular-nums text-[#2b46b5]">
            {drafts.length}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-[620px] text-[15px] font-medium leading-relaxed text-[#4b5563]">
        Resume an unfinished enquiry - everything you type on the New Enquiry form auto-saves here until it&rsquo;s submitted.
      </p>

      <DraftsList drafts={drafts} />
    </div>
  );
}
