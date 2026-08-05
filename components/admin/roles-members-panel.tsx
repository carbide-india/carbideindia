"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { UserMinus, UserPlus } from "lucide-react";
import { Select } from "@/components/ui/select";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { fireToast } from "@/lib/toast";
import {
  assignRoleToEmployee,
  removeRoleFromEmployee,
} from "@/app/(admin)/admin/roles/actions";
import type { AssignableEmployee, RoleMember } from "@/lib/queries/roles";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  roleId: string;
  roleLabel: string;
  roleName: string;
  members: RoleMember[];
  /** Every active employee — the picker filters out current members itself. */
  assignable: AssignableEmployee[];
  /**
   * Active admins with no explicit role rows (admin role only). They already
   * behave as admins via the fallback in lib/auth/roles.ts.
   */
  implicitAdmins: AssignableEmployee[];
  currentEmployeeId: string;
  isAdminRole: boolean;
}

/** Who holds this role, and the grant/revoke controls for it. */
export function RolesMembersPanel({
  roleId,
  roleLabel,
  roleName,
  members,
  assignable,
  implicitAdmins,
  currentEmployeeId,
  isAdminRole,
}: Props) {
  const router = useRouter();
  const [pickerValue, setPickerValue] = useState("");
  const [confirming, setConfirming] = useState<RoleMember | null>(null);
  const [adding, startAdding] = useTransition();

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.employeeId)),
    [members],
  );
  const options = useMemo(
    () =>
      assignable
        .filter((e) => !memberIds.has(e.id))
        .map((e) => ({
          value: e.id,
          label: e.designation ? `${e.name} — ${e.designation}` : e.name,
        })),
    [assignable, memberIds],
  );

  const activeMembers = members.filter((m) => m.isActive).length;

  function onAdd() {
    if (!pickerValue) return;
    startAdding(async () => {
      const res = await assignRoleToEmployee(roleId, pickerValue);
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      const person = assignable.find((e) => e.id === pickerValue);
      fireToast({ message: `${person?.name ?? "Employee"} now holds ${roleLabel}.` });
      setPickerValue("");
      router.refresh();
    });
  }

  function grantImplicit(employee: AssignableEmployee) {
    startAdding(async () => {
      const res = await assignRoleToEmployee(roleId, employee.id);
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({ message: `${employee.name}'s admin role is now explicit.` });
      router.refresh();
    });
  }

  return (
    <section
      aria-label={`${roleLabel} members`}
      className="overflow-hidden rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div
        className="flex items-center gap-3 border-b border-hairline px-4 py-3"
        style={{ background: "var(--color-surface-soft)" }}
      >
        <h2 className="flex-1 text-[14px] font-bold tracking-tight text-ink-strong">
          Members
        </h2>
        <span className="text-[12.5px] text-ink-subtle tabular-nums">
          {activeMembers} active
          {members.length > activeMembers
            ? ` · ${members.length - activeMembers} inactive`
            : ""}
        </span>
      </div>

      <div className="border-b border-hairline p-4">
        <label
          htmlFor="roles-member-picker"
          className="block text-[13px] font-semibold text-ink-strong mb-1.5"
        >
          Grant {roleLabel} to
        </label>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Select
              id="roles-member-picker"
              options={options}
              value={pickerValue}
              onValueChange={setPickerValue}
              placeholder={
                options.length === 0 ? "Everyone already holds it" : "Select an employee"
              }
              disabled={options.length === 0 || adding}
              ariaLabel={`Employee to grant ${roleLabel} to`}
              searchable
            />
          </div>
          <button
            type="button"
            onClick={onAdd}
            disabled={!pickerValue || adding}
            className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-md px-4 text-[14px] font-medium text-white disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
            }}
          >
            <UserPlus size={15} strokeWidth={2.2} />
            {adding ? "Granting" : "Grant"}
          </button>
        </div>
      </div>

      {members.length === 0 ? (
        <p className="px-4 py-8 text-center text-[14px] text-ink-subtle" style={{ lineHeight: 1.55 }}>
          Nobody holds {roleLabel} yet. Grants are what make{" "}
          <code className="font-mono">requireRole(&quot;{roleName}&quot;)</code>{" "}
          pass for a non-admin.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {members.map((m) => (
            <li key={m.employeeId} className="flex items-center gap-3 px-4 py-3">
              <EmployeeAvatar name={m.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-ink-strong">
                    {m.name}
                  </span>
                  {m.employeeId === currentEmployeeId ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
                      style={{
                        background:
                          "color-mix(in srgb, var(--color-brand) 12%, transparent)",
                        color: "var(--color-brand-deep)",
                      }}
                    >
                      You
                    </span>
                  ) : null}
                  {m.isAdmin ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
                      style={{
                        background: "var(--color-purple-bg)",
                        color: "var(--color-purple-deep)",
                      }}
                    >
                      Admin flag
                    </span>
                  ) : null}
                  {!m.isActive ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
                      style={{
                        background: "rgba(15, 23, 42, 0.05)",
                        color: "var(--color-ink-subtle)",
                      }}
                    >
                      Deactivated
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-[12.5px] text-ink-subtle">
                  {m.designation ? `${m.designation} · ` : ""}
                  {m.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(m)}
                aria-label={`Revoke ${roleLabel} from ${m.name}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline bg-surface-card px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong"
              >
                <UserMinus size={14} strokeWidth={2.2} />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {isAdminRole && implicitAdmins.length > 0 ? (
        <div
          className="border-t px-4 py-3.5"
          style={{
            borderColor: "color-mix(in srgb, var(--color-amber) 34%, transparent)",
            background: "var(--color-amber-bg)",
          }}
        >
          <h3 className="text-[13px] font-bold text-ink-strong">
            Implicit admins ({implicitAdmins.length})
          </h3>
          <p className="mt-1 text-[12.5px] text-ink-soft" style={{ lineHeight: 1.5 }}>
            Flagged <code className="font-mono">is_admin</code> with no role rows
            at all, so <code className="font-mono">userRoles()</code> falls back
            to <code className="font-mono">[&quot;admin&quot;]</code> for them.
            Make it explicit so the register matches reality.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {implicitAdmins.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-[13px] text-ink-strong">
                  {e.name}{" "}
                  <span className="text-ink-subtle">{e.email}</span>
                </span>
                <button
                  type="button"
                  onClick={() => grantImplicit(e)}
                  disabled={adding}
                  className="shrink-0 rounded-chip border border-hairline bg-surface-card px-3 py-1 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong disabled:opacity-40"
                >
                  Grant explicitly
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <RevokeMemberDialog
        roleId={roleId}
        roleLabel={roleLabel}
        member={confirming}
        isSelf={confirming?.employeeId === currentEmployeeId}
        isAdminRole={isAdminRole}
        onClose={() => setConfirming(null)}
      />
    </section>
  );
}

function RevokeMemberDialog({
  roleId,
  roleLabel,
  member,
  isSelf,
  isAdminRole,
  onClose,
}: {
  roleId: string;
  roleLabel: string;
  member: RoleMember | null;
  isSelf: boolean;
  isAdminRole: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (!member) return;
    setError(null);
    startTransition(async () => {
      const res = await removeRoleFromEmployee(roleId, member.employeeId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${roleLabel} revoked from ${member.name}.` });
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog.Root
      open={member !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Revoke {roleLabel}?
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            {member?.name} loses every permission this role carries.
            {isAdminRole
              ? " The admin role also implies every other role — the last active holder cannot be revoked."
              : ""}
            {isSelf ? " This is your own account." : ""}
          </Dialog.Description>
          {error ? (
            <AdminInlineError className="mb-4">
              {error}
            </AdminInlineError>
          ) : null}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                disabled={pending}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--color-red)" }}
            >
              {pending ? "Revoking" : "Revoke role"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
