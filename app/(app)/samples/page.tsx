import Link from "next/link";
import { Plus } from "lucide-react";
import {
  SampleRegister,
  NEW_SAMPLE_ROUTE,
} from "@/components/samples/sample-register";
import { RegisterHeading } from "@/components/registers/register-heading";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { requireUser } from "@/lib/auth/current";
import { listSamples } from "@/lib/queries/samples";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { sampleImportSpec } from "@/lib/import/specs/sample";
import { commitSampleImport } from "@/app/(app)/samples/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export const dynamic = "force-dynamic";

/**
 * Sample Register - physical sample tracking, now rendered inside the shared
 * Enquiries module shell (logo sidebar + indigo header). On /samples routes the
 * shell sidebar reads as the Sample Register family automatically, so no custom
 * nav is passed. The advanced table owns search / filtering / sorting
 * client-side, so the page just loads the full register set.
 */
export default async function SamplesPage() {
  const me = await requireUser();

  const [rows, employees] = await Promise.all([
    listSamples({}),
    listEmployeeOptions(),
  ]);

  // Admins get the animated Bulk Upload modal (template download → parse → fix
  // → import), same as the New Sample page - no more legacy import page.
  const importLookups = me?.isAdmin
    ? await loadLookups(specRefKinds(sampleImportSpec.fields))
    : null;
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
      <div className="mx-auto w-full max-w-[1600px]">
        <SampleRegister
          rows={rows}
          employees={employees}
          heading={
            <RegisterHeading title="Sample Register" count={rows.length} unit="sample" />
          }
          actions={
            <Link
              href={NEW_SAMPLE_ROUTE}
              className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
              style={{
                background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
                boxShadow: "0 4px 12px rgba(63,63,148,0.30)",
              }}
            >
              <Plus size={15} strokeWidth={2.4} />
              New Sample
            </Link>
          }
        />
      </div>
    </EnquiryModuleShell>
  );
}
