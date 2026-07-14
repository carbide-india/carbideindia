import { SampleForm } from "@/components/samples/sample-form";
import type { SampleFormValues } from "@/components/samples/sample-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { getFormDraft } from "@/lib/queries/form-drafts";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listCustomOptionsMap } from "@/lib/queries/custom-lists";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { sampleImportSpec } from "@/lib/import/specs/sample";
import { commitSampleImport } from "@/app/(app)/samples/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ draft?: string }>;
}

export default async function NewSamplePage({ searchParams }: PageProps) {
  await requireUser();
  const me = await getCurrentEmployee();
  const employees = await listEmployeeOptions();
  // Editable location dropdowns (Custom Dropdown Master → Sample Register).
  const customLists = await listCustomOptionsMap("sample");

  const sp = await searchParams;
  const draftParam = typeof sp.draft === "string" ? sp.draft : undefined;
  const draftPayload = draftParam ? await getFormDraft("sample", draftParam) : null;

  // Admins get a Bulk Upload entry in the sidebar (opens the sample import modal).
  const importLookups = me?.isAdmin ? await loadLookups(specRefKinds(sampleImportSpec.fields)) : null;

  const bulkUpload =
    me?.isAdmin && importLookups ? (
      <BulkImportModal
        spec={sampleImportSpec}
        lookups={importLookups}
        commit={commitSampleImport}
        isAdmin
        triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
      />
    ) : null;

  return (
    <EnquiryModuleShell
      title="Sample Register"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="w-full">
        <SampleForm
          employees={employees}
          sampleLocationOptions={customLists.sample_location}
          stageLocationOptions={customLists.stage_location}
          enableDrafts
          resumeDraftId={draftPayload ? draftParam : undefined}
          initialValues={draftPayload ? (draftPayload as Partial<SampleFormValues>) : undefined}
        />
      </div>
    </EnquiryModuleShell>
  );
}
