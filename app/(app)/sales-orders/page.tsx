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
import { SidebarBuckets } from "@/components/layout/sidebar-buckets";

export const dynamic = "force-dynamic";

// The vocabulary the business uses (Hetesh, 2026-08-13: "Show SO Issued to
// Production. Show SO Issued to Cust separately"). "Copy Sent" described the
// document; "Issued" describes the event people actually track.
const OUTPUT_LABELS: Record<string, string> = {
  customer_pending: "Not Issued to Customer",
  customer_sent: "SO Issued to Customer",
  factory_pending: "Not Issued to Production",
  factory_sent: "SO Issued to Production",
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

  // The same status-wise distribution every other stage carries. The two issue
  // views are FLAGS, not buckets: an order can be issued to production and to
  // the customer at once, so they cross-cut the stage buckets rather than
  // partitioning them, and must never look like a sixth and seventh bucket.
  const hrefWith = (status: string | null, output: string | null) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (output) p.set("output", output);
    const qs = p.toString();
    return qs ? `/sales-orders?${qs}` : "/sales-orders";
  };
  const sidebarTiles = [
    ...buckets.map((b) => ({
      key: b.status as string,
      label: b.label,
      tone: b.tone,
      count: b.count,
      href: hrefWith(activeStatus === b.status ? null : b.status, activeOutput),
      active: activeStatus === b.status,
    })),
    {
      key: "factory_sent",
      group: "flag" as const,
      label: OUTPUT_LABELS.factory_sent!,
      tone: "amber",
      count: outputs.factorySent,
      hint: "Orders whose factory copy has been issued",
      href: hrefWith(activeStatus, activeOutput === "factory_sent" ? null : "factory_sent"),
      active: activeOutput === "factory_sent",
    },
    {
      key: "customer_sent",
      group: "flag" as const,
      label: OUTPUT_LABELS.customer_sent!,
      tone: "amber",
      count: outputs.customerSent,
      hint: "Orders whose customer copy has been issued",
      href: hrefWith(activeStatus, activeOutput === "customer_sent" ? null : "customer_sent"),
      active: activeOutput === "customer_sent",
    },
  ];

  return (
    <EnquiryModuleShell
      title="Sales Order Register"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
      registerChildren={
        <SidebarBuckets
          tiles={sidebarTiles}
          ariaLabel="Sales order status distribution"
          unit="sales order"
        />
      }
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
                background: "#454595",
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
