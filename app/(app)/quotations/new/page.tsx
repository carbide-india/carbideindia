import { QuotationForm } from "@/components/quotations/quotation-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listInquiryOptions } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { quotationImportSpec } from "@/lib/import/specs/quotation";
import { commitQuotationImport } from "@/app/(app)/quotations/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  await requireUser();
  const me = await getCurrentEmployee();
  const [inquiries, employees] = await Promise.all([
    listInquiryOptions(),
    listEmployeeOptions(),
  ]);

  // Admins get a Bulk Upload entry in the sidebar (opens the quotation import modal).
  const importLookups = me?.isAdmin
    ? await loadLookups(specRefKinds(quotationImportSpec.fields))
    : null;

  return (
    <EnquiryModuleShell
      title="Quotation"
      userMenu={<UserMenuServer />}
      bulkUpload={
        me?.isAdmin && importLookups ? (
          <BulkImportModal
            spec={quotationImportSpec}
            lookups={importLookups}
            commit={commitQuotationImport}
            isAdmin
            triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
          />
        ) : null
      }
    >
      <div className="w-full">
        <QuotationForm inquiries={inquiries} employees={employees} />
      </div>
    </EnquiryModuleShell>
  );
}
