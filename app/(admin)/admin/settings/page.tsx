import { requireAdmin } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getIntegrationHealth } from "@/lib/queries/integration-health";
import { listRecentDispatchFailures, getDispatchLogTotals } from "@/lib/queries/dispatch-log";
import { listRecurringTemplates } from "@/lib/queries/recurring-templates";
import { getNotificationMatrix } from "@/lib/queries/notification-matrix";
import { getNextSmNumber } from "@/lib/queries/inquiries";
import { SmNumberCard } from "@/components/admin/sm-number-card";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { SettingsTabGeneral } from "@/components/admin/settings-tab-general";
import { SettingsTabLegal } from "@/components/admin/settings-tab-legal";
import { SettingsTabStatuses } from "@/components/admin/settings-tab-statuses";
import { SettingsTabIntegrations } from "@/components/admin/settings-tab-integrations";
import { SettingsTabNotifications } from "@/components/admin/settings-tab-notifications";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const [
    settings,
    statusDisplay,
    integrations,
    matrix,
    dispatchFailures,
    dispatchTotals,
    recurringTemplates,
    smNextNumber,
  ] = await Promise.all([
    getOrgSettings(),
    getStatusDisplayMap(),
    getIntegrationHealth(),
    getNotificationMatrix(),
    listRecentDispatchFailures({ limit: 50 }),
    getDispatchLogTotals(),
    listRecurringTemplates(),
    getNextSmNumber(),
  ]);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · Organization
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Organisation settings
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[#6b7280]">
          Identity, locale, statuses, integrations, and notification routing.
          Changes take effect immediately.
        </p>
      </header>

      <SettingsTabs
        general={
          <div className="flex flex-col gap-6">
            <SettingsTabGeneral current={settings} />
            <SmNumberCard nextNumber={smNextNumber} />
          </div>
        }
        legal={<SettingsTabLegal current={settings} />}
        statuses={<SettingsTabStatuses display={statusDisplay} />}
        integrations={
          <SettingsTabIntegrations
            rows={integrations}
            dispatchFailures={dispatchFailures}
            dispatchTotals={dispatchTotals}
            recurringTemplates={recurringTemplates}
          />
        }
        notifications={<SettingsTabNotifications initial={matrix} />}
      />
    </div>
  );
}
