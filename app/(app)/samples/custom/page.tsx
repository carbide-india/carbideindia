import { requireUser } from "@/lib/auth/current";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { listCustomListsForForm } from "@/lib/queries/custom-lists";
import { CustomListsEditor } from "@/components/custom-lists/custom-lists-editor";

export const dynamic = "force-dynamic";

/**
 * Sample Register "Custom Dropdown Master" - the form-scoped location lists
 * (Sample Location, Stage Location) that admins can edit and add to.
 */
export default async function SampleCustomListsPage() {
  await requireUser();
  const lists = await listCustomListsForForm("sample");
  return (
    <EnquiryModuleShell title="Custom Dropdown Master" userMenu={<UserMenuServer />}>
      <div className="w-full max-w-[1400px]">
        <div className="mb-5">
          <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Custom Dropdown Master
          </h1>
        </div>
        <CustomListsEditor formKey="sample" lists={lists} />
      </div>
    </EnquiryModuleShell>
  );
}
