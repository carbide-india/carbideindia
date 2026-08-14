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
import { resolveDraftToResume } from "@/lib/queries/form-drafts";
import { ResumedDraftNote } from "@/components/drafts/resumed-draft-note";
import type { QuotationFormValues } from "@/components/quotations/quotation-form";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; fresh?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  // Resume the last unfinished draft automatically, and carry on with the SAME
  // draft id rather than minting a new one — that is what stops the store
  // growing a row per abandoned visit.
  const resume = await resolveDraftToResume(
    "quotation",
    typeof sp.draft === "string" ? sp.draft : undefined,
    sp.fresh === "1",
  );
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
        {resume && (
          <ResumedDraftNote updatedAt={resume.updatedAt} newRoute="/quotations/new" />
        )}
        <QuotationForm
          inquiries={inquiries}
          employees={employees}
          enableDrafts
          resumeDraftId={resume?.id}
          initialValues={resume?.payload as Partial<QuotationFormValues> | undefined}
        />
      </div>
    </EnquiryModuleShell>
  );
}
