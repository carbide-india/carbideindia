import { AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { DANGER_ZONE_DEFAULT_WINDOWS } from "@/lib/danger-zone/operations";
import {
  countActiveEmployees,
  getDangerZonePreview,
  listRecentDangerZoneRuns,
  listRevokeCandidates,
} from "@/lib/queries/danger-zone";
import { DangerZoneConsole } from "@/components/admin/danger-zone-console";
import { DangerZoneAbsentNotes } from "@/components/admin/danger-zone-absent-notes";

export const dynamic = "force-dynamic";

export default async function DangerZonePage() {
  const me = await requireAdmin();

  const [preview, allCandidates, runs, activeEmployees] = await Promise.all([
    getDangerZonePreview(DANGER_ZONE_DEFAULT_WINDOWS),
    listRevokeCandidates(),
    listRecentDangerZoneRuns(),
    countActiveEmployees(),
  ]);

  // An admin can never revoke themselves - keep their own row out of the picker
  // entirely rather than showing a target that always errors.
  const candidates = allCandidates.filter((c) => c.id !== me.id);

  const eligible =
    preview.drafts.eligible + preview.notifications.eligible + preview.devices.eligible;

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · System
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Danger Zone
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] text-[#6b7280] tabular-nums">
          6 guarded operations · {eligible} row(s) eligible for cleanup at the
          default windows · {activeEmployees} active employee(s) · signed in as{" "}
          {me.name}
        </p>
      </header>

      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3.5"
        style={{
          borderColor: "color-mix(in srgb, var(--color-red) 30%, transparent)",
          background: "var(--color-red-bg)",
        }}
      >
        <AlertTriangle
          size={18}
          strokeWidth={2.3}
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          style={{ color: "var(--color-red-deep)" }}
        />
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--color-red-deep)" }}
        >
          <strong className="font-extrabold">
            These operations affect every user, not just you.
          </strong>{" "}
          Each one shows the exact number of rows it will touch before it runs and
          asks you to type a confirmation. Nothing here deletes a client, item,
          enquiry, quotation, sales order or audit-log entry - those are governed
          records and are deactivated, never destroyed.
        </p>
      </div>

      <DangerZoneConsole
        initialPreview={preview}
        candidates={candidates}
        runs={runs}
      />

      <DangerZoneAbsentNotes />
    </div>
  );
}
