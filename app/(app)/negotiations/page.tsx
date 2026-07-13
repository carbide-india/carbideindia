import Link from "next/link";
import { Plus } from "lucide-react";
import {
  NegotiationTable,
  NEW_NEGOTIATION_ROUTE,
} from "@/components/negotiations/negotiation-table";
import { requireUser } from "@/lib/auth/current";
import { listNegotiations } from "@/lib/queries/negotiations";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * Negotiation Register — price negotiation tracked from a quote to won, lost or
 * abandoned, now rendered inside the shared Enquiries module shell (logo sidebar
 * + indigo header). On /negotiations routes the shell's sidebar reads as the
 * register family automatically, so no custom nav is passed. The advanced table
 * owns search / filtering / sorting client-side, so the page just loads the full
 * register set.
 */
export default async function NegotiationsPage() {
  await requireUser();

  const rows = await listNegotiations({});

  return (
    <EnquiryModuleShell
      title="Negotiation Register"
      userMenu={<UserMenuServer />}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Negotiation Register
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {rows.length} {rows.length === 1 ? "negotiation" : "negotiations"}
            </p>
          </div>
          <Link
            href={NEW_NEGOTIATION_ROUTE}
            className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
              boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
              fontWeight: 800,
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Negotiation
          </Link>
        </header>

        <NegotiationTable rows={rows} />
      </div>
    </EnquiryModuleShell>
  );
}
