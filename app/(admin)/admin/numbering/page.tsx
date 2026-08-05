import { CalendarRange, FileStack, Hash, ListOrdered } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { getNumberingOverview } from "@/lib/queries/numbering";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { NumberingRegister } from "@/components/admin/numbering-register";

export const dynamic = "force-dynamic";

/**
 * Admin → Workflow & Data → Document Numbering.
 *
 * Every auto-generated number in the app in one register: prefix, padding, the
 * live counter, and the number the next document will actually carry. Editing
 * is deliberately narrow — see lib/queries/numbering.ts for which families own
 * their format here and which have it baked into code.
 */
export default async function NumberingPage() {
  await requireAdmin();
  const overview = await getNumberingOverview();

  const invoice = overview.families.find((f) => f.seriesKey === "invoice");
  const sm = overview.families.find((f) => f.seriesKey === "sm_number");

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · Workflow &amp; Data
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Document Numbering
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] text-[#6b7280] tabular-nums">
          {overview.totals.families} families · {overview.totals.active} listed ·{" "}
          {overview.totals.fyRegisters} FY registers open · FY {overview.currentFy}
          {invoice ? ` · next invoice ${invoice.nextPreview}` : ""}
          {sm ? ` · next enquiry ${sm.nextPreview}` : ""}
        </p>
      </header>

      {!overview.schemaReady ? (
        <div
          className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p
            className="font-serif text-ink-strong"
            style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
          >
            The numbering register isn&rsquo;t in the database yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
            <span className="font-mono text-[13px]">doc_number_formats</span> is
            missing. Apply the migrations and seed the defaults, then reload:
          </p>
          <p className="mx-auto mt-3 max-w-md rounded-chip border border-hairline bg-surface-soft px-4 py-2.5 font-mono text-[13px] text-ink-strong">
            pnpm db:migrate &amp;&amp; pnpm seed:defaults
          </p>
        </div>
      ) : (
        <>
          <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminKpiTile
              label="Families"
              value={overview.totals.families}
              hint="Document types the app numbers"
              tone="blue"
              icon={<Hash size={16} strokeWidth={2.2} />}
              index={0}
            />
            <AdminKpiTile
              label="FY registers"
              value={overview.totals.fyRegisters}
              hint={`Gapless counters · current FY ${overview.currentFy}`}
              tone="purple"
              icon={<CalendarRange size={16} strokeWidth={2.2} />}
              index={1}
            />
            <AdminKpiTile
              label="Live sequences"
              value={overview.totals.liveSequences}
              hint="Postgres sequences backing codes"
              tone="green"
              icon={<ListOrdered size={16} strokeWidth={2.2} />}
              index={2}
            />
            <AdminKpiTile
              label="Numbers issued"
              value={overview.totals.issued}
              hint="Records carrying a generated number"
              tone="amber"
              icon={<FileStack size={16} strokeWidth={2.2} />}
              index={3}
            />
          </div>

          <NumberingRegister overview={overview} />
        </>
      )}
    </div>
  );
}
