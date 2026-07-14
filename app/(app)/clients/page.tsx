import Link from "next/link";
import type { Route } from "next";
import { Plus, Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listClientsForRegister } from "@/lib/queries/clients";
import { ClientRegister } from "@/components/clients/client-register";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { kycImportSpec } from "@/lib/import/specs/kyc";
import { commitKycImport } from "@/app/(app)/clients/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export const dynamic = "force-dynamic";

/**
 * Client Master register - the KYC/credit/banking list, now rendered inside the
 * shared Enquiries module shell (logo sidebar + indigo header). On client routes
 * the shell's sidebar reads as the Client Master family automatically, so no
 * custom nav is passed. KPI cards + the dense frozen-column table live in
 * <ClientRegister>; Bulk Import (KYC spec) opens as an animated modal from the
 * header action row.
 */
export default async function ClientsPage() {
  const me = await requireAdmin();
  const rows = await listClientsForRegister();

  // Admins get the KYC bulk-import modal (same wiring as /clients/new). Lookups
  // resolve master/employee refs so imported cells validate against real ids.
  // The whole route is requireAdmin-gated, so `me` is always an admin here.
  const importLookups = me.isAdmin
    ? await loadLookups(specRefKinds(kycImportSpec.fields))
    : null;

  // Admins keep the sidebar Bulk Upload entry (opens the same import modal).
  const bulkUpload =
    me.isAdmin && importLookups ? (
      <BulkImportModal
        spec={kycImportSpec}
        lookups={importLookups}
        commit={commitKycImport}
        isAdmin
        triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
      />
    ) : null;

  return (
    <EnquiryModuleShell
      title="Client Master"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Client Master
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            {me.isAdmin && importLookups && (
              <BulkImportModal
                spec={kycImportSpec}
                lookups={importLookups}
                commit={commitKycImport}
                isAdmin
                triggerClassName="inline-flex items-center gap-2 rounded-chip border border-[#dcdce8] px-4 py-2.5 text-[14px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#efeffb]"
              />
            )}
            <a
              href="/clients/export.xlsx"
              className="inline-flex items-center gap-2 rounded-chip border border-[#dcdce8] px-4 py-2.5 text-[14px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#efeffb]"
            >
              <Download size={15} strokeWidth={2.4} />
              Export to Excel
            </a>
            <Link
              href={"/clients/new" as Route}
              className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
              style={{
                background:
                  "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
                boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
                fontWeight: 800,
              }}
            >
              <Plus size={16} strokeWidth={2.4} />
              New client
            </Link>
          </div>
        </header>

        <ClientRegister rows={rows} isAdmin={me.isAdmin} />
      </div>
    </EnquiryModuleShell>
  );
}
