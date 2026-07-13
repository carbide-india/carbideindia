import type { ReactNode } from "react";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { getCurrentEmployee } from "@/lib/auth/current";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { enquiryImportSpec } from "@/lib/import/specs/enquiry";
import { commitEnquiryImport } from "@/app/(app)/inquiries/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export default async function EnquiriesModuleLayout({ children }: { children: ReactNode }) {
  const me = await getCurrentEmployee();
  const isAdmin = me?.isAdmin ?? false;
  const importLookups = isAdmin ? await loadLookups(specRefKinds(enquiryImportSpec.fields)) : null;

  // Admins get a Bulk Upload entry in the sidebar (opens the enquiry import modal).
  const bulkUpload =
    isAdmin && importLookups ? (
      <BulkImportModal
        spec={enquiryImportSpec}
        lookups={importLookups}
        commit={commitEnquiryImport}
        isAdmin
        triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
      />
    ) : null;

  return (
    <EnquiryModuleShell userMenu={<UserMenuServer />} bulkUpload={bulkUpload}>
      {children}
    </EnquiryModuleShell>
  );
}
