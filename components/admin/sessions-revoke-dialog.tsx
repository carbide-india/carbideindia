"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { SessionsConfirmDialog } from "@/components/admin/sessions-confirm-dialog";
import { revokeEmployeeAccess } from "@/app/(admin)/admin/sessions/actions";
import { fireToast } from "@/lib/toast";

export interface RevokeTarget {
  employeeId: string;
  name: string;
  liveSessionCount: number;
  pushCount: number;
  hasFirebaseUid: boolean;
  /** True when the admin is about to revoke their own access. */
  isSelf: boolean;
}

interface Props {
  target: RevokeTarget;
  onClose: () => void;
}

/**
 * One selectable revoke scope. The whole row IS the checkbox (single control,
 * large target) - the box itself is decorative, so no nested interactive
 * elements and exactly one thing for a screen reader to announce.
 */
function ScopeRow({
  checked,
  onChange,
  disabled,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex w-full items-start gap-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:bg-[#FAFBFD]"
      >
        <span
          aria-hidden
          className={`mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] ${
            checked
              ? "border-brand bg-brand text-white"
              : "border-[#9aa1b0] bg-white text-transparent"
          }`}
        >
          <Check size={13} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-[#0F172A]">
            {label}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-[#64748B]">
            {detail}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Employee-level revocation. Each scope is opt-in and spelled out, because they
 * are genuinely different in strength: our session records and push devices die
 * immediately, whereas revoking Firebase refresh tokens only stops NEW session
 * cookies being minted.
 *
 * Mount only while a target is selected - the fresh mount is what resets the
 * scope tick-boxes between two different people.
 */
export function SessionsRevokeDialog({ target, onClose }: Props) {
  const router = useRouter();
  const [revokePush, setRevokePush] = useState(true);
  const [revokeFirebase, setRevokeFirebase] = useState(true);

  const nothingSelected =
    target.liveSessionCount === 0 &&
    !(revokePush && target.pushCount > 0) &&
    !(revokeFirebase && target.hasFirebaseUid);

  return (
    <SessionsConfirmDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Revoke access for ${target.name}`}
      description="Choose what to revoke. Every scope you tick is recorded in the audit trail with your name."
      confirmLabel="Revoke access"
      pendingLabel="Revoking"
      withReason
      onConfirm={async (reason) => {
        if (nothingSelected) {
          return { ok: false, error: "Nothing selected would change anything." };
        }
        const res = await revokeEmployeeAccess({
          employeeId: target.employeeId,
          reason: reason.length > 0 ? reason : undefined,
          revokePushDevices: revokePush,
          revokeFirebaseTokens: revokeFirebase,
        });
        if (!res.ok) return { ok: false, error: res.error };

        const parts = [`${res.sessionsRevoked} session(s) revoked`];
        if (revokePush) parts.push(`${res.pushDevicesRemoved} push device(s) removed`);
        if (res.firebaseRevoked) parts.push("Firebase tokens revoked");
        if (res.firebaseError) {
          fireToast({
            message: `Firebase revoke failed: ${res.firebaseError}`,
            type: "error",
          });
        }
        router.refresh();
        return { ok: true, message: `${target.name}: ${parts.join(", ")}.` };
      }}
    >
      <ul className="divide-y divide-[#EEF1F6] border-y border-[#EEF1F6]">
        <ScopeRow
          checked
          onChange={() => undefined}
          disabled
          label={`Mark ${target.liveSessionCount} recorded session(s) revoked`}
          detail="Always applied. Our own record of this person's sign-ins is marked dead and kept for the trail."
        />
        <ScopeRow
          checked={revokePush}
          onChange={setRevokePush}
          disabled={target.pushCount === 0}
          label={`Remove ${target.pushCount} push device(s)`}
          detail={
            target.pushCount === 0
              ? "This person has no registered push devices."
              : "Takes effect immediately - those browsers stop receiving notifications."
          }
        />
        <ScopeRow
          checked={revokeFirebase}
          onChange={setRevokeFirebase}
          disabled={!target.hasFirebaseUid}
          label="Revoke Firebase refresh tokens"
          detail={
            target.hasFirebaseUid
              ? "Stops new session cookies being minted. An already-issued cookie stays valid until it expires."
              : "This person has never signed in with Firebase."
          }
        />
      </ul>

      {target.isSelf && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[13px] leading-snug text-[#92600A]"
        >
          <AlertTriangle size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" />
          <span>
            This is your own account. You will keep working until your current
            cookie expires, but you will not be able to sign in again from a new
            device without a fresh sign-in.
          </span>
        </p>
      )}
    </SessionsConfirmDialog>
  );
}
