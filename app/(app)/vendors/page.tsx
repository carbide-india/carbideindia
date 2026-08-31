import Link from "next/link";
import type { Route } from "next";
import { Plus, Download } from "lucide-react";
import { VendorRegister } from "@/components/vendors/vendor-register";
import { requireUser } from "@/lib/auth/current";
import { listVendors } from "@/lib/queries/vendors";
import { RegisterHeading } from "@/components/registers/register-heading";
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
        <VendorRegister
          rows={rows}
          isAdmin={me.isAdmin}
          basePath="/vendors"
          heading={<RegisterHeading title="Vendors" count={rows.length} unit="vendor" />}
          actions={
            <>
              <Link
                href={"/vendors/export.xlsx" as Route}
                prefetch={false}
                className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-[#d4d7e3] bg-white px-3.5 text-[13px] font-bold text-[#3a4152] transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94]"
              >
                <Download size={14} strokeWidth={2.4} />
                Export Excel
              </Link>
              <Link
                href={"/vendors/new" as Route}
                className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
                style={{
                  background: "#454595",
                  boxShadow: "0 4px 12px rgba(63,63,148,0.30)",
                }}
              >
                <Plus size={15} strokeWidth={2.4} />
                New Vendor
              </Link>
            </>
          }
        />
      </div>
    </EnquiryModuleShell>
  );
}
