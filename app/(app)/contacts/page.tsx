import { requireUser } from "@/lib/auth/current";
import { listContactPersonGroups } from "@/lib/queries/contacts";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { ContactAddressBook } from "@/components/contacts/contact-address-book";

export const dynamic = "force-dynamic";

/**
 * Contact Person Address Book - a directory of every contact person captured on
 * the Client KYC forms, grouped by company, rendered inside the shared module
 * shell.
 */
export default async function ContactsPage() {
  await requireUser();
  const groups = await listContactPersonGroups();
  const contactCount = groups.reduce((n, g) => n + g.contacts.length, 0);

  return (
    <EnquiryModuleShell
      title="Contact Person Address Book"
      userMenu={<UserMenuServer />}
    >
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Contact Person Address Book
          </h1>
          <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">
            {contactCount} {contactCount === 1 ? "contact" : "contacts"}
            {" · "}
            {groups.length} {groups.length === 1 ? "company" : "companies"}
          </span>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center text-[14px] text-ink-subtle">
            No contact persons yet - they appear here as you add contacts on the
            Client KYC form.
          </div>
        ) : (
          <ContactAddressBook groups={groups} />
        )}
      </div>
    </EnquiryModuleShell>
  );
}
