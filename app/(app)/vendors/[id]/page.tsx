import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { getVendorById } from "@/lib/queries/vendors";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

const dash = (v: React.ReactNode): React.ReactNode =>
  v == null || v === "" ? <span className="text-[#b3b8c2]">-</span> : v;

/** One label/value cell (mirrors the feasibility snapshot house style). */
function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#6b7280]">
        {label}
      </span>
      <span className="text-[15.5px] font-bold leading-snug text-[#14151a]">
        {value}
      </span>
    </div>
  );
}

/** A titled section band — indigo accent + heading. */
function Band({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5 border-y-2 border-[#d6d9ea] bg-[#e7e9f6] px-4 py-2.5">
      <span className="h-4 w-1.5 shrink-0 rounded-full bg-[#3f3f94]" />
      <span className="text-[13.5px] font-black uppercase tracking-[0.1em] text-[#3f3f94]">
        {title}
      </span>
    </div>
  );
}

/**
 * Vendor record (Forms module) — a clean, read-only view of every stored field,
 * in the house card style. Back link returns to /vendors; admins get an Edit
 * button pointing at the Forms-module edit route.
 */
export default async function VendorRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  const gridClass =
    "grid grid-cols-2 divide-x divide-y divide-[#c6cbdd] sm:grid-cols-3 lg:grid-cols-4";

  return (
    <EnquiryModuleShell title="Vendors" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1100px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href={"/vendors" as Route}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6b7280] transition-colors hover:text-[#3f3f94]"
            >
              <ArrowLeft size={15} strokeWidth={2.4} />
              Vendors
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
                {vendor.name}
              </h1>
              {vendor.vendorCode && (
                <span
                  className="rounded-full bg-[#eef0fa] px-2.5 py-1 text-[12px] font-bold text-[#3f3f94]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {vendor.vendorCode}
                </span>
              )}
              {vendor.isActive ? (
                <span className="inline-flex items-center rounded-full bg-[rgba(34,150,83,0.10)] px-2.5 py-1 text-[11px] font-bold text-[#227a45]">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[rgba(15,23,42,0.05)] px-2.5 py-1 text-[11px] font-bold text-[#8a90a0]">
                  Inactive
                </span>
              )}
            </div>
          </div>
          {me.isAdmin && (
            <Link
              href={`/vendors/${vendor.id}/edit` as Route}
              className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
              style={{
                background:
                  "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
                boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
                fontWeight: 800,
              }}
            >
              <Pencil size={15} strokeWidth={2.4} />
              Edit
            </Link>
          )}
        </header>

        <div className="overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
          <Band title="Vendor & Contact" />
          <div className={gridClass}>
            <Cell label="Vendor Name" value={dash(vendor.name)} />
            <Cell label="Vendor Code" value={dash(vendor.vendorCode)} />
            <Cell label="Contact Person" value={dash(vendor.contactPerson)} />
            <Cell label="Contact No" value={dash(vendor.contactNo)} />
            <Cell
              label="Email"
              value={
                vendor.email ? (
                  <a
                    href={`mailto:${vendor.email}`}
                    className="break-all font-bold text-[#3f3f94] hover:underline"
                  >
                    {vendor.email}
                  </a>
                ) : (
                  dash(null)
                )
              }
            />
            <div className="col-span-full">
              <Cell label="Address" value={dash(vendor.address)} />
            </div>
          </div>

          <Band title="Default Terms" />
          <div className={gridClass}>
            <Cell
              label="Default Credit Days"
              value={
                vendor.defaultCreditDays != null
                  ? vendor.defaultCreditDays
                  : dash(null)
              }
            />
            <Cell label="Payment Terms" value={dash(vendor.paymentTerms)} />
            <Cell
              label="GST Applicable"
              value={vendor.isGstApplicable ? "Yes" : "No"}
            />
            <Cell
              label="Status"
              value={vendor.isActive ? "Active" : "Inactive"}
            />
          </div>

          <Band title="Notes" />
          <div className={gridClass}>
            <div className="col-span-full">
              <Cell label="Notes" value={dash(vendor.notes)} />
            </div>
          </div>
        </div>
      </div>
    </EnquiryModuleShell>
  );
}
