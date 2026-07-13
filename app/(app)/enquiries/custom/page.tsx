import { requireUser } from "@/lib/auth/current";
import { listCustomListsForForm } from "@/lib/queries/custom-lists";
import { CustomListsEditor } from "@/components/custom-lists/custom-lists-editor";

export const dynamic = "force-dynamic";

/**
 * New Enquiry "Custom Dropdown Master" — the enquiry form's editable free-text
 * dropdowns (Unit, State, City). The enquiry module shell comes from the
 * enquiries layout, so this page returns content only (no nested shell).
 */
export default async function EnquiryCustomListsPage() {
  await requireUser();
  const lists = await listCustomListsForForm("enquiry");
  return (
    <div className="w-full max-w-[1400px]">
      <div className="mb-5">
        <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
          Custom Dropdown Master
        </h1>
      </div>
      <CustomListsEditor formKey="enquiry" lists={lists} />
    </div>
  );
}
