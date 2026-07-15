import { requireUser } from "@/lib/auth/current";
import { listCustomListsForForm } from "@/lib/queries/custom-lists";
import { CustomListsEditor } from "@/components/custom-lists/custom-lists-editor";

export const dynamic = "force-dynamic";

/**
 * New Enquiry "Custom Dropdown Master" - the enquiry form's editable free-text
 * dropdowns (Unit, State, City). The enquiry module shell comes from the
 * enquiries layout, so this page returns content only (no nested shell).
 */
export default async function EnquiryCustomListsPage() {
  await requireUser();
  const lists = await listCustomListsForForm("enquiry");
  return (
    <div className="w-full max-w-[1400px]">
      <div className="mb-5">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          New Enquiry &middot; Configuration
        </span>
        <h1 className="mt-1 text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
          ENQ Dropdown Master
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] text-[#6b7280]">
          Every editable dropdown on the New Enquiry form - add, rename, reorder or remove options.
          Changes appear on the form instantly.
        </p>
      </div>
      <CustomListsEditor formKey="enquiry" lists={lists} />
    </div>
  );
}
