import Link from "next/link";
import type { Route } from "next";
import { Plus } from "lucide-react";
import { CostingTable } from "@/components/costings/costing-table";
import { requireUser } from "@/lib/auth/current";
import { listCostings } from "@/lib/queries/costings";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * Costing Register — in-house and bought-out cost sheets, now rendered inside the
 * shared Enquiries module shell (logo sidebar + indigo header). On /costings the
 * shell's sidebar reads as the Costing family automatically, so no custom nav is
 * passed. The advanced table owns search / filtering / sorting client-side.
 */
export default async function CostingsPage() {
  await requireUser();
  const rows = await listCostings();

  return (
    <EnquiryModuleShell title="Costing Register" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Costing Register
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {rows.length} cost sheets
            </p>
          </div>
          <Link
            href={"/costings/new" as Route}
            className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
              boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
              fontWeight: 800,
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Costing
          </Link>
        </header>

        <CostingTable rows={rows} />
      </div>
    </EnquiryModuleShell>
  );
}
