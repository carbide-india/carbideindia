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
import { getFormDraft } from "@/lib/queries/form-drafts";
import type { QuotationFormValues } from "@/components/quotations/quotation-form";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const draftParam = typeof sp.draft === "string" ? sp.draft : undefined;
  const draftPayload = draftParam ? await getFormDraft("quotation", draftParam) : null;
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
        <QuotationForm
          inquiries={inquiries}
          employees={employees}
          enableDrafts
          resumeDraftId={draftPayload ? draftParam : undefined}
          initialValues={
            draftPayload ? (draftPayload as Partial<QuotationFormValues>) : undefined
          }
        />
      </div>
    </EnquiryModuleShell>
  );
}
