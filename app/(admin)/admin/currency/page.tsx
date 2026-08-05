import { AlertOctagon, Clock3, Coins, TrendingUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import {
  getCreditDefaultsGap,
  getCreditExposure,
  getCreditPolicy,
  getCurrencyMasterView,
} from "@/lib/queries/currency";
import { RATE_STALE_DAYS } from "@/lib/validators/currency";
import { formatInr } from "@/lib/format";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { CurrencyWorkspace } from "@/components/admin/currency-workspace";
import { CurrencyTable } from "@/components/admin/currency-table";
import { CurrencyCreditPolicy } from "@/components/admin/currency-credit-policy";
import { CurrencyExposure } from "@/components/admin/currency-exposure";

export const dynamic = "force-dynamic";

export default async function CurrencyPage() {
  await requireAdmin();

  const [view, policy, gap, exposure] = await Promise.all([
    getCurrencyMasterView(),
    getCreditPolicy(),
    getCreditDefaultsGap(),
    getCreditExposure(),
  ]);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · Finance
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Currency &amp; Credit
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] text-[#6b7280] tabular-nums">
          {view.activeCount} active of {view.rows.length} currencies · base{" "}
          {view.settingsBaseCode} · default terms {policy.defaultCreditDays} days
          ·{" "}
          {policy.defaultCreditLimit === null
            ? "no default limit"
            : `${formatInr(policy.defaultCreditLimit)} default limit`}{" "}
          · {formatInr(exposure.totalOutstanding)} outstanding
        </p>
      </header>

      <div className="mb-8 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <AdminKpiTile
          index={0}
          tone="blue"
          label="Currencies"
          value={view.activeCount}
          hint={`${view.rows.length} defined · base ${view.settingsBaseCode}`}
          icon={<Coins size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={1}
          tone="purple"
          label="Rates to review"
          value={view.staleRateCount}
          hint={`Untouched for ${RATE_STALE_DAYS}+ days · maintained by hand`}
          icon={<Clock3 size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={2}
          tone="amber"
          label="Past terms"
          value={exposure.pastTermsCount}
          hint={`${formatInr(exposure.totalOverdue)} beyond credit days`}
          icon={<TrendingUp size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={3}
          tone="red"
          label="Over limit"
          value={exposure.overLimitCount}
          hint={
            policy.defaultCreditLimit === null && exposure.overLimitCount === 0
              ? "Only clients with their own limit are checked"
              : `${exposure.rows.length} clients carrying a balance`
          }
          icon={<AlertOctagon size={16} strokeWidth={2.2} />}
        />
      </div>

      <CurrencyWorkspace
        currencies={<CurrencyTable view={view} />}
        credit={<CurrencyCreditPolicy policy={policy} gap={gap} />}
        exposure={<CurrencyExposure exposure={exposure} policy={policy} />}
      />
    </div>
  );
}
