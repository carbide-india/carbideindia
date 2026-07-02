import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getInquiryById, getInquiryItems } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listMasterOptions } from "@/lib/queries/masters";
import { getChosenCostingsForInquiry } from "@/lib/queries/costings";
import { InquiryDetail } from "@/components/inquiries/inquiry-detail";
import { WorkflowStepper } from "@/components/workflow/workflow-stepper";
import { smRollupStage } from "@/lib/flow/derive-stage";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Enquiry — Carbide India" };
  const inquiry = await getInquiryById(id);
  return {
    title: inquiry
      ? `${inquiry.smNumber} · ${inquiry.companyName} — Carbide India`
      : "Enquiry — Carbide India",
  };
}

export default async function InquiryDetailPage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const inquiry = await getInquiryById(id);
  if (!inquiry) notFound();

  const [employees, grades, tolerances, conditions, items, chosenCostings] = await Promise.all([
    listEmployeeOptions(),
    listMasterOptions("internal_grade"),
    listMasterOptions("tolerance"),
    listMasterOptions("condition"),
    getInquiryItems(id),
    getChosenCostingsForInquiry(id),
  ]);

  // Resolve master ids → display names server-side; the detail view is
  // read-only for these, so names are all it needs.
  const masterNames = {
    grade: grades.find((g) => g.id === inquiry.gradeId)?.name ?? null,
    tolerance: tolerances.find((t) => t.id === inquiry.toleranceId)?.name ?? null,
    condition: conditions.find((c) => c.id === inquiry.conditionId)?.name ?? null,
  };

  // Build a map for O(1) lookup of chosen costing per inquiry_item.
  const costingByItemId = new Map(
    chosenCostings.map((c) => [c.inquiryItemId, c]),
  );

  // Spec (shape/grade/tolerance/condition names, dims, item code) is already
  // resolved read-through from the linked Item inside getInquiryItems (§2.4);
  // here we only overlay the chosen-costing summary per line.
  const products = items.map((it) => {
    const costing = costingByItemId.get(it.id);
    return {
      ...it,
      itemCode: it.itemCode ?? null,
      costingFinalCost: costing?.finalCostPerPiece ?? null,
      costingDoneStatus: costing?.costingDoneStatus ?? null,
    };
  });

  // Phase 8 — read-only SM roll-up stepper (§4.5), fed solely by derive-stage.
  // Cheap header signals; a full per-line roll-up lands with the Phase-9 SM
  // workspace. Safe to render always (no advance CTA on the SM navigator).
  const smStage = smRollupStage({
    enquiryStatus: inquiry.enquiryStatus,
    hasCosting: chosenCostings.length > 0,
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <WorkflowStepper resolved={smStage} />
      <InquiryDetail inquiry={inquiry} employees={employees} masterNames={masterNames} products={products} isAdmin={me.isAdmin} />
    </main>
  );
}
