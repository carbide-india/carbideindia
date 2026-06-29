import { requireAdmin } from "@/lib/auth/current";
import { listAllMasters } from "@/lib/queries/masters";
import { MasterList } from "@/components/admin/master-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masters — Carbide India" };

/**
 * App-level Masters hub (ERP forms/masters redesign — Phase A). Promoted out of
 * the dark admin shell into the normal app layout and reached from a header
 * pill. Still admin-only at the route level (requireAdmin).
 */
export default async function MastersPage() {
  await requireAdmin();
  const rows = await listAllMasters();
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Masters
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
            Masters
          </h1>
          <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
            {rows.length} options total · {activeCount} active — these feed the
            KYC and inquiry form dropdowns.
          </p>
        </div>
      </header>
      <MasterList items={rows} />
    </main>
  );
}
