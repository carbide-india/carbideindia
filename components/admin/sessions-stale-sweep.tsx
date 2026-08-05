"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brush } from "lucide-react";
import { SessionsConfirmDialog } from "@/components/admin/sessions-confirm-dialog";
import { revokeStaleSessions } from "@/app/(admin)/admin/sessions/actions";

const PRESETS: { hours: number; label: string }[] = [
  { hours: 24, label: "1 day" },
  { hours: 24 * 7, label: "7 days" },
  { hours: 24 * 30, label: "30 days" },
];

interface Props {
  /** How many recorded sessions are currently live - used in the copy. */
  liveCount: number;
}

/**
 * Housekeeping: mark every session row that has not been seen for a while as
 * revoked, so the list reflects reality instead of accumulating ghosts. Session
 * rows are never deleted - the trail survives.
 */
export function SessionsStaleSweep({ liveCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<number>(24 * 7);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={liveCount === 0}
        className="inline-flex items-center gap-2 rounded-md border border-[#D8DDE7] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#3F3F94] transition-colors hover:bg-[#F4F4FD] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Brush size={14} strokeWidth={2.3} />
        Sweep stale sessions
      </button>

      {open && (
      <SessionsConfirmDialog
        open
        onOpenChange={setOpen}
        title="Sweep stale sessions"
        description="Marks every live session record that has not been seen since the cut-off as revoked. Nothing is deleted and no one is signed out by this - it only cleans up the register."
        confirmLabel="Revoke stale sessions"
        pendingLabel="Sweeping"
        withReason
        onConfirm={async (reason) => {
          const res = await revokeStaleSessions({
            olderThanHours: hours,
            reason: reason.length > 0 ? reason : undefined,
          });
          if (!res.ok) return { ok: false, error: res.error };
          router.refresh();
          return {
            ok: true,
            message:
              res.revoked === 0
                ? "No stale sessions to revoke."
                : `${res.revoked} stale session(s) revoked.`,
          };
        }}
      >
        <fieldset className="rounded-lg border border-[#EEF1F6] px-3 py-3">
          <legend className="px-1 text-[12px] font-bold uppercase tracking-[0.10em] text-[#8b93a3]">
            Not seen for at least
          </legend>
          <div
            role="radiogroup"
            aria-label="Stale cut-off"
            className="flex flex-wrap gap-2"
          >
            {PRESETS.map((p) => (
              <button
                key={p.hours}
                type="button"
                role="radio"
                aria-checked={hours === p.hours}
                onClick={() => setHours(p.hours)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  hours === p.hours
                    ? "bg-[#3F3F94] text-white"
                    : "bg-[#F1F3F8] text-[#475069] hover:bg-[#E7EAF3]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      </SessionsConfirmDialog>
      )}
    </>
  );
}
