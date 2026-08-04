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
 * Vendors — the Forms-module home for supplier records. Lives under /vendors so
 * the Forms/Enquiry shell renders its sidebar (Create New Vendor / Vendor
 * Register). Reuses the shared VendorRegister with basePath="/vendors" so all
 * row links stay within this module — the single home for vendor management.
 */
export default async function VendorsPage() {
  const me = await requireUser();
  const rows = await listVendors();

  return (
    <EnquiryModuleShell title="Vendors" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Vendors
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {rows.length} vendors
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href={"/vendors/export.xlsx" as Route}
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-chip border border-[#d4d7e3] bg-white px-4 py-2.5 text-[13.5px] font-bold text-[#3a4152] transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94]"
            >
              <Download size={16} strokeWidth={2.4} />
              Export Excel
            </Link>
            <Link
              href={"/vendors/new" as Route}
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

        <VendorRegister rows={rows} isAdmin={me.isAdmin} basePath="/vendors" />
      </div>
    </EnquiryModuleShell>
  );
}
