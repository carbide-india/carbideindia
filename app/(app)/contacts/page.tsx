import { requireUser } from "@/lib/auth/current";
import { listContactPersonGroups } from "@/lib/queries/contacts";
import { RegisterHeading } from "@/components/registers/register-heading";
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
        {/* Same heading component every register uses, so this page does not
            state its title in a different voice from the rest of the module. */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <RegisterHeading
            title="Contact Person Address Book"
            count={contactCount}
            unit="contact"
            filterLabel={`across ${groups.length} ${groups.length === 1 ? "company" : "companies"}`}
          />
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
