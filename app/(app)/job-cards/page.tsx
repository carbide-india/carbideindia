import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { BackLink } from "@/components/ui/back-link";
import { requireUser } from "@/lib/auth/current";
import { listJobCards, getJobCardPickerData } from "@/lib/queries/job-cards";
import { JobCardWorkbench } from "@/components/job-cards/job-card-workbench";

export const dynamic = "force-dynamic";

export default async function JobCardsPage() {
  const me = await requireUser();
  const [rows, picker] = await Promise.all([
    listJobCards(),
    getJobCardPickerData(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-10 pb-20">
        <div className="mb-4">
          <BackLink href="/" label="Dashboard" />
        </div>
        <header className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Production · Job Cards
          </div>
          <h1
            className="mt-1 text-ink-strong"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 44,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Job Cards
          </h1>
          <p className="text-body-lg text-ink-subtle mt-2 tabular-nums">
            {rows.length} {rows.length === 1 ? "work order" : "work orders"} -
            the production work order. Pick a customer &amp; product to auto-fill
            grade, dimensions &amp; tolerance.
          </p>
        </header>
        <JobCardWorkbench rows={rows} picker={picker} isAdmin={me.isAdmin} />
      </main>
      <DashboardFooter />
    </>
  );
}
