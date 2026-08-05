"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowUp, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  deleteRole,
  moveRole,
  updateRole,
} from "@/app/(admin)/admin/roles/actions";
import type { RoleWithCounts } from "@/lib/queries/roles";
import {
  ROLE_NAME_HINT,
  isCanonicalRoleName,
  normalizeRoleName,
} from "@/lib/roles/canonical";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  roles: RoleWithCounts[];
  /** Active rows in the permission catalogue — the "n of N" denominator. */
  catalogueSize: number;
}

/**
 * The role register on /admin/roles: counts, display order and the entry point
 * into a role's permission matrix. Editing grants happens on the detail page —
 * this table owns identity (label/name/order) and removal only.
 */
export function RolesList({ roles, catalogueSize }: Props) {
  const [editing, setEditing] = useState<RoleWithCounts | null>(null);
  const [deleting, setDeleting] = useState<RoleWithCounts | null>(null);

  if (roles.length === 0) {
    return (
      <div
        className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
        >
          No roles yet
        </p>
        <p
          className="text-[14px] text-ink-subtle mt-2 max-w-md mx-auto"
          style={{ lineHeight: 1.5 }}
        >
          The seven pipeline roles (sales, costing, production, qc, dispatch,
          accounts, admin) arrive with <code>pnpm seed:defaults</code>. Until
          then, everyone with the admin flag keeps full access — create a role
          above to start granting permissions.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className="overflow-x-auto rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <table className="w-full min-w-[820px] text-[15px]">
          <caption className="sr-only">
            Roles, their members and granted permissions
          </caption>
          <thead>
            <tr
              className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
              style={{ background: "var(--color-surface-soft)" }}
            >
              <th scope="col" className="px-5 py-4">
                Role
              </th>
              <th scope="col" className="px-5 py-4 tabular-nums">
                Members
              </th>
              <th scope="col" className="px-5 py-4 tabular-nums">
                Permissions
              </th>
              <th scope="col" className="px-5 py-4 tabular-nums">
                Order
              </th>
              <th scope="col" className="px-5 py-4 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => (
              <RoleRow
                key={r.id}
                role={r}
                rowIndex={i}
                isFirst={i === 0}
                isLast={i === roles.length - 1}
                catalogueSize={catalogueSize}
                onEdit={() => setEditing(r)}
                onDelete={() => setDeleting(r)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <EditRoleDialog role={editing} onClose={() => setEditing(null)} />
      <DeleteRoleDialog role={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function RoleRow({
  role,
  rowIndex,
  isFirst,
  isLast,
  catalogueSize,
  onEdit,
  onDelete,
}: {
  role: RoleWithCounts;
  rowIndex: number;
  isFirst: boolean;
  isLast: boolean;
  catalogueSize: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const builtIn = isCanonicalRoleName(role.name);
  const pct =
    catalogueSize > 0
      ? Math.min(100, Math.round((role.permissionCount / catalogueSize) * 100))
      : 0;
  const inactiveMembers = role.memberCount - role.activeMemberCount;

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const res = await moveRole(role.id, direction);
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      router.refresh();
    });
  }

  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-chip border border-hairline bg-surface-card text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <tr
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{
        background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
      }}
    >
      <th scope="row" className="px-5 py-4 text-left font-normal">
        <Link
          href={`/admin/roles/${role.id}` as Route}
          className="group inline-flex items-center gap-2 text-ink-strong font-semibold hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded-sm"
        >
          {role.label}
          <ChevronRight
            size={15}
            strokeWidth={2.4}
            className="text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
          />
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <code
            className="text-[12px] text-ink-subtle"
            style={{ fontFamily: "var(--font-mono-display)" }}
          >
            {role.name}
          </code>
          {builtIn ? (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
              style={{
                background: "color-mix(in srgb, var(--color-brand) 10%, transparent)",
                color: "var(--color-brand-deep)",
              }}
            >
              Built-in
            </span>
          ) : null}
        </div>
      </th>
      <td className="px-5 py-4 tabular-nums text-ink-soft">
        {role.activeMemberCount}
        {inactiveMembers > 0 ? (
          <span className="ml-1.5 text-[12.5px] text-ink-subtle">
            +{inactiveMembers} inactive
          </span>
        ) : null}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="tabular-nums text-ink-soft">
            {role.permissionCount}
            <span className="text-ink-subtle"> / {catalogueSize}</span>
          </span>
          <span
            aria-hidden
            className="h-1.5 w-20 overflow-hidden rounded-full"
            style={{ background: "rgba(15,23,42,0.07)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, background: "var(--color-brand)" }}
            />
          </span>
        </div>
      </td>
      <td className="px-5 py-4 tabular-nums text-ink-soft">{role.sortOrder}</td>
      <td className="px-5 py-4 text-right">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            className={iconBtn}
            aria-label={`Move ${role.label} up`}
            title="Move up"
            disabled={pending || isFirst}
            onClick={() => move("up")}
          >
            <ArrowUp size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={iconBtn}
            aria-label={`Move ${role.label} down`}
            title="Move down"
            disabled={pending || isLast}
            onClick={() => move("down")}
          >
            <ArrowDown size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={iconBtn}
            aria-label={`Edit ${role.label}`}
            title="Edit"
            disabled={pending}
            onClick={onEdit}
          >
            <Pencil size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={iconBtn}
            aria-label={
              builtIn
                ? `${role.label} is built in and cannot be removed`
                : `Remove ${role.label}`
            }
            title={
              builtIn
                ? "Built-in roles are referenced by name in code"
                : role.memberCount > 0
                  ? "Revoke every member before removing"
                  : "Remove role"
            }
            disabled={pending || builtIn || role.memberCount > 0}
            onClick={onDelete}
            style={{ color: "var(--color-red)" }}
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
          <Link
            href={`/admin/roles/${role.id}` as Route}
            className="ml-1 rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            Permissions
          </Link>
        </div>
      </td>
    </tr>
  );
}

/**
 * Shell + form are split so the form's state seeds straight from props (keyed
 * on the role id) instead of being re-synced by an effect on every open.
 */
function EditRoleDialog({
  role,
  onClose,
}: {
  role: RoleWithCounts | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={role !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          {role ? <EditRoleForm key={role.id} role={role} onClose={onClose} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditRoleForm({
  role,
  onClose,
}: {
  role: RoleWithCounts;
  onClose: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(role.label);
  const [name, setName] = useState(role.name);
  const [sortOrder, setSortOrder] = useState(role.sortOrder);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const builtIn = isCanonicalRoleName(role.name);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const patch: { label?: string; name?: string; sortOrder?: number } = {};
    const trimmedLabel = label.trim();
    const normalized = normalizeRoleName(name);
    if (trimmedLabel !== role.label) patch.label = trimmedLabel;
    if (!builtIn && normalized !== role.name) patch.name = normalized;
    if (sortOrder !== role.sortOrder) patch.sortOrder = sortOrder;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateRole(role.id, patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${trimmedLabel} updated.` });
      router.refresh();
      onClose();
    });
  }

  return (
    <>
      <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
        Edit role
      </Dialog.Title>
      <Dialog.Description
        className="text-[15px] text-[#64748B] mb-4"
        style={{ lineHeight: 1.5 }}
      >
        The display name is what people read. The identifier is what server code
        quotes — built-in roles keep theirs.
      </Dialog.Description>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="role-edit-label"
            className="block text-[14px] font-semibold text-[#0F172A] mb-1.5"
          >
            Display name
          </label>
          <input
            id="role-edit-label"
            required
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
          />
        </div>
        <div>
          <label
            htmlFor="role-edit-name"
            className="block text-[14px] font-semibold text-[#0F172A] mb-1.5"
          >
            Identifier
          </label>
          <input
            id="role-edit-name"
            value={name}
            disabled={builtIn}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            aria-describedby="role-edit-name-hint"
            className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] font-mono disabled:bg-[#F1F5F9] disabled:text-[#64748B]"
          />
          <p id="role-edit-name-hint" className="mt-1.5 text-[13px] text-[#94A3B8]">
            {builtIn
              ? "Built-in role — the identifier is referenced by name in server code."
              : ROLE_NAME_HINT}
          </p>
        </div>
        <div>
          <label
            htmlFor="role-edit-sort"
            className="block text-[14px] font-semibold text-[#0F172A] mb-1.5"
          >
            Sort order
          </label>
          <input
            id="role-edit-sort"
            type="number"
            min={0}
            max={9999}
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
          />
        </div>
        {error ? (
          <AdminInlineError>
            {error}
          </AdminInlineError>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
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
            type="submit"
            disabled={pending}
            className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
            }}
          >
            {pending ? "Saving" : "Save"}
          </button>
        </div>
      </form>
    </>
  );
}

function DeleteRoleDialog({
  role,
  onClose,
}: {
  role: RoleWithCounts | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={role !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          {role ? <DeleteRoleForm key={role.id} role={role} onClose={onClose} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteRoleForm({
  role,
  onClose,
}: {
  role: RoleWithCounts;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await deleteRole(role.id, confirm);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${role.label} removed.` });
      router.refresh();
      onClose();
    });
  }

  return (
    <>
      <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
        Remove {role.label}
      </Dialog.Title>
      <Dialog.Description
        className="text-[15px] text-[#64748B] mb-4"
        style={{ lineHeight: 1.5 }}
      >
        This role has no members. Removing it also drops its{" "}
        {role.permissionCount} permission grant(s). The audit trail keeps a
        record; the role itself cannot be restored.
      </Dialog.Description>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="role-delete-confirm"
            className="block text-[14px] font-semibold text-[#0F172A] mb-1.5"
          >
            Type <code className="font-mono">{role.name}</code> to confirm
          </label>
          <input
            id="role-delete-confirm"
            autoFocus
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] font-mono"
          />
        </div>
        {error ? (
          <AdminInlineError>
            {error}
          </AdminInlineError>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
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
            type="submit"
            disabled={pending || confirm.trim().toLowerCase() !== role.name}
            className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
            style={{ background: "var(--color-red)" }}
          >
            {pending ? "Removing" : "Remove role"}
          </button>
        </div>
      </form>
    </>
  );
}
