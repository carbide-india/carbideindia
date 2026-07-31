import { CostingCalculatorShell } from "@/components/costings/costing-calculator-shell";
import { CostingTargetPicker } from "@/components/costings/costing-target-picker";
import { requireUser } from "@/lib/auth/current";
import {
  getCostingContext,
  getCostingSpecForItem,
  listCostableInquiryItems,
} from "@/lib/queries/costings";
import { listVendorOptions } from "@/lib/queries/vendors";
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

  // A costing must attach to a specific product line. When the page is opened
  // without a valid target (e.g. the Forms launcher "Costing" tile or the
  // register's "New Costing" button), show a picker of feasibility-approved
  // lines instead of a dead-end 404.
  if (!UUID_RE.test(inquiryItemId) || !UUID_RE.test(inquiryId)) {
    const costable = await listCostableInquiryItems();
    return (
      <EnquiryModuleShell title="Costing Master" userMenu={<UserMenuServer />}>
        <div className="w-full">
          <CostingTargetPicker items={costable} />
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

  return (
    <EnquiryModuleShell title="Costing Master" userMenu={<UserMenuServer />}>
      <div className="w-full">
        <CostingCalculatorShell
          inquiryItemId={inquiryItemId}
          inquiryId={inquiryId}
          productCaption={context.productCaption}
          lineQty={context.lineQty}
          smNumber={context.smNumber}
          enquiryDate={context.enquiryDate}
          vendorOptions={vendorOptions}
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
