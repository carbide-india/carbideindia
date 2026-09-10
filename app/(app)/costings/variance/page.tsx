import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listCostingVarianceChains } from "@/lib/queries/costings";
import { CostingVarianceBrowser } from "@/components/costings/costing-variance-browser";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Costing Variance · Costing - Carbide India",
};

/**
 * Costing Variance Log — every product line whose costing has more than one
 * version (a revision `-R1`/`-R2`, and/or a second series `C02`), newest first.
 * One place to see what moved across every re-costing, and where the
 * Auto-Cancelled (superseded) versions went. The costing analogue of the
 * Quotation Revision Log.
 */
export default async function CostingVariancePage() {
  await requireUser();
  const chains = await listCostingVarianceChains();

  return (
    <EnquiryModuleShell title="Costing Variance" userMenu={<UserMenuServer />}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#d03232]">
            Costing
          </span>
          <h1 className="mt-1 text-[24px] font-black tracking-tight text-[#1f2547]">
            Costing Variance
          </h1>
          <p className="mt-1 text-[13px] text-[#777985]">
            Every re-costed product line, newest first. Green is an original
            costing (C01), red is a revision (C01-R1); a second costing on the
            same line is C02. Search a costing code, SM or company.
          </p>
        </div>

        <CostingVarianceBrowser chains={chains} />
      </div>
    </EnquiryModuleShell>
  );
}
