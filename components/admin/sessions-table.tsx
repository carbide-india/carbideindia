"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import {
  ChevronDown,
  Monitor,
  Search,
  ShieldOff,
  Smartphone,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  SessionsRevokeDialog,
  type RevokeTarget,
} from "@/components/admin/sessions-revoke-dialog";
import { SessionsConfirmDialog } from "@/components/admin/sessions-confirm-dialog";
import {
  removePushDevice,
  revokeLoginSession,
} from "@/app/(admin)/admin/sessions/actions";

/* ── View models (built on the server; every field is a plain string) ───── */

export type SessionRowState = "online" | "idle" | "signed_out" | "never";

export interface SessionDeviceVM {
  id: string;
  state: "online" | "idle" | "expired" | "revoked";
  isCurrent: boolean;
  ip: string | null;
  deviceLabel: string | null;
  userAgent: string | null;
  startedLabel: string;
  lastSeenLabel: string;
  lastSeenAge: string;
  revokedLabel: string | null;
  revokedByName: string | null;
  revokeReason: string | null;
}

export interface PushDeviceVM {
  id: string;
  endpointHost: string;
  deviceLabel: string | null;
  userAgent: string | null;
  addedLabel: string;
  lastSeenAge: string;
}

export interface SessionEmployeeVM {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  department: string | null;
  designation: string | null;
  isActive: boolean;
  isAdmin: boolean;
  hasFirebaseUid: boolean;
  state: SessionRowState;
  liveSessionCount: number;
  onlineSessionCount: number;
  pushCount: number;
  lastSeenLabel: string | null;
  lastSeenAge: string | null;
  lastIp: string | null;
  lastDeviceLabel: string | null;
  /** Firebase-reported sign-in, null when the SDK was unavailable or never used. */
  firebaseSignInLabel: string | null;
  firebaseSignInAge: string | null;
  firebaseTokensValidAfterLabel: string | null;
  firebaseDisabled: boolean;
  sessions: SessionDeviceVM[];
  pushDevices: PushDeviceVM[];
}

interface Props {
  rows: SessionEmployeeVM[];
  currentEmployeeId: string;
  firebaseAvailable: boolean;
}

/* ── Small presentational pieces ───────────────────────────────────────── */

const STATE_CHIP: Record<
  SessionRowState,
  { bg: string; fg: string; dot: string; label: string }
> = {
  online:     { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)", dot: "var(--color-green)", label: "Online" },
  idle:       { bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)", dot: "var(--color-amber)", label: "Idle" },
  signed_out: { bg: "rgba(15,23,42,0.05)",   fg: "var(--color-ink-subtle)", dot: "var(--color-ink-subtle)", label: "Signed out" },
  never:      { bg: "rgba(15,23,42,0.03)",   fg: "#9aa1b0",                dot: "#c7ccd6", label: "Never seen" },
};

function StateChip({ state }: { state: SessionRowState }) {
  const c = STATE_CHIP[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

const DEVICE_STATE_LABEL: Record<SessionDeviceVM["state"], string> = {
  online: "Online",
  idle: "Idle",
  expired: "Expired",
  revoked: "Revoked",
};

const DEVICE_STATE_COLOR: Record<SessionDeviceVM["state"], string> = {
  online: "var(--color-green-deep)",
  idle: "var(--color-amber-deep)",
  expired: "#8b93a3",
  revoked: "#B71C1C",
};

/* ── Filter bar ────────────────────────────────────────────────────────── */

const STATE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "signed_out", label: "Signed out" },
  { value: "never", label: "Never seen" },
];

/* ── Table ─────────────────────────────────────────────────────────────── */

export function SessionsTable({ rows, currentEmployeeId, firebaseAvailable }: Props) {
  const router = useRouter();
  const [q, setQ] = useQueryState("q", { defaultValue: "" });
  const [state, setState] = useQueryState("state", { defaultValue: "all" });
  const [hideInactive, setHideInactive] = useQueryState("hideoff", {
    defaultValue: "",
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<{
    device: SessionDeviceVM;
    ownerName: string;
  } | null>(null);
  const [pushToRemove, setPushToRemove] = useState<{
    device: PushDeviceVM;
    ownerName: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideInactive === "1" && !r.isActive) return false;
      if (state !== "all" && r.state !== state) return false;
      if (needle.length === 0) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        (r.department ?? "").toLowerCase().includes(needle) ||
        (r.lastIp ?? "").includes(needle) ||
        (r.lastDeviceLabel ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, state, hideInactive]);

  const anyFilter = q.trim().length > 0 || state !== "all" || hideInactive === "1";

  function resetFilters() {
    void setQ("");
    void setState("all");
    void setHideInactive("");
  }

  return (
    <>
      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 max-sm:w-full">
          <Search
            size={15}
            strokeWidth={2.2}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa1b0]"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => void setQ(e.target.value)}
            placeholder="Search name, email, department, IP or device"
            aria-label="Search sessions"
            className="w-full rounded-md border border-[#D8DDE7] bg-white py-2 pl-9 pr-3 text-[13.5px] placeholder:text-[#aab0bd] focus:border-[#3F3F94] focus:outline-none"
          />
        </div>

        <div
          role="radiogroup"
          aria-label="Filter by state"
          className="flex flex-wrap gap-1 rounded-md bg-[#F1F3F8] p-1"
        >
          {STATE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={state === f.value}
              onClick={() => void setState(f.value)}
              className={`rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                state === f.value
                  ? "bg-white text-[#1e2f66] shadow-[0_1px_2px_rgba(15,23,42,0.10)]"
                  : "text-[#5b6478] hover:text-[#1e2f66]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={hideInactive === "1"}
          onClick={() => void setHideInactive(hideInactive === "1" ? "" : "1")}
          className={`rounded-md border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
            hideInactive === "1"
              ? "border-[#3F3F94] bg-[#F4F4FD] text-[#3F3F94]"
              : "border-[#D8DDE7] bg-white text-[#5b6478] hover:text-[#1e2f66]"
          }`}
        >
          Hide deactivated
        </button>

        {anyFilter && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px] font-semibold text-[#5b6478] hover:text-[#B71C1C]"
          >
            <X size={13} strokeWidth={2.4} />
            Reset
          </button>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div
          className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p
            className="font-serif text-ink-strong"
            style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
          >
            {rows.length === 0 ? "No employees yet" : "Nobody matches these filters"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
            {rows.length === 0
              ? "Invite people from Admin → Employees and their sign-ins will show up here."
              : "Try a different state, or clear the search."}
          </p>
          {anyFilter && rows.length > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 rounded-md border border-[#D8DDE7] px-4 py-2 text-[13px] font-semibold text-[#3F3F94] hover:bg-[#F4F4FD]"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-section border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[14px]">
              <caption className="sr-only">
                Employees with their most recent observed session, device and push
                subscriptions
              </caption>
              <thead>
                <tr
                  className="border-b border-hairline text-left text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <th scope="col" className="px-4 py-3">Person</th>
                  <th scope="col" className="px-4 py-3">State</th>
                  <th scope="col" className="px-4 py-3">Last seen</th>
                  <th scope="col" className="px-4 py-3">IP</th>
                  <th scope="col" className="px-4 py-3">Device</th>
                  <th scope="col" className="px-4 py-3 tabular-nums">Sessions</th>
                  <th scope="col" className="px-4 py-3 tabular-nums">Push</th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isOpen = expanded === r.id;
                  return (
                    <EmployeeRows
                      key={r.id}
                      row={r}
                      rowIndex={i}
                      isOpen={isOpen}
                      firebaseAvailable={firebaseAvailable}
                      onToggle={() => setExpanded(isOpen ? null : r.id)}
                      onRevokeAll={() =>
                        setRevokeTarget({
                          employeeId: r.id,
                          name: r.name,
                          liveSessionCount: r.liveSessionCount,
                          pushCount: r.pushCount,
                          hasFirebaseUid: r.hasFirebaseUid,
                          isSelf: r.id === currentEmployeeId,
                        })
                      }
                      onRevokeSession={(device) =>
                        setSessionToRevoke({ device, ownerName: r.name })
                      }
                      onRemovePush={(device) =>
                        setPushToRemove({ device, ownerName: r.name })
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {revokeTarget && (
        <SessionsRevokeDialog
          target={revokeTarget}
          onClose={() => setRevokeTarget(null)}
        />
      )}

      {sessionToRevoke && (
        <SessionsConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) setSessionToRevoke(null);
          }}
          title="Revoke this session"
          description={
            <>
              Marks one recorded session for{" "}
              <strong className="text-[#0F172A]">{sessionToRevoke.ownerName}</strong>{" "}
              as revoked. The record is kept - it is never deleted.
            </>
          }
          confirmLabel="Revoke session"
          pendingLabel="Revoking"
          withReason
          onConfirm={async (reason) => {
            const res = await revokeLoginSession({
              sessionId: sessionToRevoke.device.id,
              reason: reason.length > 0 ? reason : undefined,
            });
            if (!res.ok) return { ok: false, error: res.error };
            router.refresh();
            return { ok: true, message: "Session revoked." };
          }}
        >
          <dl className="rounded-lg border border-[#EEF1F6] bg-[#FAFBFD] px-3 py-2.5 text-[13px]">
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-[#64748B]">Device</dt>
              <dd className="text-right font-medium text-[#0F172A]">
                {sessionToRevoke.device.deviceLabel ?? "Unrecognised"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-[#64748B]">IP</dt>
              <dd className="text-right font-medium tabular-nums text-[#0F172A]">
                {sessionToRevoke.device.ip ?? "not recorded"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-[#64748B]">Last seen</dt>
              <dd className="text-right font-medium text-[#0F172A]">
                {sessionToRevoke.device.lastSeenLabel}
              </dd>
            </div>
          </dl>
          {sessionToRevoke.device.isCurrent && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[13px] leading-snug text-[#92600A]"
            >
              This is the session you are using right now.
            </p>
          )}
        </SessionsConfirmDialog>
      )}

      {pushToRemove && (
        <SessionsConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) setPushToRemove(null);
          }}
          title="Remove push device"
          description={
            <>
              {pushToRemove.ownerName} stops receiving web-push notifications on
              this browser immediately. They can re-enable it from their own
              profile.
            </>
          }
          confirmLabel="Remove device"
          pendingLabel="Removing"
          onConfirm={async () => {
            const res = await removePushDevice({
              subscriptionId: pushToRemove.device.id,
            });
            if (!res.ok) return { ok: false, error: res.error };
            router.refresh();
            return { ok: true, message: "Push device removed." };
          }}
        />
      )}
    </>
  );
}

/* ── One employee: summary row + (optional) detail row ─────────────────── */

function EmployeeRows({
  row,
  rowIndex,
  isOpen,
  firebaseAvailable,
  onToggle,
  onRevokeAll,
  onRevokeSession,
  onRemovePush,
}: {
  row: SessionEmployeeVM;
  rowIndex: number;
  isOpen: boolean;
  firebaseAvailable: boolean;
  onToggle: () => void;
  onRevokeAll: () => void;
  onRevokeSession: (device: SessionDeviceVM) => void;
  onRemovePush: (device: PushDeviceVM) => void;
}) {
  const detailId = `sessions-detail-${row.id}`;
  const canRevoke =
    row.liveSessionCount > 0 || row.pushCount > 0 || row.hasFirebaseUid;

  return (
    <>
      <tr
        className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface-soft"
        style={{
          background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
        }}
      >
        <th scope="row" className="px-4 py-3 text-left font-normal">
          <span className="flex items-center gap-2.5">
            <Avatar name={row.name} avatarUrl={row.avatarUrl} size={30} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-ink-strong">
                  {row.name}
                </span>
                {row.isAdmin && (
                  <span className="rounded-full bg-[#EEF0FB] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#3F3F94]">
                    Admin
                  </span>
                )}
                {!row.isActive && (
                  <span className="rounded-full bg-[var(--color-red-bg)] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-red-deep)]">
                    Deactivated
                  </span>
                )}
              </span>
              <span className="block truncate text-[12.5px] text-ink-subtle">
                {[row.email, row.designation, row.department]
                  .filter((part): part is string => Boolean(part))
                  .join(" · ")}
              </span>
            </span>
          </span>
        </th>
        <td className="px-4 py-3">
          <StateChip state={row.state} />
        </td>
        <td className="px-4 py-3">
          {row.lastSeenAge ? (
            <span className="block text-ink-strong">{row.lastSeenAge}</span>
          ) : firebaseAvailable && row.firebaseSignInAge ? (
            <span className="block text-ink-soft">
              {row.firebaseSignInAge}
              <span className="ml-1 text-[11.5px] text-ink-subtle">(Firebase)</span>
            </span>
          ) : (
            <span className="text-ink-subtle">-</span>
          )}
          {row.lastSeenLabel && (
            <span className="block text-[11.5px] tabular-nums text-ink-subtle">
              {row.lastSeenLabel}
            </span>
          )}
        </td>
        <td className="px-4 py-3 tabular-nums text-ink-soft">
          {row.lastIp ?? <span className="text-ink-subtle">-</span>}
        </td>
        <td className="px-4 py-3 text-ink-soft">
          {row.lastDeviceLabel ?? <span className="text-ink-subtle">-</span>}
        </td>
        <td className="px-4 py-3 tabular-nums text-ink-soft">
          {row.liveSessionCount > 0 ? (
            <span className="font-semibold text-ink-strong">
              {row.liveSessionCount}
            </span>
          ) : (
            <span className="text-ink-subtle">0</span>
          )}
          {row.sessions.length > row.liveSessionCount && (
            <span className="ml-1 text-[11.5px] text-ink-subtle">
              / {row.sessions.length}
            </span>
          )}
        </td>
        <td className="px-4 py-3 tabular-nums text-ink-soft">
          {row.pushCount > 0 ? row.pushCount : <span className="text-ink-subtle">0</span>}
        </td>
        <td className="px-4 py-3 text-right">
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              aria-controls={detailId}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              Devices
              <ChevronDown
                size={14}
                strokeWidth={2.4}
                aria-hidden
                className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onRevokeAll}
              disabled={!canRevoke}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#B71C1C] transition-colors hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:text-ink-subtle disabled:hover:bg-transparent"
            >
              <ShieldOff size={13} strokeWidth={2.3} aria-hidden />
              Revoke
            </button>
          </span>
        </td>
      </tr>

      {isOpen && (
        <tr id={detailId} className="border-b border-hairline last:border-b-0">
          <td colSpan={8} className="bg-[#FAFBFD] px-4 py-4">
            <div className="grid gap-5 lg:grid-cols-2">
              <SessionsPanel
                row={row}
                firebaseAvailable={firebaseAvailable}
                onRevokeSession={onRevokeSession}
              />
              <PushPanel row={row} onRemovePush={onRemovePush} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#a2a8b4]"
      style={{ fontFamily: "var(--font-mono-display)" }}
    >
      {children}
    </h3>
  );
}

function SessionsPanel({
  row,
  firebaseAvailable,
  onRevokeSession,
}: {
  row: SessionEmployeeVM;
  firebaseAvailable: boolean;
  onRevokeSession: (device: SessionDeviceVM) => void;
}) {
  return (
    <section>
      <PanelHeading>Recorded sessions ({row.sessions.length})</PanelHeading>

      {firebaseAvailable && (
        <p className="mb-2 text-[12.5px] leading-snug text-[#5b6478]">
          {row.firebaseSignInLabel ? (
            <>
              Firebase reports last sign-in{" "}
              <strong className="font-semibold text-[#0F172A]">
                {row.firebaseSignInLabel}
              </strong>
              {row.firebaseTokensValidAfterLabel && (
                <> · tokens valid after {row.firebaseTokensValidAfterLabel}</>
              )}
              {row.firebaseDisabled && (
                <span className="text-[#B71C1C]"> · account disabled in Firebase</span>
              )}
            </>
          ) : row.hasFirebaseUid ? (
            "Firebase has no sign-in on record for this account."
          ) : (
            "This person has never signed in - no Firebase account is linked yet."
          )}
        </p>
      )}

      {row.sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#D8DDE7] px-3 py-4 text-center text-[12.5px] text-[#8b93a3]">
          No session has been recorded for this person yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {row.sessions.map((d) => (
            <li
              key={d.id}
              className="flex items-start gap-3 rounded-lg border border-[#E7EAF3] bg-white px-3 py-2.5"
            >
              <Monitor
                size={15}
                strokeWidth={2}
                aria-hidden
                className="mt-0.5 shrink-0 text-[#8b93a3]"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-[#0F172A]">
                  {d.deviceLabel ?? "Unrecognised device"}
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: DEVICE_STATE_COLOR[d.state] }}
                  >
                    {DEVICE_STATE_LABEL[d.state]}
                  </span>
                  {d.isCurrent && (
                    <span className="rounded-full bg-[#EEF0FB] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#3F3F94]">
                      This device
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[12px] tabular-nums text-[#64748B]">
                  {d.ip ?? "IP not recorded"} · started {d.startedLabel} · seen{" "}
                  {d.lastSeenAge}
                </p>
                {d.revokedLabel && (
                  <p className="mt-0.5 text-[12px] text-[#B71C1C]">
                    Revoked {d.revokedLabel}
                    {d.revokedByName ? ` by ${d.revokedByName}` : ""}
                    {d.revokeReason ? ` - ${d.revokeReason}` : ""}
                  </p>
                )}
                {d.userAgent && !d.deviceLabel && (
                  <p className="mt-0.5 break-all text-[11.5px] text-[#8b93a3]">
                    {d.userAgent}
                  </p>
                )}
              </div>
              {d.state !== "revoked" && (
                <button
                  type="button"
                  onClick={() => onRevokeSession(d)}
                  className="shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold text-[#B71C1C] transition-colors hover:bg-[#FEF2F2]"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PushPanel({
  row,
  onRemovePush,
}: {
  row: SessionEmployeeVM;
  onRemovePush: (device: PushDeviceVM) => void;
}) {
  return (
    <section>
      <PanelHeading>Push devices ({row.pushDevices.length})</PanelHeading>
      {row.pushDevices.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#D8DDE7] px-3 py-4 text-center text-[12.5px] text-[#8b93a3]">
          No browser has registered for push notifications.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {row.pushDevices.map((d) => (
            <li
              key={d.id}
              className="flex items-start gap-3 rounded-lg border border-[#E7EAF3] bg-white px-3 py-2.5"
            >
              <Smartphone
                size={15}
                strokeWidth={2}
                aria-hidden
                className="mt-0.5 shrink-0 text-[#8b93a3]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[#0F172A]">
                  {d.deviceLabel ?? "Unrecognised browser"}
                </p>
                <p className="mt-0.5 text-[12px] text-[#64748B]">
                  {d.endpointHost} · added {d.addedLabel} · seen {d.lastSeenAge}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemovePush(d)}
                className="shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold text-[#B71C1C] transition-colors hover:bg-[#FEF2F2]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
