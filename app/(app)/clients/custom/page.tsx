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
          <span
            className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
            style={{ fontFamily: "var(--font-mono-display)" }}
          >
            Client KYC &middot; Configuration
          </span>
          <h1 className="mt-1 text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Custom Dropdown Master
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] text-[#6b7280]">
            Every editable dropdown on the Client KYC form - add, rename, reorder or remove options,
            bulk-paste many at once, or reset a list to its defaults. Changes appear on the form
            instantly.
          </p>
        </div>
        <CustomListsEditor formKey="kyc" lists={lists} />
      </div>
    </EnquiryModuleShell>
  );
}
