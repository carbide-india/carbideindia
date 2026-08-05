import { KeyRound, ShieldCheck, UserCheck, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { getRolesOverview, listRolesWithCounts } from "@/lib/queries/roles";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { RolesCreateDialog } from "@/components/admin/roles-create-dialog";
import { RolesList } from "@/components/admin/roles-list";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requireAdmin();
  const [rows, overview] = await Promise.all([
    listRolesWithCounts(),
    getRolesOverview(),
  ]);

  const rolesWithGrants = rows.filter((r) => r.permissionCount > 0).length;

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <span
            className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
            style={{ fontFamily: "var(--font-mono-display)" }}
          >
            Admin · People &amp; Access
          </span>
          <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
            Roles &amp; Permissions
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] text-[#6b7280] tabular-nums">
            {rows.length} roles · {rolesWithGrants} with grants ·{" "}
            {overview.grantCount} grants across a {overview.catalogueSize}
            -permission catalogue · {overview.peopleWithRoles} of{" "}
            {overview.activeEmployees} people mapped
          </p>
        </div>
        <div className="mt-1">
          <RolesCreateDialog />
        </div>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiTile
          index={0}
          label="Roles"
          value={rows.length}
          hint={`${rolesWithGrants} carry at least one permission`}
          tone="blue"
          icon={<ShieldCheck size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={1}
          label="Permissions"
          value={overview.catalogueSize}
          hint="Active keys in the catalogue"
          tone="purple"
          icon={<KeyRound size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={2}
          label="Grants"
          value={overview.grantCount}
          hint="Role → permission rows"
          tone="green"
          icon={<UserCheck size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={3}
          label="People mapped"
          value={overview.peopleWithRoles}
          hint={`of ${overview.activeEmployees} active employees`}
          tone="amber"
          icon={<Users size={16} strokeWidth={2.2} />}
        />
      </div>

      {overview.implicitAdmins > 0 ? (
        <div
          className="mb-6 rounded-section border px-5 py-4"
          style={{
            borderColor: "color-mix(in srgb, var(--color-amber) 34%, transparent)",
            background: "var(--color-amber-bg)",
          }}
        >
          <p className="text-[14px] font-semibold text-ink-strong">
            {overview.implicitAdmins} admin
            {overview.implicitAdmins === 1 ? "" : "s"} hold no explicit role
          </p>
          <p className="mt-1 text-[13.5px] text-ink-soft" style={{ lineHeight: 1.55 }}>
            Employees flagged <code className="font-mono">is_admin</code> with no
            rows in <code className="font-mono">employee_roles</code> still
            resolve to the admin role through the pre-rollout fallback in{" "}
            <code className="font-mono">lib/auth/roles.ts</code>, and bypass every
            permission check. Open the admin role to make those grants explicit.
          </p>
        </div>
      ) : null}

      <RolesList roles={rows} catalogueSize={overview.catalogueSize} />

      <p
        className="mt-6 text-[13px] text-ink-subtle"
        style={{ lineHeight: 1.6, maxWidth: "72ch" }}
      >
        Grants are managed here but not yet enforced: every server action still
        guards with <code className="font-mono">requireAdmin()</code>. The
        resolver in <code className="font-mono">lib/auth/permissions.ts</code>{" "}
        reads these rows so actions can migrate onto{" "}
        <code className="font-mono">requirePermission()</code> one at a time. The
        catalogue has no delete permission by design — records are deactivated,
        never destroyed.
      </p>
    </div>
  );
}
