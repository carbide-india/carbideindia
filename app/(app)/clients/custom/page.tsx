import { requireUser } from "@/lib/auth/current";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { listCustomListsForForm } from "@/lib/queries/custom-lists";
import { CustomListsEditor } from "@/components/custom-lists/custom-lists-editor";
import { CUSTOM_LISTS } from "@/lib/custom-lists/registry";

export const dynamic = "force-dynamic";

/**
 * Client KYC "Custom" lists — the form-scoped dropdowns (Payment Terms,
 * Freight, Credit Days, …) that don't belong in the shared Masters module.
 */
export default async function ClientCustomListsPage() {
  await requireUser();
  const lists = await listCustomListsForForm("kyc");
  const formLabel = CUSTOM_LISTS.kyc?.formLabel ?? "Client KYC";
  return (
    <EnquiryModuleShell title="Custom Lists" userMenu={<UserMenuServer />}>
      <div className="w-full max-w-[1400px]">
        <p className="mb-5 text-[14px] text-ink-subtle">
          Dropdown options used only by the {formLabel} form. Shared
          lists (Customer Type, Industry Type, Product Types, Department) are managed in
          the Masters module.
        </p>
        <CustomListsEditor formKey="kyc" lists={lists} />
      </div>
    </EnquiryModuleShell>
  );
}
