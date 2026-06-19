import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { CostingTable } from "@/components/costings/costing-table";
import { requireUser } from "@/lib/auth/current";
import { listCostings } from "@/lib/queries/costings";

export const dynamic = "force-dynamic";

export default async function CostingsPage() {
  await requireUser();
  const rows = await listCostings();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1280px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales &middot; Costing Register
          </div>
          <h1 className="text-display-lg text-ink-strong mt-1">Costings</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            In-house and bought-out cost sheets &mdash; final cost per piece and
            quote value.
          </p>
        </header>
        <CostingTable rows={rows} />
      </main>
      <DashboardFooter />
    </>
  );
}
