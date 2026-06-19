import { notFound } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { CostingForm } from "@/components/costings/costing-form";
import { requireUser } from "@/lib/auth/current";
import { getInquiryItemCaption } from "@/lib/queries/costings";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewCostingPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;

  const inquiryItemId = typeof sp.inquiryItemId === "string" ? sp.inquiryItemId : "";
  const inquiryId = typeof sp.inquiryId === "string" ? sp.inquiryId : "";

  // Both UUIDs are required — without them we cannot save a costing.
  if (!UUID_RE.test(inquiryItemId) || !UUID_RE.test(inquiryId)) {
    notFound();
  }

  const productCaption = await getInquiryItemCaption(inquiryItemId);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales &middot; Costing
          </div>
          <h1 className="text-display-lg text-ink-strong mt-1">New Costing</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            In-house or bought-out cost sheet &mdash; live estimate updates as
            you type.
          </p>
        </header>
        <CostingForm
          inquiryItemId={inquiryItemId}
          inquiryId={inquiryId}
          productCaption={productCaption}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
