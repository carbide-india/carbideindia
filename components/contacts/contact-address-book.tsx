import Link from "next/link";
import type { Route } from "next";
import type {
  ContactCompanyGroup,
  ContactPersonRow,
} from "@/lib/queries/contacts";

/** Pixel widths of the two frozen columns — used to compute sticky `left` offsets. */
const COMPANY_W = 216;
const NAME_W = 188;

/** Opaque backgrounds for frozen cells (must not be transparent, or scrolled body cells show through). */
const FROZEN_BG = "var(--color-surface-card, #ffffff)";
const FROZEN_BG_ALT = "#fafaff";
const HEADER_BG = "var(--color-surface-soft, #f4f4fb)";

/** Right edge treatment on the last frozen column so the pinned block reads as one panel. */
const FROZEN_EDGE = "1px solid rgba(63,63,148,0.16)";
const FROZEN_SHADOW = "6px 0 8px -6px rgba(15,23,42,0.14)";

function fullName(c: ContactPersonRow): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
}

function cityState(g: ContactCompanyGroup): string {
  return [g.city, g.state].filter(Boolean).join(", ") || "—";
}

function GradeBadge({ grade }: { grade: "A" | "B" | "C" | null }) {
  if (!grade) return <span className="text-ink-subtle">—</span>;
  const tone: Record<"A" | "B" | "C", string> = {
    A: "bg-[#e8e8fb] text-[#3f3f94]",
    B: "bg-[#eef2f7] text-[#475569]",
    C: "bg-[#f5f0ea] text-[#8a6d3b]",
  };
  return (
    <span
      className={`inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${tone[grade]}`}
    >
      {grade}
    </span>
  );
}

export function ContactAddressBook({
  groups,
}: {
  groups: ContactCompanyGroup[];
}) {
  return (
    <div
      className="overflow-x-auto rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <table
        className="w-full border-collapse text-[13px]"
        style={{ minWidth: 920 }}
      >
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
            <th
              className="border-b border-hairline px-4 py-3"
              style={{
                position: "sticky",
                left: 0,
                zIndex: 4,
                width: COMPANY_W,
                minWidth: COMPANY_W,
                background: HEADER_BG,
              }}
            >
              Company
            </th>
            <th
              className="border-b border-hairline px-4 py-3"
              style={{
                position: "sticky",
                left: COMPANY_W,
                zIndex: 4,
                width: NAME_W,
                minWidth: NAME_W,
                background: HEADER_BG,
                borderRight: FROZEN_EDGE,
                boxShadow: FROZEN_SHADOW,
              }}
            >
              Contact Person Name
            </th>
            <th className="border-b border-hairline px-4 py-3">Designation</th>
            <th className="border-b border-hairline px-4 py-3">Contact No</th>
            <th className="border-b border-hairline px-4 py-3">Email</th>
            <th className="border-b border-hairline px-4 py-3">City / State</th>
            <th className="border-b border-hairline px-4 py-3">Grade</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => {
            const rowSpan = g.contacts.length;
            const companyBg = gi % 2 === 1 ? FROZEN_BG_ALT : FROZEN_BG;
            return g.contacts.map((c, ci) => {
              const first = ci === 0;
              const lastInGroup = ci === rowSpan - 1;
              return (
                <tr
                  key={c.id}
                  className="align-top"
                  style={{
                    borderBottom: lastInGroup
                      ? "1px solid var(--color-hairline, #e7e7ee)"
                      : "1px solid rgba(15,23,42,0.045)",
                  }}
                >
                  {first && (
                    <td
                      rowSpan={rowSpan}
                      className="px-4 py-2.5 align-top"
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        width: COMPANY_W,
                        minWidth: COMPANY_W,
                        background: companyBg,
                        borderBottom: FROZEN_EDGE,
                      }}
                    >
                      <Link
                        href={`/clients/${g.clientId}` as Route}
                        className="font-semibold leading-snug text-brand hover:underline"
                      >
                        {g.clientName}
                      </Link>
                      {g.clientCode && (
                        <div className="mt-0.5 text-[11px] font-semibold tabular-nums text-ink-subtle">
                          {g.clientCode}
                        </div>
                      )}
                    </td>
                  )}
                  <td
                    className="px-4 py-2.5"
                    style={{
                      position: "sticky",
                      left: COMPANY_W,
                      zIndex: 2,
                      width: NAME_W,
                      minWidth: NAME_W,
                      background: companyBg,
                      borderRight: FROZEN_EDGE,
                      boxShadow: FROZEN_SHADOW,
                    }}
                  >
                    <span className="font-semibold text-ink-strong">
                      {fullName(c)}
                    </span>
                    {c.isPrimary && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-[#e8e8fb] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#3f3f94] align-middle">
                        Primary
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {c.designation ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-soft whitespace-nowrap">
                    {c.contactNo ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft break-all">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="hover:text-brand hover:underline"
                      >
                        {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {first && (
                    <td
                      rowSpan={rowSpan}
                      className="px-4 py-2.5 align-top text-ink-soft"
                    >
                      {cityState(g)}
                    </td>
                  )}
                  {first && (
                    <td
                      rowSpan={rowSpan}
                      className="px-4 py-2.5 align-top"
                    >
                      <GradeBadge grade={g.grade} />
                    </td>
                  )}
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
