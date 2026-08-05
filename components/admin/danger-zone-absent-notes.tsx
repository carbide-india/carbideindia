import { Lock } from "lucide-react";

const MONO = "var(--font-mono-display)";

/**
 * The operations this page deliberately does NOT offer, each with the reason.
 * Written down because "why can't I do X here?" is the first question an admin
 * asks on a Danger Zone, and because the governance rules behind these answers
 * (append-only audit log, deactivate-never-delete) are load-bearing.
 */
const ABSENT: { title: string; reason: string }[] = [
  {
    title: "Trim or delete audit-log entries",
    reason:
      "audit_log is append-only - a database trigger blocks UPDATE and DELETE outright. The trail is a statutory record, not cache.",
  },
  {
    title: "Hard-delete clients, items, enquiries, quotations or sales orders",
    reason:
      "Governance is deactivate-only. Deactivate the record from its own page; every document that references it keeps working.",
  },
  {
    title: "Permanently erase an employee",
    reason:
      "That lives on the employee's own row in Employees, where the dialog can list the exact tasks and events it would destroy. Here you get the reversible revoke instead.",
  },
  {
    title: "Delete login-session history",
    reason:
      "Sessions are revoked, never deleted, so the sign-in trail survives. Kill an individual session from Sessions.",
  },
  {
    title: "Delete import / export job history",
    reason:
      "data_transfer_jobs is the only explanation you will have for a bad import months later. It is kept forever on purpose.",
  },
  {
    title: "Reset document-number counters",
    reason:
      "Document Numbering owns that, with its gap warning. Moving a counter from here would silently break a statutory series.",
  },
  {
    title: "Empty the database or reset the app",
    reason:
      "There is no safe version of this against live production data, so it does not exist as a button.",
  },
];

export function DangerZoneAbsentNotes() {
  return (
    <section
      aria-labelledby="danger-zone-absent-heading"
      className="mt-6 rounded-2xl border border-[#e6e8ec] bg-[#fafbfc] p-5"
    >
      <div className="flex items-center gap-2">
        <Lock size={14} strokeWidth={2.4} className="text-[#a2a8b4]" aria-hidden="true" />
        <h2
          id="danger-zone-absent-heading"
          className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#a2a8b4]"
          style={{ fontFamily: MONO }}
        >
          Intentionally not available here
        </h2>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3.5 max-lg:grid-cols-1">
        {ABSENT.map((row) => (
          <div key={row.title}>
            <dt className="text-[13px] font-bold text-[#3a4152]">{row.title}</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-[#8b91a0]">
              {row.reason}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
