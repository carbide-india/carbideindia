"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { fireToast } from "@/lib/toast";
import {
  revokeRolePermission,
  setRolePermissions,
} from "@/app/(admin)/admin/roles/actions";
import type { PermissionGroup, RetiredGrant } from "@/lib/queries/roles";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  roleId: string;
  roleLabel: string;
  roleName: string;
  groups: PermissionGroup[];
  grantedPermissionIds: string[];
  retiredGrants: RetiredGrant[];
  /** True for the `admin` role, whose holders bypass every check anyway. */
  isAdminRole: boolean;
}

/**
 * The grant editor: one section per permission module, tri-state select-all per
 * section, a keyboard filter across key/label/description, and a single
 * explicit Save that diffs against the server state. Nothing is written until
 * Save — the pending-change count is always visible.
 */
export function RolesPermissionMatrix({
  roleId,
  roleLabel,
  roleName,
  groups,
  grantedPermissionIds,
  retiredGrants,
  isAdminRole,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(grantedPermissionIds),
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const initial = useMemo(() => new Set(grantedPermissionIds), [grantedPermissionIds]);
  const totalPermissions = groups.reduce((n, g) => n + g.items.length, 0);

  const added = [...selected].filter((id) => !initial.has(id));
  const removed = [...initial].filter((id) => !selected.has(id));
  const dirty = added.length > 0 || removed.length > 0;

  const needle = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!needle) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (p) =>
            p.key.toLowerCase().includes(needle) ||
            p.label.toLowerCase().includes(needle) ||
            (p.description ?? "").toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, needle]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function onSave() {
    setError(null);
    startSaving(async () => {
      const res = await setRolePermissions({
        roleId,
        permissionIds: [...selected],
      });
      if (!res.ok) {
        setError(res.error);
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({
        message: `${roleLabel}: ${res.granted} granted, ${res.revoked} revoked.`,
      });
      router.refresh();
    });
  }

  if (totalPermissions === 0) {
    return (
      <div
        className="rounded-section border border-hairline-strong bg-surface-card px-6 py-12 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 20, letterSpacing: "-0.015em" }}
        >
          The permission catalogue is empty
        </p>
        <p className="mt-2 text-[14px] text-ink-subtle max-w-md mx-auto" style={{ lineHeight: 1.5 }}>
          Run <code className="font-mono">pnpm seed:defaults</code> to load the
          57 catalogue keys. Until then this role can hold no grants and
          everything keeps running off the admin flag.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isAdminRole ? (
        <div
          className="rounded-section border px-5 py-3.5 text-[13.5px]"
          style={{
            borderColor: "color-mix(in srgb, var(--color-amber) 34%, transparent)",
            background: "var(--color-amber-bg)",
            lineHeight: 1.55,
          }}
        >
          <span className="font-semibold text-ink-strong">
            The admin role short-circuits every check.
          </span>{" "}
          <span className="text-ink-soft">
            Holders of <code className="font-mono">{roleName}</code> pass{" "}
            <code className="font-mono">hasRole()</code> and{" "}
            <code className="font-mono">hasPermission()</code> regardless of what
            is ticked here. Grants below are still recorded, so the day admin
            stops implying everything the set is already correct.
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={15}
            strokeWidth={2.2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter permissions"
            aria-label="Filter permissions"
            className="w-full rounded-md border border-[#CBD5E1] py-2.5 pl-9 pr-3 text-[14px]"
          />
        </div>
        <span className="text-[13px] text-ink-subtle tabular-nums">
          {selected.size} of {totalPermissions} selected
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMany(groups.flatMap((g) => g.items.map((p) => p.id)), true)}
            className="rounded-chip border border-hairline bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-chip border border-hairline bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong"
          >
            Clear all
          </button>
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <p className="rounded-section border border-hairline bg-surface-card px-5 py-8 text-center text-[14px] text-ink-subtle">
          No permission matches “{query}”.
        </p>
      ) : null}

      {visibleGroups.map((group) => {
        const ids = group.items.map((p) => p.id);
        const on = ids.filter((id) => selected.has(id)).length;
        const all = on === ids.length && ids.length > 0;
        return (
          <section
            key={group.module}
            aria-label={`${group.label} permissions`}
            className="overflow-hidden rounded-section border border-hairline bg-surface-card"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <div
              className="flex items-center gap-3 border-b border-hairline px-4 py-3"
              style={{ background: "var(--color-surface-soft)" }}
            >
              <Checkbox
                checked={all}
                indeterminate={on > 0 && !all}
                onChange={(next) => setMany(ids, next)}
                ariaLabel={`Select every ${group.label} permission`}
              />
              <h3 className="flex-1 text-[14px] font-bold tracking-tight text-ink-strong">
                {group.label}
              </h3>
              <span className="text-[12.5px] text-ink-subtle tabular-nums">
                {on} / {ids.length}
              </span>
            </div>
            <ul className="divide-y divide-hairline">
              {group.items.map((p) => {
                const checked = selected.has(p.id);
                const changed =
                  (checked && !initial.has(p.id)) || (!checked && initial.has(p.id));
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(p.id)}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                    >
                      {/* Mirrors components/ui/checkbox — the whole row is the
                          control, and a button can't nest another button. */}
                      <span
                        aria-hidden
                        className={`mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
                          checked
                            ? "bg-brand border-brand text-white"
                            : "bg-white border-[#9aa1b0] text-transparent"
                        }`}
                      >
                        {checked ? <Check size={13} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-semibold text-ink-strong">
                            {p.label}
                          </span>
                          <code
                            className="text-[11.5px] text-ink-subtle"
                            style={{ fontFamily: "var(--font-mono-display)" }}
                          >
                            {p.key}
                          </code>
                          {changed ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
                              style={{
                                background:
                                  "color-mix(in srgb, var(--color-brand) 12%, transparent)",
                                color: "var(--color-brand-deep)",
                              }}
                            >
                              {checked ? "Adding" : "Removing"}
                            </span>
                          ) : null}
                        </span>
                        {p.description ? (
                          <span className="mt-0.5 block text-[12.5px] text-ink-subtle">
                            {p.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {retiredGrants.length > 0 ? (
        <section
          aria-label="Retired permissions still granted"
          className="rounded-section border px-4 py-3.5"
          style={{
            borderColor: "color-mix(in srgb, var(--color-amber) 34%, transparent)",
            background: "var(--color-amber-bg)",
          }}
        >
          <h3 className="text-[13.5px] font-bold text-ink-strong">
            Retired permissions still granted
          </h3>
          <p className="mt-1 text-[12.5px] text-ink-soft" style={{ lineHeight: 1.5 }}>
            These catalogue rows were deactivated after the grant was made. They
            resolve to nothing at runtime; revoke them to tidy the record.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {retiredGrants.map((g) => (
              <RetiredGrantRow key={g.permissionId} roleId={roleId} grant={g} />
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <AdminInlineError>
          {error}
        </AdminInlineError>
      ) : null}

      <div
        className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-section border border-hairline bg-surface-card px-4 py-3"
        style={{ boxShadow: "0 12px 28px -18px rgba(15,23,42,0.35)" }}
      >
        <p className="text-[13.5px] text-ink-soft tabular-nums" aria-live="polite">
          {dirty
            ? `${added.length} to grant · ${removed.length} to revoke`
            : "No pending changes"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelected(new Set(grantedPermissionIds));
              setError(null);
            }}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-chip border border-hairline bg-surface-card px-3.5 py-2 text-[13.5px] font-semibold text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong disabled:opacity-40"
          >
            <RotateCcw size={14} strokeWidth={2.2} />
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="rounded-md px-5 py-2 text-[14px] font-medium text-white disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
            }}
          >
            {saving ? "Saving" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RetiredGrantRow({
  roleId,
  grant,
}: {
  roleId: string;
  grant: RetiredGrant;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRevoke() {
    startTransition(async () => {
      const res = await revokeRolePermission(roleId, grant.permissionId);
      if (!res.ok) {
        fireToast({ type: "error", message: res.error });
        return;
      }
      fireToast({ message: `${grant.key} revoked.` });
      router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-ink-strong">
        {grant.label}{" "}
        <code
          className="text-[11.5px] text-ink-subtle"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          {grant.key}
        </code>
      </span>
      <button
        type="button"
        onClick={onRevoke}
        disabled={pending}
        className="rounded-chip border border-hairline bg-surface-card px-3 py-1 text-[12.5px] font-semibold transition-colors hover:border-brand/40 disabled:opacity-40"
        style={{ color: "var(--color-red)" }}
      >
        {pending ? "Revoking" : "Revoke"}
      </button>
    </li>
  );
}
