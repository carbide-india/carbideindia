import type { Route } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current";
import { listContactPersons } from "@/lib/queries/contacts";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * Contact Person book — a directory of every contact person captured on the
 * Client KYC forms, rendered inside the shared module shell.
 */
export default async function ContactsPage() {
  await requireUser();
  const contacts = await listContactPersons();

  return (
    <EnquiryModuleShell title="Contact Persons" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Contact Person Book
          </h1>
          <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">
            {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
          </span>
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center text-[14px] text-ink-subtle">
            No contact persons yet — they appear here as you add contacts on the Client KYC form.
          </div>
        ) : (
          <div
            className="overflow-auto rounded-section border border-hairline bg-surface-card"
            style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
          >
            <table className="w-full text-[14px]">
              <thead>
                <tr
                  className="border-b border-hairline text-left text-[12px] uppercase tracking-[0.08em] font-bold text-ink-subtle"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Contact No</th>
                  <th className="px-4 py-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => (
                  <tr
                    key={c.id}
                    className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface-soft"
                    style={{ background: i % 2 === 1 ? "rgba(15,23,42,0.012)" : undefined }}
                  >
                    <td className="px-4 py-2.5 font-semibold text-ink-strong">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">{c.designation ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/clients/${c.clientId}` as Route}
                        className="font-medium text-brand hover:underline"
                      >
                        {c.clientName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-soft">{c.contactNo ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{c.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </EnquiryModuleShell>
  );
}
