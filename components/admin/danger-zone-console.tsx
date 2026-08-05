"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BellOff,
  Eraser,
  RefreshCw,
  Trash2,
  UserX,
  Wrench,
} from "lucide-react";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import {
  DANGER_ZONE_OPERATIONS,
  DANGER_ZONE_WINDOW_MAX,
  DANGER_ZONE_WINDOW_MIN,
  clampWindow,
  type DangerZoneOperationKey,
  type DangerZoneWindows,
} from "@/lib/danger-zone/operations";
import type {
  DangerZonePreview,
  DangerZoneRun,
  RevokeCandidate,
} from "@/lib/queries/danger-zone";
import {
  clearApplicationCaches,
  previewDangerZone,
  pruneReadNotifications,
  pruneStalePushDevices,
  purgeRecycledDrafts,
  rebuildDerivedData,
  deactivateAndRevokeEmployee,
} from "@/app/(admin)/admin/danger-zone/actions";
import {
  DangerZoneConfirmDialog,
  type ConfirmImpactRow,
} from "@/components/admin/danger-zone-confirm-dialog";
import {
  DangerZoneOperationCard,
  type OperationStat,
} from "@/components/admin/danger-zone-operation-card";

const MONO = "var(--font-mono-display)";

interface Props {
  initialPreview: DangerZonePreview;
  candidates: RevokeCandidate[];
  runs: DangerZoneRun[];
}

/**
 * The Danger Zone console. Owns the retention windows, the live counts, and
 * the single confirmation dialog every operation funnels through.
 *
 * Safety rule enforced here: a run button stays DISABLED whenever its window
 * input differs from the window the visible counts were taken with, so the
 * number an admin reads is always the number the operation will act on.
 */
export function DangerZoneConsole({ initialPreview, candidates, runs }: Props) {
  const router = useRouter();
  const [counted, setCounted] = useState<DangerZonePreview>(initialPreview);
  const [windows, setWindows] = useState<DangerZoneWindows>(initialPreview.windows);
  const [openOp, setOpenOp] = useState<DangerZoneOperationKey | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState("");
  const [recounting, startRecount] = useTransition();
  const [running, startRun] = useTransition();

  const target = candidates.find((c) => c.id === revokeId) ?? null;

  function setWindow(key: keyof DangerZoneWindows, raw: string) {
    setWindows((w) => ({ ...w, [key]: clampWindow(raw === "" ? 0 : raw) }));
  }

  function recount() {
    startRecount(async () => {
      const res = await previewDangerZone(windows);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setCounted(res.preview);
    });
  }

  function openDialog(key: DangerZoneOperationKey) {
    setDialogError(null);
    setOpenOp(key);
  }

  function closeDialog() {
    setOpenOp(null);
    setDialogError(null);
  }

  /** Refresh both halves of the page after a successful run. */
  function afterRun() {
    router.refresh();
    void previewDangerZone(counted.windows).then((res) => {
      if (res.ok) setCounted(res.preview);
    });
  }

  function run(typed: string) {
    const key = openOp;
    if (!key) return;
    setDialogError(null);

    startRun(async () => {
      switch (key) {
        case "purge_recycled_drafts": {
          const res = await purgeRecycledDrafts({
            olderThanDays: counted.windows.recycledDraftDays,
            confirmation: typed,
          });
          if (!res.ok) return setDialogError(res.error);
          fireToast({
            message:
              res.deleted === 0
                ? "Nothing to purge - no recycled drafts matched."
                : `Purged ${res.deleted} recycled draft(s).`,
          });
          break;
        }
        case "prune_read_notifications": {
          const res = await pruneReadNotifications({
            olderThanDays: counted.windows.readNotificationDays,
            confirmation: typed,
          });
          if (!res.ok) return setDialogError(res.error);
          fireToast({
            message:
              res.deleted === 0
                ? "Nothing to prune - no read notifications matched."
                : `Pruned ${res.deleted} read notification(s).`,
          });
          break;
        }
        case "prune_stale_devices": {
          const res = await pruneStalePushDevices({
            olderThanDays: counted.windows.stalePushDeviceDays,
            confirmation: typed,
          });
          if (!res.ok) return setDialogError(res.error);
          fireToast({
            message:
              res.deleted === 0
                ? "Nothing to prune - every device is inside the window."
                : `Removed ${res.deleted} stale device registration(s).`,
          });
          break;
        }
        case "revoke_employee_access": {
          if (!target) return setDialogError("Select an employee first.");
          const res = await deactivateAndRevokeEmployee({
            employeeId: target.id,
            confirmation: typed,
          });
          if (!res.ok) return setDialogError(res.error);
          fireToast({
            message: `${res.name}: access revoked - ${res.sessionsRevoked} session(s), ${res.devicesRemoved} device(s).`,
          });
          setRevokeId("");
          break;
        }
        case "rebuild_derived_data": {
          const res = await rebuildDerivedData();
          if (!res.ok) return setDialogError(res.error);
          fireToast({
            message:
              res.linked + res.mirrored + res.memberships === 0
                ? "Nothing to repair - department data is already consistent."
                : `Repaired: ${res.linked} linked, ${res.mirrored} renamed, ${res.memberships} membership(s).`,
          });
          break;
        }
        case "clear_caches": {
          const res = await clearApplicationCaches();
          if (!res.ok) return setDialogError(res.error);
          fireToast({ message: `Cleared ${res.tags} cache tag(s).` });
          break;
        }
      }
      closeDialog();
      afterRun();
    });
  }

  // ── Per-operation dialog payloads ────────────────────────────────────────
  const meta = openOp ? DANGER_ZONE_OPERATIONS[openOp] : null;

  function impactFor(key: DangerZoneOperationKey): ConfirmImpactRow[] {
    switch (key) {
      case "purge_recycled_drafts":
        return [
          { label: "Drafts destroyed", value: counted.drafts.eligible, tone: "danger" },
          { label: "Active drafts kept", value: counted.drafts.activeProtected },
        ];
      case "prune_read_notifications":
        return [
          { label: "Notifications deleted", value: counted.notifications.eligible, tone: "danger" },
          { label: "Dispatch rows cascaded", value: counted.notifications.dispatchRows, tone: "danger" },
          { label: "Unread kept", value: counted.notifications.unreadProtected },
          { label: "Rows in table", value: counted.notifications.total },
        ];
      case "prune_stale_devices":
        return [
          { label: "Devices removed", value: counted.devices.eligible, tone: "danger" },
          { label: "People affected", value: counted.devices.people },
        ];
      case "revoke_employee_access":
        return [
          { label: "Sessions revoked", value: target?.activeSessions ?? 0, tone: "danger" },
          { label: "Devices removed", value: target?.devices ?? 0, tone: "danger" },
          { label: "Unfinished tasks", value: target?.openTasks ?? 0 },
        ];
      case "rebuild_derived_data":
        return [
          { label: "Links to repair", value: counted.derived.unlinkedByName },
          { label: "Names to re-mirror", value: counted.derived.mirrorDrift },
          { label: "Memberships to add", value: counted.derived.missingMemberships },
        ];
      case "clear_caches":
        return [];
    }
  }

  function scopeLineFor(key: DangerZoneOperationKey): string | undefined {
    switch (key) {
      case "purge_recycled_drafts":
        return `Window: recycled more than ${counted.windows.recycledDraftDays} day(s) ago${
          counted.drafts.oldestLabel ? ` · oldest match ${counted.drafts.oldestLabel}` : ""
        }`;
      case "prune_read_notifications":
        return `Window: read and older than ${counted.windows.readNotificationDays} day(s)${
          counted.notifications.oldestLabel
            ? ` · oldest match ${counted.notifications.oldestLabel}`
            : ""
        }`;
      case "prune_stale_devices":
        return `Window: not seen for ${counted.windows.stalePushDeviceDays} day(s)${
          counted.devices.oldestLabel ? ` · oldest match ${counted.devices.oldestLabel}` : ""
        }`;
      case "revoke_employee_access":
        return target ? `Target: ${target.name} · ${target.email}` : undefined;
      default:
        return undefined;
    }
  }

  const draftsDirty =
    windows.recycledDraftDays !== counted.windows.recycledDraftDays;
  const notificationsDirty =
    windows.readNotificationDays !== counted.windows.readNotificationDays;
  const devicesDirty =
    windows.stalePushDeviceDays !== counted.windows.stalePushDeviceDays;

  const recountHint = "Recount to enable";

  return (
    <>
      <section aria-label="Maintenance counts" className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <AdminKpiTile
          label="Recycled drafts"
          value={counted.drafts.eligible}
          hint={`${counted.drafts.totalRecycled} in bins · ${counted.drafts.activeProtected} active kept`}
          tone="red"
          icon={<Trash2 size={16} strokeWidth={2.2} />}
          index={0}
        />
        <AdminKpiTile
          label="Read notifications"
          value={counted.notifications.eligible}
          hint={`${counted.notifications.total} total · ${counted.notifications.unreadProtected} unread kept`}
          tone="rose"
          icon={<BellOff size={16} strokeWidth={2.2} />}
          index={1}
        />
        <AdminKpiTile
          label="Stale devices"
          value={counted.devices.eligible}
          hint={`${counted.devices.total} registered · ${counted.devices.people} people`}
          tone="amber"
          icon={<Eraser size={16} strokeWidth={2.2} />}
          index={2}
        />
        <AdminKpiTile
          label="Data drift"
          value={counted.derived.total}
          hint="Department mirror rows needing repair"
          tone="blue"
          icon={<Wrench size={16} strokeWidth={2.2} />}
          index={3}
        />
      </section>

      <p className="mt-3 text-[12.5px] text-[#8b91a0] tabular-nums">
        Counted {counted.countedAtLabel}. Every run is re-counted server-side and
        written to the append-only audit log with your name.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <DangerZoneOperationCard
          meta={DANGER_ZONE_OPERATIONS.purge_recycled_drafts}
          icon={<Trash2 size={19} strokeWidth={2.2} />}
          eyebrow="Irreversible · every user's bin"
          stats={[
            { label: "Will be destroyed", value: counted.drafts.eligible, tone: "danger" },
            { label: "In bins overall", value: counted.drafts.totalRecycled },
            { label: "Active drafts kept", value: counted.drafts.activeProtected, tone: "safe" },
            { label: "People affected", value: counted.drafts.owners },
          ]}
          footnote={
            counted.drafts.eligible === 0 ? (
              "Nothing matches this window - the 48-hour auto-purge has already cleared these bins."
            ) : (
              <>
                {counted.drafts.oldestLabel
                  ? `Oldest match recycled ${counted.drafts.oldestLabel}. `
                  : ""}
                By form:{" "}
                {counted.drafts.byForm
                  .map((f) => `${f.label} ${f.eligible}`)
                  .join(" · ")}
              </>
            )
          }
          control={
            <WindowControl
              label="Recycled more than"
              value={windows.recycledDraftDays}
              onChange={(v) => setWindow("recycledDraftDays", v)}
              dirty={draftsDirty}
              pending={recounting}
              onRecount={recount}
            />
          }
          actionDisabled={draftsDirty || counted.drafts.eligible === 0}
          actionHint={draftsDirty ? recountHint : "Nothing to purge"}
          onOpen={() => openDialog("purge_recycled_drafts")}
        />

        <DangerZoneOperationCard
          meta={DANGER_ZONE_OPERATIONS.prune_read_notifications}
          icon={<BellOff size={19} strokeWidth={2.2} />}
          eyebrow="Irreversible · all inboxes"
          stats={[
            { label: "Will be deleted", value: counted.notifications.eligible, tone: "danger" },
            { label: "Dispatch rows", value: counted.notifications.dispatchRows, tone: "danger" },
            { label: "Unread kept", value: counted.notifications.unreadProtected, tone: "safe" },
            { label: "Rows in table", value: counted.notifications.total },
          ]}
          footnote={
            counted.notifications.eligible === 0
              ? "Nothing matches this window."
              : counted.notifications.oldestLabel
                ? `Oldest match created ${counted.notifications.oldestLabel}.`
                : undefined
          }
          control={
            <WindowControl
              label="Read and older than"
              value={windows.readNotificationDays}
              onChange={(v) => setWindow("readNotificationDays", v)}
              dirty={notificationsDirty}
              pending={recounting}
              onRecount={recount}
            />
          }
          actionDisabled={notificationsDirty || counted.notifications.eligible === 0}
          actionHint={notificationsDirty ? recountHint : "Nothing to prune"}
          onOpen={() => openDialog("prune_read_notifications")}
        />

        <DangerZoneOperationCard
          meta={DANGER_ZONE_OPERATIONS.prune_stale_devices}
          icon={<Eraser size={19} strokeWidth={2.2} />}
          eyebrow="Self-healing · push only"
          stats={[
            { label: "Will be removed", value: counted.devices.eligible, tone: "danger" },
            { label: "Registered devices", value: counted.devices.total },
            { label: "People affected", value: counted.devices.people },
          ]}
          footnote={
            counted.devices.eligible === 0
              ? "Every registered device has checked in inside this window."
              : counted.devices.oldestLabel
                ? `Oldest match last seen ${counted.devices.oldestLabel}.`
                : undefined
          }
          control={
            <WindowControl
              label="Not seen for"
              value={windows.stalePushDeviceDays}
              onChange={(v) => setWindow("stalePushDeviceDays", v)}
              dirty={devicesDirty}
              pending={recounting}
              onRecount={recount}
            />
          }
          actionDisabled={devicesDirty || counted.devices.eligible === 0}
          actionHint={devicesDirty ? recountHint : "Nothing to prune"}
          onOpen={() => openDialog("prune_stale_devices")}
        />

        <DangerZoneOperationCard
          meta={DANGER_ZONE_OPERATIONS.revoke_employee_access}
          icon={<UserX size={19} strokeWidth={2.2} />}
          eyebrow="Reversible · one person"
          stats={
            target
              ? [
                  { label: "Sessions revoked", value: target.activeSessions, tone: "danger" },
                  { label: "Devices removed", value: target.devices, tone: "danger" },
                  { label: "Unfinished tasks", value: target.openTasks },
                ]
              : []
          }
          footnote={
            candidates.length === 0
              ? "No other employees on the roster yet."
              : target
                ? target.isActive
                  ? `${target.name} is currently active${target.isAdmin ? " and is an admin" : ""}. Their ${target.openTasks} unfinished task(s) stay assigned to them - reassign before revoking if the work must continue.`
                  : `${target.name} is already deactivated. Running this again only sweeps any leftover sessions and devices.`
                : "Choose an employee to see the exact blast radius. Your own account is never listed."
          }
          control={
            <div className="w-[340px] max-sm:w-full">
              <Select
                options={candidates.map((c) => ({
                  value: c.id,
                  label: `${c.name} · ${c.email}${c.isActive ? "" : " (inactive)"}`,
                }))}
                value={revokeId}
                onValueChange={setRevokeId}
                placeholder={
                  candidates.length === 0 ? "No employees available" : "Select an employee"
                }
                disabled={candidates.length === 0}
                ariaLabel="Employee to deactivate and revoke"
                searchable
                searchPlaceholder="Search name or email"
              />
            </div>
          }
          actionDisabled={!target}
          actionHint="Select an employee"
          onOpen={() => openDialog("revoke_employee_access")}
        />

        <DangerZoneOperationCard
          meta={DANGER_ZONE_OPERATIONS.rebuild_derived_data}
          icon={<Wrench size={19} strokeWidth={2.2} />}
          eyebrow="Repair only · nothing deleted"
          stats={[
            { label: "Unlinked by name", value: counted.derived.unlinkedByName },
            { label: "Name mirror drift", value: counted.derived.mirrorDrift },
            { label: "Missing memberships", value: counted.derived.missingMemberships },
          ]}
          footnote={
            counted.derived.total === 0
              ? "Department data is already consistent. Running the repair is harmless and will report zero rows."
              : `${counted.derived.total} row(s) would be corrected.`
          }
          onOpen={() => openDialog("rebuild_derived_data")}
        />

        <DangerZoneOperationCard
          meta={DANGER_ZONE_OPERATIONS.clear_caches}
          icon={<RefreshCw size={19} strokeWidth={2.2} />}
          eyebrow="No data touched"
          stats={[]}
          footnote="Use this when a change is saved but a list still shows the old value."
          onOpen={() => openDialog("clear_caches")}
        />
      </div>

      <section
        aria-label="Recent Danger Zone runs"
        className="mt-6 rounded-2xl border border-[#e6e8ec] bg-white p-5"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <h2
          className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#a2a8b4]"
          style={{ fontFamily: MONO }}
        >
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#8b91a0]">
            Nothing has been run from this page yet. Every operation you run here
            appears in this list and in the Activity Log.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[#eef0f3]">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="text-[13px] font-semibold text-[#1e2f66]">
                  {DANGER_ZONE_OPERATIONS[r.eventType as DangerZoneOperationKey]?.title ??
                    r.eventType}
                </span>
                <span className="flex-1 min-w-[200px] text-[12.5px] text-[#6b7280]">
                  {r.note}
                </span>
                <span className="text-[12px] tabular-nums text-[#8b91a0]">
                  {r.actorName ?? "Unknown"} · {r.createdAtLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DangerZoneConfirmDialog
        // Remount per operation/target so the confirmation box always opens empty.
        key={`${openOp ?? "none"}:${target?.id ?? ""}`}
        meta={meta}
        targetEmail={target?.email}
        scopeLine={openOp ? scopeLineFor(openOp) : undefined}
        impact={openOp ? impactFor(openOp) : []}
        pending={running}
        error={dialogError}
        onCancel={closeDialog}
        onRun={run}
      />
    </>
  );
}

/** Retention-window input + its recount button, shared by the three prunes. */
function WindowControl({
  label,
  value,
  onChange,
  dirty,
  pending,
  onRecount,
}: {
  label: string;
  value: number;
  onChange: (raw: string) => void;
  dirty: boolean;
  pending: boolean;
  onRecount: () => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold text-[#3a4152]">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={DANGER_ZONE_WINDOW_MIN}
        max={DANGER_ZONE_WINDOW_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded-md border border-[#cbd5e1] px-2.5 py-1.5 text-[13.5px] tabular-nums focus:border-[#3f3f94] focus:outline-none focus:ring-2 focus:ring-[#3f3f94]/25"
      />
      <span className="text-[13px] text-[#6b7280]">days</span>
      <button
        type="button"
        onClick={onRecount}
        disabled={pending}
        className={
          "rounded-md border px-3 py-1.5 text-[12.5px] font-bold transition disabled:opacity-50 " +
          (dirty
            ? "border-[#3f3f94] bg-[#3f3f94] text-white"
            : "border-[#dfe3ea] bg-white text-[#3f3f94] hover:bg-[#f4f4fd]")
        }
      >
        {pending ? "Counting…" : dirty ? "Recount" : "Refresh count"}
      </button>
    </div>
  );
}
