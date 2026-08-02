import Link from "next/link";
import type { Route } from "next";
import { Plus, Download } from "lucide-react";
import { VendorRegister } from "@/components/vendors/vendor-register";
import { requireUser } from "@/lib/auth/current";
import { listVendors } from "@/lib/queries/vendors";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * Vendor Master — the supplier records section of the Costing module. It lives
 * under /costings/vendors so the shell renders the Costing family sidebar (with
 * the "Vendor Master" nav item) on every vendor page. The register owns search /
 * filtering / sorting client-side; Excel export ships as a dedicated route.
 */
export default async function VendorMasterPage() {
  const me = await requireUser();
  const rows = await listVendors();

  return (
    <EnquiryModuleShell title="Vendor Master" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Vendor Master
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {rows.length} vendors
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href={"/costings/vendors/export.xlsx" as Route}
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-chip border border-[#d4d7e3] bg-white px-4 py-2.5 text-[13.5px] font-bold text-[#3a4152] transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94]"
            >
              <Download size={16} strokeWidth={2.4} />
              Export Excel
            </Link>
            <Link
              href={"/costings/vendors/new" as Route}
              className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
              style={{
                background:
                  "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
                boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
                fontWeight: 800,
              }}
            >
              <Plus size={16} strokeWidth={2.4} />
              New Vendor
            </Link>
          </div>
        </header>

        <VendorRegister rows={rows} isAdmin={me.isAdmin} />
      </div>
    </EnquiryModuleShell>
  );
}
