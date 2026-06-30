import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { InquiryForm } from "@/components/inquiries/inquiry-form";
import type { InquiryFormValues } from "@/components/inquiries/inquiry-form";
import { BackLink } from "@/components/ui/back-link";
import { requireUser } from "@/lib/auth/current";
import { getInquiryById, getInquiryEditValues } from "@/lib/queries/inquiries";
import { listClientOptions } from "@/lib/queries/clients";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listMasterOptions, getShapeProfiles } from "@/lib/queries/masters";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Edit Enquiry — Carbide India" };
  const inquiry = await getInquiryById(id);
  return {
    title: inquiry
      ? `Edit ${inquiry.smNumber} — Carbide India`
      : "Edit Enquiry — Carbide India",
  };
}

export default async function EditInquiryPage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const inquiry = await getInquiryById(id);
  if (!inquiry) notFound();

  const [clients, employees, grades, tolerances, conditions, shapeProfiles] =
    await Promise.all([
      listClientOptions(),
      listEmployeeOptions(),
      listMasterOptions("internal_grade"),
      listMasterOptions("tolerance"),
      listMasterOptions("condition"),
      getShapeProfiles(),
    ]);

  // `quantityUom` is a plain TEXT column whereas the form input type wants the
  // QUANTITY_UOMS enum — the values always come from that enum, so cast the
  // mapper's output to the form's partial input shape.
  const initialValues = getInquiryEditValues(inquiry) as Partial<InquiryFormValues>;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <div className="mb-4">
          <BackLink href={`/inquiries/${id}`} label={inquiry.smNumber} />
        </div>
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales · SM Repo
          </div>
          <h1 className="text-display-lg text-ink-strong mt-1">Edit Enquiry</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Update the enquiry header, client snapshot, and checklist. Products
            and costings are managed from the SM Repo.
          </p>
        </header>
        <InquiryForm
          clients={clients}
          employees={employees}
          grades={grades}
          tolerances={tolerances}
          conditions={conditions}
          shapeProfiles={shapeProfiles.byName}
          defaultSalesPersonId={inquiry.assignedSalesPersonId ?? me.id}
          editInquiryId={id}
          initialValues={initialValues}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
