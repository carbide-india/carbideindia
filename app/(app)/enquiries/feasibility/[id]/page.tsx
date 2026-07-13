import * as React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { Metadata } from "next";
import { ArrowUpRight, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { getInquiryById } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import {
  getInquiryWorkspaceHeader,
  getInquiryProducts,
  getInquiryItemFeasibility,
} from "@/lib/queries/sm-workspace";
import { FeasibilityPanel } from "@/components/inquiries/feasibility-panel";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import { INQUIRY_PRIORITY_LABELS } from "@/db/enums";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Primary Feasibility — Carbide India" };
  const header = await getInquiryWorkspaceHeader(id);
  return {
    title: header
      ? `Feasibility · ${header.smNumber} — Carbide India`
      : "Primary Feasibility — Carbide India",
  };
}

/**
 * Dedicated Primary Feasibility page — a standalone screen (launched from the
 * sidebar Primary Feasibility queue) that runs the per-product feasibility
 * check for one SM. The enquiry module shell is supplied by the enquiries
 * layout, so this page returns content only (no nested shell).
 */
export default async function PrimaryFeasibilityDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const header = await getInquiryWorkspaceHeader(id);
  if (!header) notFound();

  const [inquiry, products, employees, itemFeasibility] = await Promise.all([
    getInquiryById(id),
    getInquiryProducts(id),
    listEmployeeOptions(),
    getInquiryItemFeasibility(id),
  ]);
  if (!inquiry) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <div className="text-[13px] text-ink-subtle">
        <Link href={"/enquiries/feasibility" as Route} className="hover:text-[#3f3f94]">
          Primary Feasibility
        </Link>
        <span className="mx-1.5">&rsaquo;</span>
        <span className="font-semibold text-ink-strong">{header.smNumber}</span>
      </div>

      {/* One-line SM header + Edit. */}
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-hairline bg-surface-card px-6 py-4"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
      >
        <span className="font-mono text-[22px] font-black leading-none text-ink-strong">
          {header.smNumber}
        </span>
        <Chip
          label={INQUIRY_PRIORITY_LABELS[header.priority]}
          tone={PRIORITY_TONES[header.priority]}
        />
        <HeaderBit label="Client">
          {header.clientId ? (
            <Link
              href={`/clients/${header.clientId}` as Route}
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              {header.clientName}
              <ArrowUpRight size={12} strokeWidth={2.4} />
            </Link>
          ) : (
            header.clientName
          )}
        </HeaderBit>
        <HeaderBit label="Sales Person">{header.salesPersonName ?? "Not allocated"}</HeaderBit>
        <HeaderBit label="Created">{formatDate(header.createdAt)}</HeaderBit>
        <Link
          href={`/inquiries/${id}/edit` as Route}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft transition hover:border-brand hover:text-brand"
        >
          <Pencil size={15} strokeWidth={2.2} />
          Edit
        </Link>
      </div>

      <FeasibilityPanel
        inquiry={inquiry}
        products={products}
        itemFeasibility={itemFeasibility}
        employees={employees}
      />
    </div>
  );
}

function HeaderBit({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </span>
      <span className="text-[15px] font-bold text-ink-strong">{children}</span>
    </span>
  );
}
