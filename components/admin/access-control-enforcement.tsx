"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Loader2, ShieldAlert, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setPermissionsEnforced } from "@/app/(admin)/admin/access-control/actions";
import type { EnforcementReadiness } from "@/lib/auth/enforcement";

/**
 * The master switch for fine-grained permission enforcement.
 *
 * Roles and the 56-key permission catalogue have existed since the admin console
 * shipped, but nothing consulted them — every page gated on `requireAdmin()`.
 * Turning this on is what makes the rights panel real, and it is a genuinely
 * disruptive moment: `is_admin` short-circuits to "has everything", so admins
 * are unaffected, but any employee holding NO role loses access the instant it
 * flips.
 *
 * So the switch is guarded by a readiness count rather than being a bare toggle:
 * you cannot enable it while an active non-admin employee has no role. Turning
 * it back OFF is always allowed — that is the escape hatch if a rollout goes
 * wrong, and it needs no deploy.
 */
export function AccessControlEnforcement({
  enforced,
  readiness,
}: {
  enforced: boolean;
  readiness: EnforcementReadiness;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const blocked = !enforced && !readiness.safeToEnable;

  async function toggle(next: boolean) {
    if (next && blocked) return;
    if (
      next &&
      !window.confirm(
        `Enforce permissions for all ${readiness.activeEmployees} active employees?\n\n` +
          `Super admins keep full access. Everyone else will be limited to what their roles grant. ` +
          `You can switch this back off from this screen at any time.`,
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const res = await setPermissionsEnforced(next);
      if (res.ok) {
        fireToast({
          message: next
            ? "Permission enforcement is ON."
            : "Permission enforcement is OFF — everyone is back to the previous access.",
        });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="rounded-section border-2 bg-surface-card p-5"
      style={{ borderColor: enforced ? "#16a34a" : "#e0a94a" }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{
            background: enforced ? "#e8f6ee" : "#fdf6e7",
            color: enforced ? "#16a34a" : "#b45309",
          }}
        >
          {enforced ? (
            <ShieldCheck className="h-[22px] w-[22px]" strokeWidth={2.1} />
          ) : (
            <ShieldAlert className="h-[22px] w-[22px]" strokeWidth={2.1} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-black tracking-tight text-ink-strong">
            Permission enforcement is {enforced ? "ON" : "OFF"}
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] text-ink-soft">
            {enforced ? (
              <>
                Every module and action is limited to what an employee&apos;s roles grant.
                Super admins keep full access.
              </>
            ) : (
              <>
                Roles and permissions are recorded but <strong>not applied</strong> — access is
                still governed by the admin flag alone, so a &quot;view only&quot; role does not
                restrict anyone yet. Turn this on once every employee has a role.
              </>
            )}
          </p>

          {/* Readiness — who would lose access if this flipped right now. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] font-semibold">
            <span className="inline-flex items-center gap-1.5 text-ink-soft">
              <Users size={14} strokeWidth={2.4} />
              {readiness.activeEmployees} active
            </span>
            <span className="text-ink-soft">{readiness.superAdmins} super admin(s)</span>
            <span
              className={
                readiness.employeesWithoutRole > 0 ? "text-[#b45309]" : "text-[#16a34a]"
              }
            >
              {readiness.employeesWithoutRole} with no role
            </span>
          </div>

          {blocked && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#f3d9a6] bg-[#fdf6e7] px-3 py-2.5">
              <TriangleAlert
                size={15}
                strokeWidth={2.5}
                className="mt-0.5 shrink-0 text-[#b45309]"
              />
              <p className="text-[12.5px] font-semibold text-[#7c4a03]">
                {readiness.employeesWithoutRole} active employee
                {readiness.employeesWithoutRole === 1 ? "" : "s"} hold no role. Enabling now
                would lock {readiness.employeesWithoutRole === 1 ? "them" : "them"} out of the
                whole app. Give everyone a role in{" "}
                <Link
                  href={"/admin/roles" as Route}
                  className="underline underline-offset-2 hover:text-[#3f3f94]"
                >
                  Roles &amp; Permissions
                </Link>{" "}
                first.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void toggle(!enforced)}
          disabled={pending || blocked}
          title={blocked ? "Assign a role to every employee first" : undefined}
          className="inline-flex shrink-0 items-center gap-2 rounded-pill px-5 py-2.5 text-[13.5px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: enforced ? "#6b7280" : "linear-gradient(135deg,#16a34a,#12813b)" }}
        >
          {pending && <Loader2 size={15} style={{ animation: "spinFast 0.8s linear infinite" }} />}
          {enforced ? "Turn enforcement OFF" : "Turn enforcement ON"}
        </button>
      </div>
    </section>
  );
}
