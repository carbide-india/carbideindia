import { headers } from "next/headers";
import { Globe2, ShieldCheck, UserCheck, Wifi } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  evaluateIpAccess,
  effectiveBypassEmails,
  isEffectiveBypassEmail,
  listAccessControlEvents,
  listIpAllowlistEntries,
  listRecentSignInIps,
  recordAllowlistSighting,
} from "@/lib/queries/access_control";
import { clientIpFromHeaders, isIpAllowed, IP_BYPASS_EMAILS } from "@/lib/ip-gate";
import { parseAllowedIpsEnv, parseCidr } from "@/lib/access-control-ip";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { AccessControlCurrentIp } from "@/components/admin/access-control-current-ip";
import { AccessControlEntryTable } from "@/components/admin/access-control-entry-table";
import { AccessControlEnvPanel } from "@/components/admin/access-control-env-panel";
import { AccessControlPolicyForm } from "@/components/admin/access-control-policy-form";
import { AccessControlSightings } from "@/components/admin/access-control-sightings";
import { AccessControlEvents } from "@/components/admin/access-control-events";

export const dynamic = "force-dynamic";

export default async function AccessControlPage() {
  const me = await requireAdmin();

  const h = await headers();
  const callerIp = clientIpFromHeaders(h);

  const settings = await getOrgSettings();
  const entries = await listIpAllowlistEntries(callerIp);
  const activeEntries = entries.filter((e) => e.isActive);
  const activeCidrs = activeEntries.map((e) => e.cidr);

  const [events, sightings, decision] = await Promise.all([
    listAccessControlEvents(12),
    listRecentSignInIps(activeCidrs, 8),
    evaluateIpAccess({ ip: callerIp, email: me.email }),
  ]);

  // Record that this address is live. Throttled to once per 15 minutes per
  // entry inside the query module, so a page refresh loop costs nothing.
  const coveringEntry = activeEntries.find((e) => e.matchesCallerIp) ?? null;
  if (coveringEntry) {
    await recordAllowlistSighting(coveringEntry.id, coveringEntry.lastSeenAt);
  }

  const envList = parseAllowedIpsEnv(process.env.ALLOWED_IPS);
  const envSet = new Set(envList);
  const registerCidrs = new Set(entries.map((e) => e.cidr));
  const envValues = envList.map((value) => {
    const parsed = parseCidr(value);
    return {
      value,
      valid: parsed !== null,
      inRegister:
        registerCidrs.has(value) ||
        (parsed !== null && registerCidrs.has(parsed.normalized)),
    };
  });
  const missingFromEnv = activeCidrs.filter((c) => !envSet.has(c));

  const bypassList = effectiveBypassEmails(settings.ipBypassEmails);
  const callerIsBypass = isEffectiveBypassEmail(me.email, settings.ipBypassEmails);
  const envGateOn = envList.length > 0;
  const envAdmits = isIpAllowed(callerIp, process.env.ALLOWED_IPS);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · People &amp; Access
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Access Control
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] tabular-nums text-[#6b7280]">
          {entries.length} register entr{entries.length === 1 ? "y" : "ies"} ·{" "}
          {activeEntries.length} active · {envList.length} value
          {envList.length === 1 ? "" : "s"} in ALLOWED_IPS · {bypassList.length} bypass
          email{bypassList.length === 1 ? "" : "s"} ·{" "}
          {settings.ipAllowlistEnforced ? "enforcement on" : "enforcement off"}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <AccessControlCurrentIp
          ip={callerIp}
          envAdmits={envAdmits}
          envGateOn={envGateOn}
          coveredBy={coveringEntry?.label ?? null}
          bypassEmail={callerIsBypass}
          dbAdmits={decision.allowed}
          enforced={settings.ipAllowlistEnforced}
        />

        <section className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <AdminKpiTile
            label="Active entries"
            value={activeEntries.length}
            hint={`${entries.length - activeEntries.length} deactivated on record`}
            tone="blue"
            icon={<ShieldCheck size={16} strokeWidth={2.2} />}
            index={0}
          />
          <AdminKpiTile
            label="In ALLOWED_IPS"
            value={envList.length}
            hint={envGateOn ? "Edge gate is live" : "Variable unset — see below"}
            tone={envGateOn ? "green" : "amber"}
            icon={<Globe2 size={16} strokeWidth={2.2} />}
            index={1}
          />
          <AdminKpiTile
            label="Gaps to close"
            value={missingFromEnv.length}
            hint="Active entries the edge gate still rejects"
            tone={missingFromEnv.length > 0 ? "amber" : "green"}
            icon={<Wifi size={16} strokeWidth={2.2} />}
            index={2}
          />
          <AdminKpiTile
            label="Bypass emails"
            value={bypassList.length}
            hint={
              settings.ipBypassEmails.length > 0
                ? "Set in this page"
                : "Falling back to lib/ip-gate.ts"
            }
            tone="purple"
            icon={<UserCheck size={16} strokeWidth={2.2} />}
            index={3}
          />
        </section>

        <AccessControlEntryTable
          entries={entries.map((e) => ({
            id: e.id,
            label: e.label,
            cidr: e.cidr,
            note: e.note,
            isActive: e.isActive,
            lastSeenAt: e.lastSeenAt ? e.lastSeenAt.toISOString() : null,
            createdByName: e.createdByName,
            updatedByName: e.updatedByName,
            matchesCallerIp: e.matchesCallerIp,
            inEnvAllowlist: e.inEnvAllowlist,
          }))}
          callerIp={callerIp}
          enforced={settings.ipAllowlistEnforced}
        />

        <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
          <AccessControlEnvPanel
            envValues={envValues}
            suggestedEnvValue={activeCidrs.join(",")}
            missingFromEnv={missingFromEnv}
            nodeEnv={process.env.NODE_ENV}
            enforced={settings.ipAllowlistEnforced}
          />
          <AccessControlPolicyForm
            initial={{
              ipAllowlistEnforced: settings.ipAllowlistEnforced,
              ipBypassEmails: settings.ipBypassEmails,
              idleTimeoutMinutes: settings.idleTimeoutMinutes,
              allowSelfRegister: settings.allowSelfRegister,
            }}
            codeFallbackEmails={[...IP_BYPASS_EMAILS]}
            activeEntryCount={activeEntries.length}
            callerCovered={coveringEntry !== null}
            callerIp={callerIp}
            callerEmail={me.email.trim().toLowerCase()}
            callerOnFallbackList={IP_BYPASS_EMAILS.has(
              me.email.trim().toLowerCase(),
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
          <AccessControlSightings
            sightings={sightings.map((s) => ({
              ip: s.ip,
              hits: s.hits,
              lastSeenAt: s.lastSeenAt.toISOString(),
              people: s.people,
              covered: s.covered,
            }))}
          />
          <AccessControlEvents
            events={events.map((e) => ({
              id: e.id,
              eventType: e.eventType,
              actorName: e.actorName,
              createdAt: e.createdAt,
              fromValue: e.fromValue,
              toValue: e.toValue,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
