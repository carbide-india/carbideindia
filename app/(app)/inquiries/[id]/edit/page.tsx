import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { InquiryForm } from "@/components/inquiries/inquiry-form";
import type { InquiryFormValues } from "@/components/inquiries/inquiry-form";
import { requireUser } from "@/lib/auth/current";
import { getInquiryById, getInquiryEditValues } from "@/lib/queries/inquiries";
import { listClientOptions } from "@/lib/queries/clients";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listMasterOptions, getShapeProfiles } from "@/lib/queries/masters";
import { listCustomOptionsMap } from "@/lib/queries/custom-lists";
import { listSampleOptions } from "@/lib/queries/samples";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Edit Enquiry - Carbide India" };
  const inquiry = await getInquiryById(id);
  return {
    title: inquiry
      ? `Edit ${inquiry.smNumber} - Carbide India`
      : "Edit Enquiry - Carbide India",
  };
}

/**
 * Edit Enquiry - now rendered inside the new Enquiry module shell (Carbide
 * sidebar + indigo header) instead of the legacy WMS chrome.
 */
export default async function EditInquiryPage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const inquiry = await getInquiryById(id);
  if (!inquiry) notFound();

  const [
    clients,
    employees,
    grades,
    tolerances,
    conditions,
    externalGrades,
    internalProductionCodes,
    partNos,
    shapes,
    shapeProfiles,
    enquiryLists,
    sampleOptions,
  ] = await Promise.all([
    listClientOptions(),
    listEmployeeOptions(),
    listMasterOptions("internal_grade"),
    listMasterOptions("tolerance"),
    listMasterOptions("condition"),
    listMasterOptions("external_grade"),
    listMasterOptions("internal_production_code"),
    listMasterOptions("part_no"),
    listMasterOptions("shape"),
    getShapeProfiles(),
    listCustomOptionsMap("enquiry"),
    listSampleOptions(),
  ]);

  // Same picker payload the New Enquiry form builds — lets the edit form render
  // the (add-only) Products section so new products can be appended.
  const pickerMasters = {
    shapes,
    grades,
    tolerances,
    conditions,
    shapeProfilesById: shapeProfiles.byId,
  };

  const initialValues = getInquiryEditValues(inquiry) as Partial<InquiryFormValues>;

  return (
    <EnquiryModuleShell title="Edit Enquiry" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-4">
          <Link
            href={`/enquiries/register/${id}` as Route}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle transition hover:text-[#3f3f94]"
          >
            <ArrowLeft size={14} strokeWidth={2.4} />
            {inquiry.smNumber}
          </Link>
        </div>
        <header className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
            Sales · SM Repo
          </div>
          <h1 className="mt-1 text-[26px] font-black tracking-tight text-[#3f3f94]">
            Edit Enquiry
          </h1>
          <p className="mt-1 text-[14px] text-ink-subtle">
            Update the enquiry header, client snapshot, and checklist. You can also add new
            products here — existing products and their costings are managed from the SM Repo.
          </p>
        </header>
        <InquiryForm
          clients={clients}
          employees={employees}
          grades={grades}
          tolerances={tolerances}
          conditions={conditions}
          externalGrades={externalGrades}
          internalProductionCodes={internalProductionCodes}
          partNos={partNos}
          shapeProfiles={shapeProfiles.byName}
          pickerMasters={pickerMasters}
          stateOptions={enquiryLists["state"]}
          cityOptions={enquiryLists["city"]}
          unitOptions={enquiryLists["unit"]}
          currencyOptions={enquiryLists["currency"]}
          countryOptions={enquiryLists["country"]}
          uomOptions={enquiryLists["uom"]}
          sampleOptions={sampleOptions}
          defaultSalesPersonId={inquiry.assignedSalesPersonId ?? me.id}
          editInquiryId={id}
          initialValues={initialValues}
        />
      </div>
    </EnquiryModuleShell>
  );
}
