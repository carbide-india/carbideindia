import type { ReactNode } from "react";
import { Percent, Landmark, FileDigit, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  listHsnCodes,
  listTaxRates,
  listUnmappedItemHsnCodes,
} from "@/lib/queries/tax";
import { AdminKpiTile, type AdminKpiTone } from "@/components/admin/admin-kpi-tile";
import { TaxTabs } from "@/components/admin/tax-tabs";
import { TaxRatesPanel } from "@/components/admin/tax-rates-panel";
import { TaxHsnPanel } from "@/components/admin/tax-hsn-panel";
import { TaxGstProfile } from "@/components/admin/tax-gst-profile";
import { TaxSplitExplainer } from "@/components/admin/tax-split-explainer";

export const dynamic = "force-dynamic";

export default async function TaxPage() {
  await requireAdmin();

  const [rates, hsn, unmapped, settings] = await Promise.all([
    listTaxRates(),
    listHsnCodes(),
    listUnmappedItemHsnCodes(),
    getOrgSettings(),
  ]);

  const activeRates = rates.filter((r) => r.isActive);
  const defaultRate = rates.find((r) => r.isDefault && r.isActive) ?? null;
  const mappedHsn = hsn.filter((h) => h.isActive && h.taxRateId).length;

  const tiles: ReadonlyArray<{
    label: string;
    value: number;
    hint: string;
    tone: AdminKpiTone;
    icon: ReactNode;
  }> = [
    {
      label: "Active slabs",
      value: activeRates.length,
      hint: `${rates.length} configured in total`,
      tone: "blue",
      icon: <Percent size={16} strokeWidth={2.2} />,
    },
    {
      label: "Default rate %",
      value: defaultRate ? defaultRate.ratePercent : 0,
      hint: defaultRate
        ? `${defaultRate.label} on new lines`
        : "None set — new lines carry no rate",
      tone: defaultRate ? "green" : "red",
      icon: <Landmark size={16} strokeWidth={2.2} />,
    },
    {
      label: "HSN mapped",
      value: mappedHsn,
      hint: `${hsn.length} code${hsn.length === 1 ? "" : "s"} in the master`,
      tone: "purple",
      icon: <FileDigit size={16} strokeWidth={2.2} />,
    },
    {
      label: "Unmapped on items",
      value: unmapped.length,
      hint:
        unmapped.length === 0
          ? "Every item code resolves a rate"
          : "Codes on items with no master row",
      tone: unmapped.length === 0 ? "green" : "amber",
      icon: <TriangleAlert size={16} strokeWidth={2.2} />,
    },
  ];

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
          Tax &amp; GST
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[#6b7280] tabular-nums">
          {rates.length} slab{rates.length === 1 ? "" : "s"} ·{" "}
          {defaultRate
            ? `${Number(defaultRate.ratePercent.toFixed(3))}% default`
            : "no default rate"}{" "}
          · {hsn.length} HSN code{hsn.length === 1 ? "" : "s"} ·{" "}
          {unmapped.length} unmapped on items
        </p>
      </header>

      <section className="mb-9 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {tiles.map((t, i) => (
          <AdminKpiTile
            key={t.label}
            label={t.label}
            value={t.value}
            hint={t.hint}
            tone={t.tone}
            icon={t.icon}
            index={i}
          />
        ))}
      </section>

      <TaxTabs
        rates={<TaxRatesPanel rates={rates} />}
        hsn={
          <TaxHsnPanel
            codes={hsn}
            rates={rates}
            unmapped={unmapped}
            defaultRateLabel={defaultRate?.label ?? null}
          />
        }
        profile={
          <div className="flex flex-col gap-6">
            <TaxGstProfile
              legalName={settings.legalName}
              gstin={settings.gstin}
              panNo={settings.panNo}
              regState={settings.regState}
              regCity={settings.regCity}
            />
            <TaxSplitExplainer rates={rates} />
          </div>
        }
      />
    </div>
  );
}
