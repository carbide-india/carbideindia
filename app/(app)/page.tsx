import { WmsShellServer } from "@/components/wms/wms-shell-server";
import { FilterBar } from "@/components/layout/filter-bar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { CollapsibleVelocity } from "@/components/dashboard/collapsible-velocity";
import { StatusTable } from "@/components/dashboard/status-table";
import { StatusDistributionChart } from "@/components/dashboard/status-distribution";
import { TopPerformersSection } from "@/components/dashboard/top-performers";
import { AgingHeatmap } from "@/components/dashboard/aging-heatmap";
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
import { MyDayCard } from "@/components/dashboard/my-day-card";
import { DashboardLoadError } from "@/components/dashboard/dashboard-load-error";
import { listEmployees } from "@/lib/queries/employees";
import { listDistinctSubjects } from "@/lib/queries/tasks";
import { loadDashboardData } from "@/lib/queries/dashboard";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getMyDayCounts } from "@/lib/queries/my-day";
import { getCurrentEmployee } from "@/lib/auth/current";
import { parseFilters } from "@/lib/filters";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const me = await getCurrentEmployee().catch(() => null);

  // Resilience: the dashboard fires many queries against a remote DB. A
  // single transient timeout must NOT crash the whole page. My Day
  // degrades to hidden (.catch → null); a core-data failure renders a
  // friendly Retry panel instead of the global "we hit a snag" boundary.
  let allEmployees: Awaited<ReturnType<typeof listEmployees>>;
  let data: Awaited<ReturnType<typeof loadDashboardData>>;
  let statusDisplay: Awaited<ReturnType<typeof getStatusDisplayMap>>;
  let myDay: Awaited<ReturnType<typeof getMyDayCounts>> | null;
  let subjects: string[];
  try {
    [allEmployees, data, statusDisplay, myDay, subjects] = await Promise.all([
      listEmployees(),
      loadDashboardData(filters),
      getStatusDisplayMap(),
      me ? getMyDayCounts(me.id).catch(() => null) : Promise.resolve(null),
      // Auxiliary (only powers the Subject filter chip) - must NEVER take down
      // the whole dashboard, so it degrades to an empty list on failure.
      listDistinctSubjects().catch(() => [] as string[]),
    ]);
  } catch (err) {
    console.error("[dashboard] data load failed:", err);
    return (
      <WmsShellServer>
        <main>
          <DashboardLoadError />
        </main>
      </WmsShellServer>
    );
  }

  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const isEmpty =
    allEmployees.length === 0 && data.statusTable.length === 0;

  const employeeOptions = allEmployees.map((e) => ({
    value: e.id,
    label: e.name,
  }));
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <WmsShellServer>
      <FilterBar
        employees={employeeOptions}
        subjects={subjects}
        initial={{
          start: isoDay(filters.startDate ?? new Date()),
          end:   isoDay(filters.endDate   ?? new Date()),
          emp:   filters.employeeIds,
          view:  filters.view,
          dept:  filters.departments,
          prio:  filters.priorities,
          subj:  filters.subjects,
        }}
      />
      <main>
        {isEmpty ? (
          <WelcomeHero />
        ) : (
          <>
            {me && myDay && (
              <MyDayCard
                firstName={me.name.split(" ")[0] ?? me.name}
                counts={myDay}
              />
            )}
            {/* The KPI grid and the two analytics panels share ONE band: six
                cards 3-across on the left, Status Distribution above Top
                Performers on the right. Below xl they stack into one column so
                neither side gets squeezed. */}
            <div className="mx-auto mt-10 grid max-w-[1600px] grid-cols-1 gap-6 px-12 max-md:px-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] xl:items-start">
              <KpiStrip kpis={data.kpis} summary={data.wmsSummary} />
              <div className="flex flex-col gap-6">
                <StatusDistributionChart
                  data={data.statusDistribution}
                  labels={statusLabels}
                  tones={statusTones}
                  isAdmin={Boolean(me?.isAdmin)}
                />
                <TopPerformersSection performers={data.topPerformers} />
              </div>
            </div>
            <StatusTable rows={data.statusTable} view={filters.view} />
            <AgingHeatmap rows={data.agingTable} cellTasks={data.agingHeatmapData.byCell} />
            <CollapsibleVelocity data={data.velocity} />
          </>
        )}
      </main>
    </WmsShellServer>
  );
}
