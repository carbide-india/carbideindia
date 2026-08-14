import Link from "next/link";
import { Plus } from "lucide-react";
import {
  SoTable,
  NEW_SALES_ORDER_ROUTE,
} from "@/components/sales-orders/so-table";
import { SoBucketStrip } from "@/components/sales-orders/so-bucket-strip";
import { RegisterHeading } from "@/components/registers/register-heading";
import { requireUser } from "@/lib/auth/current";
import { listSalesOrders } from "@/lib/queries/sales-orders";
import {
  SALES_ORDER_STATUSES,
  SALES_ORDER_STATUS_LABELS,
  type SalesOrderStatus,
} from "@/db/enums";
import {
  applySalesOrderFilters,
  isOutputFilter,
  outputCounts,
  stageBucketCounts,
} from "@/lib/sales-orders/buckets";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { salesOrderImportSpec } from "@/lib/import/specs/sales-order";
import { commitSalesOrderImport } from "@/app/(app)/sales-orders/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export const dynamic = "force-dynamic";

const OUTPUT_LABELS: Record<string, string> = {
  customer_pending: "Customer Copy Pending",
  customer_sent: "Customer Copy Sent",
  factory_pending: "Factory Copy Pending",
  factory_sent: "Factory Copy Sent",
};

interface PageProps {
  searchParams: Promise<{ status?: string; output?: string }>;
}

/**
 * Sales Order Register - the customer PO / SO list, rendered inside the shared
 * Enquiries module shell (logo sidebar + indigo header). On /sales-orders the
 * shell sidebar reads as the register family automatically, so no custom nav is
 * passed.
 *
 * Two count strips sit above the table (`SoBucketStrip`): the house STAGE
 * buckets, and the DUAL OUTPUT split - one order produces a customer copy and a
 * factory copy, each with its own send state, so "what is left" has to be
 * answerable per copy. Both strips are computed over the FULL register set and
 * link into the filtered view via `?status=` / `?output=`; the table itself
 * still owns search / sorting / column filters client-side.
 */
export default async function SalesOrdersPage({ searchParams }: PageProps) {
  const me = await requireUser();

  const all = await listSalesOrders({});

  // URL-as-state, validated: anything unrecognised falls back to "no filter"
  // rather than silently hiding rows.
  const sp = await searchParams;
  const activeStatus = SALES_ORDER_STATUSES.includes(sp.status as SalesOrderStatus)
    ? (sp.status as SalesOrderStatus)
    : null;
  const activeOutput = isOutputFilter(sp.output) ? sp.output : null;

  // Counts are always over `all` - never over the filtered set, or clicking a
  // tile would rewrite the very numbers you were reading.
  const buckets = stageBucketCounts(all);
  const outputs = outputCounts(all);
  const rows = applySalesOrderFilters(all, {
    status: activeStatus,
    output: activeOutput,
  });

  const filterLabels = [
    activeStatus ? SALES_ORDER_STATUS_LABELS[activeStatus] : null,
    activeOutput ? OUTPUT_LABELS[activeOutput] ?? null : null,
  ].filter((v): v is string => v !== null);

  // Admins get a Bulk Upload entry in the sidebar (opens the import modal — same
  // popup flow as the New Sales Order form).
  const importLookups = me.isAdmin
    ? await loadLookups(specRefKinds(salesOrderImportSpec.fields))
    : null;
  const bulkUpload =
    me.isAdmin && importLookups ? (
      <BulkImportModal
        spec={salesOrderImportSpec}
        lookups={importLookups}
        commit={commitSalesOrderImport}
        isAdmin
        triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
      />
    ) : null;

  return (
    <EnquiryModuleShell
      title="Sales Order Register"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <SoBucketStrip
          buckets={buckets}
          outputs={outputs}
          activeStatus={activeStatus}
          activeOutput={activeOutput}
          total={all.length}
        />

        <SoTable
          rows={rows}
          heading={
            <RegisterHeading
              title="Sales Order Register"
              count={rows.length}
              unit="sales order"
              filterLabel={
                filterLabels.length > 0
                  ? `${filterLabels.join(" · ")} of ${all.length}`
                  : null
              }
            />
          }
          actions={
            <Link
              href={NEW_SALES_ORDER_ROUTE}
              className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
              style={{
                background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
                boxShadow: "0 4px 12px rgba(63,63,148,0.30)",
              }}
            >
              <Plus size={15} strokeWidth={2.4} />
              New Sales Order
            </Link>
          }
        />
      </div>
    </EnquiryModuleShell>
  );
}
