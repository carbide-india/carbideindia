import Link from "next/link";
import { Plus } from "lucide-react";
import {
  QuotationTable,
  NEW_QUOTATION_ROUTE,
} from "@/components/quotations/quotation-table";
import { requireUser } from "@/lib/auth/current";
import { listQuotations } from "@/lib/queries/quotations";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  await requireUser();

  // The advanced table owns search / filtering / sorting client-side, so the
  // page just loads the full register set.
  const rows = await listQuotations({});

  return (
    <EnquiryModuleShell title="Quotation Register" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Quotation Register
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {rows.length} {rows.length === 1 ? "quotation" : "quotations"}
            </p>
          </div>
          <Link
            href={NEW_QUOTATION_ROUTE}
            className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
              boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
              fontWeight: 800,
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Quotation
          </Link>
        </div>
        <QuotationTable rows={rows} />
      </div>
    </EnquiryModuleShell>
  );
}
