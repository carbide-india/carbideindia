import Link from "next/link";
import type { Route } from "next";
import { Plus, Upload } from "lucide-react";
import {
  SoTable,
  NEW_SALES_ORDER_ROUTE,
} from "@/components/sales-orders/so-table";
import { requireUser } from "@/lib/auth/current";
import { listSalesOrders } from "@/lib/queries/sales-orders";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * Sales Order Register — the customer PO / SO list, rendered inside the shared
 * Enquiries module shell (logo sidebar + indigo header). On /sales-orders the
 * shell sidebar reads as the register family automatically, so no custom nav is
 * passed. The advanced table owns search / filtering / sorting client-side, so
 * the page just loads the full register set.
 */
export default async function SalesOrdersPage() {
  const me = await requireUser();

  const rows = await listSalesOrders({});

  // Admins get a Bulk Upload entry in the sidebar (sales-order import).
  const bulkUpload = me?.isAdmin ? (
    <Link
      href={"/sales-orders/import" as Route}
      className="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
    >
      <Upload className="h-[19px] w-[19px]" />
      Bulk Upload
    </Link>
  ) : null;

  return (
    <EnquiryModuleShell
      title="Sales Order Register"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Sales Order Register
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {rows.length} {rows.length === 1 ? "sales order" : "sales orders"}
            </p>
          </div>
          <Link
            href={NEW_SALES_ORDER_ROUTE}
            className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
              boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
              fontWeight: 800,
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Sales Order
          </Link>
        </header>

        <SoTable rows={rows} />
      </div>
    </EnquiryModuleShell>
  );
}
