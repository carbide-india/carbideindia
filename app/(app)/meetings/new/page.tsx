import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { requireUser } from "@/lib/auth/current";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listClientOptions } from "@/lib/queries/clients";
import { listMasterOptions } from "@/lib/queries/masters";

export const dynamic = "force-dynamic";

export default async function NewMeetingPage() {
  const me = await requireUser();
  const [employees, clients, customerTypes] = await Promise.all([
    listEmployeeOptions(),
    listClientOptions(),
    listMasterOptions("customer_type"),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales · Daily Meetings
          </div>
          <h1 className="text-display-lg text-ink-strong mt-1">New Meeting</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Log a client visit — sales and contact details, timing, and the
            meeting outcome.
          </p>
        </header>
        <MeetingForm
          defaultSalesPersonId={me.id}
          defaultSalesName={me.name}
          defaultSalesEmail={me.email}
          employees={employees}
          clients={clients}
          customerTypes={customerTypes}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
