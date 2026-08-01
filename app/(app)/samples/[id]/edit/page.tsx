import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Route } from "next";
import { ArrowLeft } from "lucide-react";
import { SampleForm } from "@/components/samples/sample-form";
import type { SampleFormValues } from "@/components/samples/sample-form";
import { requireUser } from "@/lib/auth/current";
import { getSampleById } from "@/lib/queries/samples";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listCustomOptionsMap } from "@/lib/queries/custom-lists";
import { listClientOptions } from "@/lib/queries/clients";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Date → local YYYY-MM-DD for the form's <input type="date"> prefill. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Edit Sample - Carbide India" };
  const sample = await getSampleById(id);
  return {
    title: sample
      ? `Edit ${sample.sampleNo ?? "Sample"} - Carbide India`
      : "Edit Sample - Carbide India",
  };
}

export default async function EditSamplePage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const sample = await getSampleById(id);
  if (!sample) notFound();

  const [employees, customLists, clients] = await Promise.all([
    listEmployeeOptions(),
    listCustomOptionsMap("sample"),
    listClientOptions(),
  ]);

  // Map the stored row onto the form's <input>-shaped values (dates as
  // YYYY-MM-DD, nulls as ""); costing fields have no UI but round-trip through
  // RHF state so an edit never resets them.
  const initialValues: Partial<SampleFormValues> = {
    sampleDate: toDateInput(sample.sampleDate),
    clientId: sample.clientId ?? undefined,
    inquiryId: sample.inquiryId ?? undefined,
    sampleNo: sample.sampleNo ?? "",
    location: sample.location,
    responsiblePersonId: sample.responsiblePersonId ?? undefined,
    photoUrls: sample.photoUrls ?? [],
    sampleNotes: sample.sampleNotes ?? "",
    sampleStatus: sample.sampleStatus,
    dimensionStatus: sample.dimensionStatus,
    dimensionLocation: sample.dimensionLocation,
    dimensionCompletedOn: toDateInput(sample.dimensionCompletedOn),
    dimensionNotes: sample.dimensionNotes ?? "",
    dimensionAudioUrl: sample.dimensionAudioUrl ?? "",
    chemicalStatus: sample.chemicalStatus,
    chemicalLocation: sample.chemicalLocation,
    chemicalCompletedOn: toDateInput(sample.chemicalCompletedOn),
    chemicalNotes: sample.chemicalNotes ?? "",
    chemicalAudioUrl: sample.chemicalAudioUrl ?? "",
    drawingStatus: sample.drawingStatus,
    drawingLocation: sample.drawingLocation,
    drawingCompletedOn: toDateInput(sample.drawingCompletedOn),
    drawingNotes: sample.drawingNotes ?? "",
    drawingAudioUrl: sample.drawingAudioUrl ?? "",
    costingStatus: sample.costingStatus,
    costingCompletedOn: toDateInput(sample.costingCompletedOn),
    reportsUploaded: sample.reportsUploaded ?? [],
    reportsInSmFolder: sample.reportsInSmFolder,
    processedDate: toDateInput(sample.processedDate),
    processNotes: sample.processNotes ?? "",
  };

  return (
    <EnquiryModuleShell title="Sample Register" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <Link
              href={`/samples/${id}` as Route}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6b7280] transition hover:text-[#3f3f94]"
            >
              <ArrowLeft size={15} strokeWidth={2.4} />
              Back to sample
            </Link>
            <h1 className="mt-1.5 text-[22px] font-bold tracking-tight text-[#1f2430]">
              Edit{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>{sample.sampleNo ?? "Sample"}</span>
            </h1>
          </div>
        </div>
        <SampleForm
          employees={employees}
          clients={clients}
          sampleLocationOptions={customLists.sample_location}
          stageLocationOptions={customLists.stage_location}
          reportOptions={customLists.sample_report}
          editSampleId={id}
          initialValues={initialValues}
        />
      </div>
    </EnquiryModuleShell>
  );
}
