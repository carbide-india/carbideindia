import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current";
import { listAllMasters } from "@/lib/queries/masters";
import { MASTER_KINDS, MASTER_KIND_LABELS, type MasterKind } from "@/db/enums";
import { MasterKindWorkbench } from "@/components/masters/master-kind-workbench";

export const dynamic = "force-dynamic";

const KIND_DESCRIPTION: Record<MasterKind, string> = {
  customer_type:
    "Categorise clients (OEM, Distributor, Trader) — drives KYC onboarding and reporting segments.",
  industry_type:
    "The sector a client operates in (Mining, Automotive, Aerospace) — set on the KYC form.",
  product_type:
    "High-level product families a client buys — the multi-select checklist on the KYC form.",
  internal_grade:
    "Carbide grades used across inquiries, items and job cards for application matching.",
  tolerance:
    "Dimensional tolerance classes referenced by inquiries, items and job cards.",
  condition:
    "Delivery / finish condition of a product (Sintered, Ground) used throughout the pipeline.",
  department:
    "Owning team on a client or enquiry (New Product Development, Sales, Quotation, Purchase, Director).",
  size: "Size classes that feed the assembled Item Master code — each carries a short code.",
  shape: "Product shapes that feed the Item Master code and drive the dimension forms.",
  dispatch_condition:
    "How a finished job is dispatched — selected on production job cards.",
  pressing_type:
    "Pressing method used in production, referenced by job cards for routing.",
};

interface PageProps {
  params: Promise<{ kind: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind } = await params;
  const label = (MASTER_KINDS as readonly string[]).includes(kind)
    ? MASTER_KIND_LABELS[kind as MasterKind]
    : "Masters";
  return { title: `${label} — Masters — Carbide India` };
}

export default async function MasterKindPage({ params }: PageProps) {
  await requireAdmin();
  const { kind } = await params;

  if (!(MASTER_KINDS as readonly string[]).includes(kind)) {
    notFound();
  }
  const masterKind = kind as MasterKind;

  const all = await listAllMasters();
  const options = all.filter((o) => o.kind === masterKind);

  return (
    <MasterKindWorkbench
      kind={masterKind}
      label={MASTER_KIND_LABELS[masterKind]}
      description={KIND_DESCRIPTION[masterKind]}
      options={options}
    />
  );
}
