import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current";
import { BackLink } from "@/components/ui/back-link";
import {
  getRoleDetail,
  listAssignableEmployees,
  listImplicitAdmins,
  listPermissionGroups,
  listRoleActivity,
  type RoleActivityEntry,
} from "@/lib/queries/roles";
import { RolesPermissionMatrix } from "@/components/admin/roles-permission-matrix";
import { RolesMembersPanel } from "@/components/admin/roles-members-panel";
import { ADMIN_ROLE_NAME, isCanonicalRoleName } from "@/lib/roles/canonical";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ roleId: string }>;
}

/** settings_events types this page renders, in plain English. */
const EVENT_LABELS: Record<string, string> = {
  created: "Role created",
  updated: "Role details updated",
  reordered: "Display order changed",
  permissions_updated: "Permissions changed",
  member_added: "Member granted",
  member_removed: "Member revoked",
  deleted: "Role deleted",
};

export default async function RoleDetailPage({ params }: PageProps) {
  const me = await requireAdmin();
  const { roleId } = await params;

  // A malformed id must 404, not blow up the uuid cast in Postgres.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(roleId)) notFound();

  const detail = await getRoleDetail(roleId);
  if (!detail) notFound();

  const isAdminRole = detail.role.name === ADMIN_ROLE_NAME;
  const [groups, assignable, implicitAdmins, activity] = await Promise.all([
    listPermissionGroups(),
    listAssignableEmployees(),
    isAdminRole ? listImplicitAdmins() : Promise.resolve([]),
    listRoleActivity(detail.role.id),
  ]);

  const catalogueSize = groups.reduce((n, g) => n + g.items.length, 0);
  const activeMembers = detail.members.filter((m) => m.isActive).length;

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-5">
        <BackLink href="/admin/roles" label="All roles" />
      </div>

      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · People &amp; Access
        </span>
        <h1 className="mt-1.5 flex flex-wrap items-center gap-3 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          {detail.role.label}
          <code
            className="rounded-chip px-2.5 py-1 text-[13px] font-bold"
            style={{
              fontFamily: "var(--font-mono-display)",
              background: "color-mix(in srgb, var(--color-brand) 9%, transparent)",
              color: "var(--color-brand-deep)",
            }}
          >
            {detail.role.name}
          </code>
          {isCanonicalRoleName(detail.role.name) ? (
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
              Built-in
            </span>
          ) : null}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[#6b7280] tabular-nums">
          {detail.grantedPermissionIds.length} of {catalogueSize} permissions ·{" "}
          {activeMembers} active member{activeMembers === 1 ? "" : "s"} ·{" "}
          {detail.retiredGrants.length} retired grant
          {detail.retiredGrants.length === 1 ? "" : "s"} · order{" "}
          {detail.role.sortOrder}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] items-start">
        <RolesPermissionMatrix
          roleId={detail.role.id}
          roleLabel={detail.role.label}
          roleName={detail.role.name}
          groups={groups}
          grantedPermissionIds={detail.grantedPermissionIds}
          retiredGrants={detail.retiredGrants}
          isAdminRole={isAdminRole}
        />

        <div className="flex flex-col gap-6">
          <RolesMembersPanel
            roleId={detail.role.id}
            roleLabel={detail.role.label}
            roleName={detail.role.name}
            members={detail.members}
            assignable={assignable}
            implicitAdmins={implicitAdmins}
            currentEmployeeId={me.id}
            isAdminRole={isAdminRole}
          />
          <ActivityTrail entries={activity} />
        </div>
      </div>
    </div>
  );
}

function ActivityTrail({ entries }: { entries: RoleActivityEntry[] }) {
  return (
    <section
      aria-label="Recent changes to this role"
      className="overflow-hidden rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div
        className="border-b border-hairline px-4 py-3"
        style={{ background: "var(--color-surface-soft)" }}
      >
        <h2 className="text-[14px] font-bold tracking-tight text-ink-strong">
          Recent changes
        </h2>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13.5px] text-ink-subtle">
          No changes recorded yet. Every grant, revoke and rename lands here.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] font-semibold text-ink-strong">
                  {EVENT_LABELS[e.eventType] ?? e.eventType}
                </span>
                <time
                  dateTime={e.createdAt.toISOString()}
                  className="shrink-0 text-[12px] text-ink-subtle tabular-nums"
                >
                  {e.createdAt.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}
                </time>
              </div>
              <p className="text-[12.5px] text-ink-subtle">
                {e.actorName ?? "Unknown"}
                {e.note ? ` · ${e.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
