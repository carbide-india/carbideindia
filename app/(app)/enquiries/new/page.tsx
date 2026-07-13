import type { Metadata } from "next";
import { InquiryForm } from "@/components/inquiries/inquiry-form";
import { requireUser } from "@/lib/auth/current";
import { listClientOptions } from "@/lib/queries/clients";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listMasterOptions, getShapeProfiles } from "@/lib/queries/masters";
import { getEnquiryDraft } from "@/lib/queries/enquiry-drafts";
import { listCustomOptionsMap } from "@/lib/queries/custom-lists";
import type { InquiryFormValues } from "@/components/inquiries/inquiry-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New Enquiry — Carbide India",
};

interface PageProps {
  searchParams: Promise<{ draft?: string }>;
}

export default async function EnquiriesNewPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const sp = await searchParams;
  const draftParam = typeof sp.draft === "string" ? sp.draft : undefined;

  const [clients, employees, grades, tolerances, conditions, departments, shapes, shapeProfiles, enquiryLists] = await Promise.all([
    listClientOptions(),
    listEmployeeOptions(),
    listMasterOptions("internal_grade"),
    listMasterOptions("tolerance"),
    listMasterOptions("condition"),
    listMasterOptions("department"),
    listMasterOptions("shape"),
    getShapeProfiles(),
    listCustomOptionsMap("enquiry"),
  ]);

  const draftPayload = draftParam ? await getEnquiryDraft(draftParam) : null;

  const pickerMasters = {
    shapes,
    grades,
    tolerances,
    conditions,
    shapeProfilesById: shapeProfiles.byId,
  };

  return (
    <div className="w-full">
      <InquiryForm
        clients={clients}
        employees={employees}
        grades={grades}
        tolerances={tolerances}
        conditions={conditions}
        departments={departments}
        shapeProfiles={shapeProfiles.byName}
        pickerMasters={pickerMasters}
        stateOptions={enquiryLists["state"]}
        cityOptions={enquiryLists["city"]}
        unitOptions={enquiryLists["unit"]}
        defaultSalesPersonId={me.id}
        enableDrafts
        resumeDraftId={draftPayload ? draftParam : undefined}
        initialValues={draftPayload ? (draftPayload as Partial<InquiryFormValues>) : undefined}
      />
    </div>
  );
}
