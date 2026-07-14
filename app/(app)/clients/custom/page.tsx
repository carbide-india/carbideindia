import { requireUser } from "@/lib/auth/current";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { listCustomListsForForm } from "@/lib/queries/custom-lists";
import { CustomListsEditor } from "@/components/custom-lists/custom-lists-editor";

export const dynamic = "force-dynamic";

/**
 * Client KYC "Custom" lists - the form-scoped dropdowns (Payment Terms,
 * Freight, Credit Days, …) that don't belong in the shared Masters module.
 */
export default async function ClientCustomListsPage() {
  await requireUser();
  const lists = await listCustomListsForForm("kyc");
  return (
    <EnquiryModuleShell title="Custom Dropdown Master" userMenu={<UserMenuServer />}>
      <div className="w-full max-w-[1400px]">
        <div className="mb-5">
          <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Custom Dropdown Master
          </h1>
        </div>
        <CustomListsEditor formKey="kyc" lists={lists} />
      </div>
    </EnquiryModuleShell>
  );
}
