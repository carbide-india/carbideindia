import { CostingCalculatorShell } from "@/components/costings/costing-calculator-shell";
import { CostingTargetPicker } from "@/components/costings/costing-target-picker";
import { requireUser } from "@/lib/auth/current";
import {
  getCostingById,
  getCostingContext,
  getCostingSpecForItem,
  listCostingRegister,
} from "@/lib/queries/costings";
import { initialFromSnapshot } from "@/lib/costing/from-snapshot";
import { listVendorOptions, getVendorHistories } from "@/lib/queries/vendors";
import { listMasterOptions } from "@/lib/queries/masters";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

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
  // Edit / revise mode: re-open an existing costing pre-filled from its snapshot.
  const editCostingId = typeof sp.editCostingId === "string" ? sp.editCostingId : "";

  // A costing must attach to a specific product line. When the page is opened
  // without a valid target (e.g. the Forms launcher "Costing" tile or the
  // register's "New Costing" button), show a picker of feasibility-approved
  // lines instead of a dead-end 404.
  if (!UUID_RE.test(inquiryItemId) || !UUID_RE.test(inquiryId)) {
    // Same rows as the Costing Register, so a line's status on the picker can
    // never disagree with its status there — one query, two views.
    const costable = await listCostingRegister();
    return (
      <EnquiryModuleShell title="Costing Master" userMenu={<UserMenuServer />}>
        <div className="w-full">
          <CostingTargetPicker rows={costable} />
        </div>
      </EnquiryModuleShell>
    );
  }

  const [
    context,
    spec,
    vendorOptions,
    toolingChart,
    machiningOp,
    quantityTolerance,
    paymentTerm,
    externalGrade,
    internalGrade,
    tolerance,
    condition,
    internalProductionCode,
    partNo,
  ] = await Promise.all([
    getCostingContext(inquiryItemId),
    getCostingSpecForItem(inquiryItemId),
    listVendorOptions(),
    listMasterOptions("tooling_chart"),
    listMasterOptions("machining_op"),
    listMasterOptions("quantity_tolerance"),
    listMasterOptions("payment_term"),
    listMasterOptions("external_grade"),
    listMasterOptions("internal_grade"),
    listMasterOptions("tolerance"),
    listMasterOptions("condition"),
    listMasterOptions("internal_production_code"),
    listMasterOptions("part_no"),
  ]);

  // Hydrate each vendor option with its historical quoting metrics (derived from
  // past BO vendor quotes) so the Buy-Out matrix can show a subtle history chip
  // on vendor selection — no per-keystroke or per-selection fetch needed.
  const histories = await getVendorHistories(vendorOptions.map((v) => v.id));
  const vendorOptionsWithHistory = vendorOptions.map((v) => ({
    ...v,
    history: histories.get(v.id) ?? null,
  }));

  // In edit / revise mode, rehydrate the calculator from the costing's snapshot
  // (same product line only). A missing / malformed snapshot → blank calculator.
  const editRow = UUID_RE.test(editCostingId) ? await getCostingById(editCostingId) : null;
  const initial =
    editRow && editRow.inquiryItemId === inquiryItemId
      ? initialFromSnapshot(editRow.calculatorSnapshot)
      : null;

  return (
    <EnquiryModuleShell title="Costing Master" userMenu={<UserMenuServer />}>
      <div className="w-full">
        <CostingCalculatorShell
          inquiryItemId={inquiryItemId}
          inquiryId={inquiryId}
          editCostingId={initial ? editCostingId : undefined}
          initial={initial}
          productCaption={context.productCaption}
          lineQty={context.lineQty}
          smNumber={context.smNumber}
          enquiryDate={context.enquiryDate}
          vendorOptions={vendorOptionsWithHistory}
          masters={{ toolingChart, machiningOp, quantityTolerance, paymentTerm }}
          defaultPaymentTerms={context.customerPaymentTerms}
          spec={spec}
          specMasters={{
            externalGrade,
            internalGrade,
            tolerance,
            condition,
            internalProductionCode,
            partNo,
          }}
        />
      </div>
    </EnquiryModuleShell>
  );
}
