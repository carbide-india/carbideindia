import { ShieldCheck } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import type { PersonalDataExportRow } from "@/lib/queries/data";

const STATUS_TONE: Record<
  PersonalDataExportRow["status"],
  { bg: string; fg: string; label: string }
> = {
  pending: { bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)", label: "Queued" },
  processing: { bg: "var(--color-blue-bg)", fg: "var(--color-blue-deep)", label: "Processing" },
  done: { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)", label: "Completed" },
  failed: { bg: "var(--color-red-bg)", fg: "var(--color-red-deep)", label: "Failed" },
};

/**
 * Read-only view of `audit_data_exports` - the personal "download my data"
 * queue an employee fills from /profile. It is deliberately a separate table
 * from `data_transfer_jobs` (that one is the admin's bulk register transfers),
 * so this panel only shows the requests; it never lets an admin action them.
 */
export function DataPersonalExports({ rows }: { rows: PersonalDataExportRow[] }) {
  return (
    <section
      className="rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      aria-labelledby="personal-exports-heading"
    >
      <header className="flex items-start gap-3 border-b border-hairline px-5 py-4">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
          style={{ background: "#efeffb", color: "#3f3f94" }}
          aria-hidden="true"
        >
          <ShieldCheck className="h-[17px] w-[17px]" strokeWidth={2.1} />
        </span>
        <div>
          <h2
            id="personal-exports-heading"
            className="text-[15.5px] font-extrabold tracking-tight text-[#1e2f66]"
          >
            Personal data requests
          </h2>
          <p className="mt-0.5 text-[13.5px] text-[#6b7280]">
            &ldquo;Download my data&rdquo; requests employees raise from their own
            profile. Shown here for visibility only &mdash; they are not admin
            transfers and cannot be actioned from this page.
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[14px] text-ink-subtle">
          No employee has requested a personal data export.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <caption className="sr-only">Personal data export requests</caption>
            <thead>
              <tr className="border-b border-hairline bg-surface-soft text-left text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                <th scope="col" className="px-5 py-3">Employee</th>
                <th scope="col" className="px-4 py-3">Requested</th>
                <th scope="col" className="px-4 py-3">Completed</th>
                <th scope="col" className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const tone = STATUS_TONE[r.status];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-hairline last:border-b-0"
                    style={{
                      background:
                        i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
                    }}
                  >
                    <td className="px-5 py-3 font-medium text-ink-strong">
                      {r.employeeName}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-soft">
                      {formatDate(r.requestedAt)} · {formatTime(r.requestedAt)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-soft">
                      {r.completedAt ? formatDate(r.completedAt) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                        style={{ background: tone.bg, color: tone.fg }}
                        title={r.error ?? undefined}
                      >
                        {tone.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
