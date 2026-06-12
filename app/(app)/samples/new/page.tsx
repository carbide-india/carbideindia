import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { SampleForm } from "@/components/samples/sample-form";
import { requireUser } from "@/lib/auth/current";
import { listEmployeeOptions } from "@/lib/queries/employees";

export const dynamic = "force-dynamic";

export default async function NewSamplePage() {
  await requireUser();
  const employees = await listEmployeeOptions();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales · Sample Register
          </div>
          <h1 className="text-display-lg text-ink-strong mt-1">New Sample</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Register a physical sample — enter the sample number as written on
            the physical sample / register.
          </p>
        </header>
        <SampleForm employees={employees} />
      </main>
      <DashboardFooter />
    </>
  );
}
