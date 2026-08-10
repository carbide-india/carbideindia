import "server-only";
import { and, asc, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  formDrafts,
  notificationDispatchLog,
  notifications,
  pushSubscriptions,
} from "@/db/schema";
import { FORM_DRAFT_META, isFormDraftKind } from "@/lib/drafts/form-drafts";
import { formatDateTime } from "@/lib/format";
import {
  clampWindow,
  type DangerZoneWindows,
} from "@/lib/danger-zone/operations";

/**
 * Read-side of /admin/danger-zone.  EVERY destructive operation on that page
 * shows its exact row count from here BEFORE it runs, so nothing is ever a
 * blind delete.  Pure reads - no mutation lives in this module.
 *
 * The governance rule from the ERP phases holds throughout: business entities
 * are deactivated, never hard-deleted, and `audit_log` is append-only. What is
 * counted here is deliberately limited to NON-governed housekeeping rows
 * (recycled form drafts, read notifications, device push tokens) plus pure
 * repair drift - see `danger-zone-absent-notes.tsx` for what is left out.
 */

export interface RecycledDraftPreview {
  /** Rows that WILL be destroyed by a purge at this window. */
  eligible: number;
  /** Everything currently sitting in a recycle bin, any age. */
  totalRecycled: number;
  /** Active (non-recycled) drafts - never touched, shown for reassurance. */
  activeProtected: number;
  /** Distinct people whose bins are affected. */
  owners: number;
  oldestLabel: string | null;
  byForm: { formKey: string; label: string; eligible: number }[];
}

export interface ReadNotificationPreview {
  /** Read notifications older than the window - destroyed by the prune. */
  eligible: number;
  /** Dispatch-log rows that cascade away with them. */
  dispatchRows: number;
  /** Every notification row in the table. */
  total: number;
  /** Unread rows older than the window - deliberately NOT touched. */
  unreadProtected: number;
  oldestLabel: string | null;
}

export interface StaleDevicePreview {
  /** Push subscriptions not seen inside the window - destroyed by the prune. */
  eligible: number;
  total: number;
  /** Distinct employees losing at least one device registration. */
  people: number;
  oldestLabel: string | null;
}

export interface DerivedDataPreview {
  /** employees.department text disagreeing with the linked department's name. */
  mirrorDrift: number;
  /** Employees with a primary department but no membership row for it. */
  missingMemberships: number;
  /** Legacy department text that matches a department by name but isn't linked. */
  unlinkedByName: number;
  /** Sum of the three - the "rows this repair would touch" headline. */
  total: number;
}

export interface DangerZonePreview {
  windows: DangerZoneWindows;
  drafts: RecycledDraftPreview;
  notifications: ReadNotificationPreview;
  devices: StaleDevicePreview;
  derived: DerivedDataPreview;
  /** Server-rendered timestamp label ("counted at ..."). */
  countedAtLabel: string;
}

/** One selectable target for the deactivate-and-revoke operation. */
export interface RevokeCandidate {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  /** login_sessions rows not yet revoked. */
  activeSessions: number;
  /** push_subscriptions rows (browser/device registrations). */
  devices: number;
  /** Tasks assigned to them that are not finished - work that needs reassigning. */
  openTasks: number;
}


/** postgres-js hands timestamps back as Date; be defensive about strings too. */
function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Format on the SERVER so the client never re-formats and mismatches hydration. */
function stamp(v: unknown): string | null {
  const d = toDate(v);
  return d ? formatDateTime(d) : null;
}

const n = (v: unknown): number => Number(v ?? 0);

/** `now - days`, clamped to the validated window range. */
export function cutoffFor(days: number): Date {
  return new Date(Date.now() - clampWindow(days) * 24 * 60 * 60 * 1000);
}

/**
 * A cutoff Date rendered for use INSIDE a raw `sql` template.
 *
 * Drizzle's typed comparisons (lt/gt/eq) map a JS Date through the column's
 * driver mapper, but a bare `${date}` inside a `sql` template reaches
 * postgres-js as an untyped parameter and throws
 * `TypeError: The "string" argument must be of type string … Received an
 * instance of Date`. Passing the ISO string with an explicit ::timestamptz cast
 * gives the driver a string and Postgres the right type.
 */
function cutoffParam(cutoff: Date) {
  return sql`${cutoff.toISOString()}::timestamptz`;
}

/** Human label for a `form_drafts.form_key` (the enquiry form predates the map). */
function formLabel(formKey: string): string {
  if (isFormDraftKind(formKey)) return FORM_DRAFT_META[formKey].noun;
  if (formKey === "enquiry") return "New Enquiry";
  return formKey;
}

async function previewRecycledDrafts(days: number): Promise<RecycledDraftPreview> {
  const cutoff = cutoffFor(days);
  const [grouped, [totals], [owners]] = await Promise.all([
    db
      .select({
        formKey: formDrafts.formKey,
        eligible: sql<number>`count(*)::int`,
      })
      .from(formDrafts)
      .where(and(isNotNull(formDrafts.deletedAt), lt(formDrafts.deletedAt, cutoff)))
      .groupBy(formDrafts.formKey)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        totalRecycled: sql<number>`(count(*) filter (where ${formDrafts.deletedAt} is not null))::int`,
        activeProtected: sql<number>`(count(*) filter (where ${formDrafts.deletedAt} is null))::int`,
        oldest: sql<Date | null>`min(${formDrafts.deletedAt}) filter (where ${formDrafts.deletedAt} < ${cutoffParam(cutoff)})`,
      })
      .from(formDrafts),
    db
      .select({ owners: sql<number>`count(distinct ${formDrafts.ownerId})::int` })
      .from(formDrafts)
      .where(and(isNotNull(formDrafts.deletedAt), lt(formDrafts.deletedAt, cutoff))),
  ]);

  const byForm = grouped.map((r) => ({
    formKey: r.formKey,
    label: formLabel(r.formKey),
    eligible: n(r.eligible),
  }));

  return {
    eligible: byForm.reduce((sum, r) => sum + r.eligible, 0),
    totalRecycled: n(totals?.totalRecycled),
    activeProtected: n(totals?.activeProtected),
    owners: n(owners?.owners),
    oldestLabel: stamp(totals?.oldest),
    byForm,
  };
}

async function previewReadNotifications(days: number): Promise<ReadNotificationPreview> {
  const cutoff = cutoffFor(days);
  const [[totals], [dispatch]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        eligible: sql<number>`(count(*) filter (where ${notifications.readAt} is not null and ${notifications.createdAt} < ${cutoffParam(cutoff)}))::int`,
        unreadProtected: sql<number>`(count(*) filter (where ${notifications.readAt} is null and ${notifications.createdAt} < ${cutoffParam(cutoff)}))::int`,
        oldest: sql<Date | null>`min(${notifications.createdAt}) filter (where ${notifications.readAt} is not null and ${notifications.createdAt} < ${cutoffParam(cutoff)})`,
      })
      .from(notifications),
    // Dispatch-log rows disappear by ON DELETE CASCADE - count them so the
    // blast radius on the dialog is the whole truth, not just the parent rows.
    db
      .select({ rows: sql<number>`count(*)::int` })
      .from(notificationDispatchLog)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationDispatchLog.notificationId),
      )
      .where(
        and(isNotNull(notifications.readAt), lt(notifications.createdAt, cutoff)),
      ),
  ]);

  return {
    eligible: n(totals?.eligible),
    dispatchRows: n(dispatch?.rows),
    total: n(totals?.total),
    unreadProtected: n(totals?.unreadProtected),
    oldestLabel: stamp(totals?.oldest),
  };
}

async function previewStaleDevices(days: number): Promise<StaleDevicePreview> {
  const cutoff = cutoffFor(days);
  const [[totals], [people]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        eligible: sql<number>`(count(*) filter (where ${pushSubscriptions.lastSeenAt} < ${cutoffParam(cutoff)}))::int`,
        oldest: sql<Date | null>`min(${pushSubscriptions.lastSeenAt}) filter (where ${pushSubscriptions.lastSeenAt} < ${cutoffParam(cutoff)})`,
      })
      .from(pushSubscriptions),
    db
      .select({ people: sql<number>`count(distinct ${pushSubscriptions.userId})::int` })
      .from(pushSubscriptions)
      .where(lt(pushSubscriptions.lastSeenAt, cutoff)),
  ]);

  return {
    eligible: n(totals?.eligible),
    total: n(totals?.total),
    people: n(people?.people),
    oldestLabel: stamp(totals?.oldest),
  };
}

/**
 * Department drift: the three repairable inconsistencies between the canonical
 * `departments` table, the legacy `employees.department` text mirror and the
 * `employee_departments` membership join.  All three are REPAIRS - the rebuild
 * only writes correct values, it never deletes a row.
 */
async function previewDerivedData(): Promise<DerivedDataPreview> {
  const [row] = (await db.execute(sql`
    select
      (select count(*) from employees e
         join departments d on d.id = e.department_id
        where e.department is distinct from d.name)::int as mirror_drift,
      (select count(*) from employees e
        where e.department_id is not null
          and not exists (
            select 1 from employee_departments ed
             where ed.employee_id = e.id and ed.department_id = e.department_id))::int
        as missing_memberships,
      (select count(*) from employees e
        where e.department_id is null
          and e.department is not null
          and trim(e.department) <> ''
          and exists (
            select 1 from departments d
             where lower(d.name) = lower(trim(e.department))))::int as unlinked_by_name
  `)) as unknown as {
    mirror_drift: number;
    missing_memberships: number;
    unlinked_by_name: number;
  }[];

  const mirrorDrift = n(row?.mirror_drift);
  const missingMemberships = n(row?.missing_memberships);
  const unlinkedByName = n(row?.unlinked_by_name);
  return {
    mirrorDrift,
    missingMemberships,
    unlinkedByName,
    total: mirrorDrift + missingMemberships + unlinkedByName,
  };
}

/**
 * Every count the Danger Zone renders, for one set of retention windows.
 * Re-run by the client whenever a window changes, and re-run server-side
 * inside each operation so the number shown is never stale by more than the
 * length of the confirmation dialog.
 */
export async function getDangerZonePreview(
  windows: DangerZoneWindows,
): Promise<DangerZonePreview> {
  const [drafts, notificationRows, devices, derived] = await Promise.all([
    previewRecycledDrafts(windows.recycledDraftDays),
    previewReadNotifications(windows.readNotificationDays),
    previewStaleDevices(windows.stalePushDeviceDays),
    previewDerivedData(),
  ]);

  return {
    windows,
    drafts,
    notifications: notificationRows,
    devices,
    derived,
    countedAtLabel: formatDateTime(new Date()),
  };
}

/**
 * Roster for the deactivate-and-revoke picker, active people first.  The three
 * counts are the blast radius of revoking that person: sessions killed, device
 * registrations removed, and unfinished work that will need reassigning.
 */
export async function listRevokeCandidates(): Promise<RevokeCandidate[]> {
  return db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      isActive: employees.isActive,
      isAdmin: employees.isAdmin,
      activeSessions: sql<number>`(
        select count(*) from login_sessions ls
         where ls.employee_id = ${employees.id} and ls.revoked_at is null)::int`,
      devices: sql<number>`(
        select count(*) from push_subscriptions ps
         where ps.user_id = ${employees.id})::int`,
      openTasks: sql<number>`(
        select count(*) from tasks t
         where t.doer_id = ${employees.id}
           and t.completed_at is null
           and t.archived = false)::int`,
    })
    .from(employees)
    .orderBy(desc(employees.isActive), asc(employees.name));
}

/** Headline stat for the page sub-line: how many people can still sign in. */
export async function countActiveEmployees(): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.isActive, true));
  return n(row?.c);
}

/**
 * Recent Danger Zone runs, newest first - the page's own receipt strip so an
 * admin can see what was already done (and by whom) before doing more.
 * Reads `settings_events` where scope = 'danger_zone'.
 */
export interface DangerZoneRun {
  id: string;
  eventType: string;
  actorName: string | null;
  note: string | null;
  createdAtLabel: string;
}

export async function listRecentDangerZoneRuns(limit = 8): Promise<DangerZoneRun[]> {
  const rows = (await db.execute(sql`
    select se.id, se.event_type, se.note, se.created_at, e.name as actor_name
      from settings_events se
      left join employees e on e.id = se.actor_id
     where se.scope = 'danger_zone'
     order by se.created_at desc
     limit ${limit}
  `)) as unknown as {
    id: string;
    event_type: string;
    note: string | null;
    created_at: string | Date;
    actor_name: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    actorName: r.actor_name,
    note: r.note,
    createdAtLabel: stamp(r.created_at) ?? "-",
  }));
}
