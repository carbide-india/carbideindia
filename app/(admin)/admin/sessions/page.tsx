import { BellRing, MonitorSmartphone, ShieldAlert, Wifi } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { getSessionOverview } from "@/lib/queries/sessions";
import { recordCurrentSession } from "@/lib/sessions/record";
import { sessionAge, sessionStamp } from "@/lib/sessions/format";
import { AdminKpiTile, type AdminKpiTone } from "@/components/admin/admin-kpi-tile";
import { SessionsNotice } from "@/components/admin/sessions-notice";
import { SessionsStaleSweep } from "@/components/admin/sessions-stale-sweep";
import {
  SessionsTable,
  type SessionEmployeeVM,
  type SessionRowState,
} from "@/components/admin/sessions-table";

export const dynamic = "force-dynamic";

/**
 * Admin -> System -> Sessions.
 *
 * Visiting the page also RECORDS the viewing admin's own session (see
 * lib/sessions/record.ts) - that is deliberate: the register should contain the
 * person reading it, and on a fresh install it guarantees at least one honest
 * row instead of an empty screen with no explanation.
 */
export default async function SessionsPage() {
  const me = await requireAdmin();

  const recorded = await recordCurrentSession(me.id);
  const overview = await getSessionOverview(recorded?.sessionKey ?? null);
  const { policy, rows, generatedAt } = overview;

  const vms: SessionEmployeeVM[] = rows.map((r) => {
    const state: SessionRowState =
      r.onlineSessionCount > 0
        ? "online"
        : r.liveSessionCount > 0
          ? "idle"
          : r.sessions.length > 0
            ? "signed_out"
            : "never";

    return {
      id: r.id,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatarUrl,
      department: r.department,
      designation: r.designation,
      isActive: r.isActive,
      isAdmin: r.isAdmin,
      hasFirebaseUid: r.hasFirebaseUid,
      state,
      liveSessionCount: r.liveSessionCount,
      onlineSessionCount: r.onlineSessionCount,
      pushCount: r.pushDevices.length,
      lastSeenLabel: r.lastSeenAt ? sessionStamp(r.lastSeenAt) : null,
      lastSeenAge: r.lastSeenAt ? sessionAge(r.lastSeenAt, generatedAt) : null,
      lastIp: r.lastIp,
      lastDeviceLabel: r.lastDeviceLabel,
      firebaseSignInLabel: r.firebase?.lastSignInAt
        ? sessionStamp(r.firebase.lastSignInAt)
        : null,
      firebaseSignInAge: r.firebase?.lastSignInAt
        ? sessionAge(r.firebase.lastSignInAt, generatedAt)
        : null,
      firebaseTokensValidAfterLabel: r.firebase?.tokensValidAfterAt
        ? sessionStamp(r.firebase.tokensValidAfterAt)
        : null,
      firebaseDisabled: r.firebase?.disabled ?? false,
      sessions: r.sessions.map((d) => ({
        id: d.id,
        state: d.state,
        isCurrent: d.isCurrent,
        ip: d.ip,
        deviceLabel: d.deviceLabel,
        userAgent: d.userAgent,
        startedLabel: sessionStamp(d.startedAt),
        lastSeenLabel: sessionStamp(d.lastSeenAt),
        lastSeenAge: sessionAge(d.lastSeenAt, generatedAt),
        revokedLabel: d.revokedAt ? sessionStamp(d.revokedAt) : null,
        revokedByName: d.revokedByName,
        revokeReason: d.revokeReason,
      })),
      pushDevices: r.pushDevices.map((p) => ({
        id: p.id,
        endpointHost: p.endpointHost,
        deviceLabel: p.deviceLabel,
        userAgent: p.userAgent,
        addedLabel: sessionStamp(p.createdAt),
        lastSeenAge: sessionAge(p.lastSeenAt, generatedAt),
      })),
    };
  });

  const onlinePeople = vms.filter((v) => v.state === "online").length;
  const liveSessions = vms.reduce((sum, v) => sum + v.liveSessionCount, 0);
  const pushDevices = vms.reduce((sum, v) => sum + v.pushCount, 0);
  // Someone whose account is off but whose session record is still live is the
  // one genuinely actionable risk this page can surface.
  const deactivatedButLive = vms.filter(
    (v) => !v.isActive && v.liveSessionCount > 0,
  ).length;

  const tiles: {
    label: string;
    value: number;
    hint: string;
    tone: AdminKpiTone;
    icon: React.ReactNode;
  }[] = [
    {
      label: "Online now",
      value: onlinePeople,
      hint: `Seen in the last ${policy.idleTimeoutMinutes} min`,
      tone: "green",
      icon: <Wifi size={16} strokeWidth={2.2} />,
    },
    {
      label: "Live sessions",
      value: liveSessions,
      hint: `Records under ${policy.sessionMaxHours} h old`,
      tone: "blue",
      icon: <MonitorSmartphone size={16} strokeWidth={2.2} />,
    },
    {
      label: "Push devices",
      value: pushDevices,
      hint: "Browsers registered for notifications",
      tone: "purple",
      icon: <BellRing size={16} strokeWidth={2.2} />,
    },
    {
      label: "Needs attention",
      value: deactivatedButLive,
      hint: "Deactivated accounts with a live session",
      tone: "red",
      icon: <ShieldAlert size={16} strokeWidth={2.2} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div>
          <span
            className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
            style={{ fontFamily: "var(--font-mono-display)" }}
          >
            Admin · System
          </span>
          <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
            Sessions
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] tabular-nums text-[#6b7280]">
            {vms.length} people · {liveSessions} live session
            {liveSessions === 1 ? "" : "s"} · {overview.totalSessionRows} record
            {overview.totalSessionRows === 1 ? "" : "s"} · {pushDevices} push device
            {pushDevices === 1 ? "" : "s"} · as of {sessionStamp(generatedAt)} IST
          </p>
        </div>
        <div className="mt-1">
          <SessionsStaleSweep liveCount={liveSessions} />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
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

      <SessionsNotice
        firebaseAvailable={overview.firebaseAvailable}
        firebaseError={overview.firebaseError}
        noSessionRows={overview.totalSessionRows === 0}
        idleTimeoutMinutes={policy.idleTimeoutMinutes}
        sessionMaxHours={policy.sessionMaxHours}
      />

      <SessionsTable
        rows={vms}
        currentEmployeeId={me.id}
        firebaseAvailable={overview.firebaseAvailable}
      />
    </div>
  );
}
