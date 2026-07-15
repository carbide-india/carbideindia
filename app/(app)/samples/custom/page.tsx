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
    <EnquiryModuleShell title="SAM Dropdown Master" userMenu={<UserMenuServer />}>
      <div className="w-full max-w-[1400px]">
        <div className="mb-5">
          <span
            className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
            style={{ fontFamily: "var(--font-mono-display)" }}
          >
            Sample Register &middot; Configuration
          </span>
          <h1 className="mt-1 text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            SAM Dropdown Master
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] text-[#6b7280]">
            Every editable dropdown on the Sample Register form - add, rename, reorder or remove
            options. Changes appear on the form instantly.
          </p>
        </div>
        <CustomListsEditor formKey="sample" lists={lists} />
      </div>
    </EnquiryModuleShell>
  );
}
