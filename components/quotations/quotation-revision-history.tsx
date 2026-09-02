import Link from "next/link";
import type { Route } from "next";
import type { QuotationRevisionEntry } from "@/lib/queries/quotations";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatInr, formatDateTime } from "@/lib/format";

/**
 * CUMULATIVE revision comparison TABLE.
 *
 *   Parameter | Revision 3 | Revision 2 | Revision 1 | Original
 *
 * Columns run newest → oldest (Original last). Each parameter row appears only
 * if that field changed in some revision. A field's value shows from the
 * revision where it FIRST changed onward (carried forward into newer columns);
 * columns older than its first change are left blank. The cell is highlighted
 * red only in the revision where the field actually changed. The Original column
 * always shows the baseline value.
 *
 * Example (Quantity first changed in R1, Amount in R2, Quote Price in R3):
 *   Quote Price | ₹1,50,000* |     —      |     —      | ₹1,00,000
 *   Amount      | ₹2,00,000  | ₹2,00,000* |     —      | ₹1,80,000
 *   Quantity    |    75      |    75      |   75*      |    50
 *   (* = highlighted, the revision where it changed)
 */

type Fields = QuotationRevisionEntry["fields"];

const FIELD_DEFS: { key: keyof Fields; label: string; money?: boolean }[] = [
  { key: "custProductName", label: "Product" },
  { key: "qty", label: "Quantity" },
  { key: "finalCost", label: "Final Cost", money: true },
  { key: "negotiation", label: "Negotiation", money: true },
  { key: "quotePrice", label: "Quote Price", money: true },
  { key: "developmentTime", label: "Development Time" },
  { key: "deliveryTime", label: "Delivery Time" },
  { key: "validity", label: "Validity" },
  { key: "quotationLink", label: "Quotation Link" },
];

function fmt(value: string | null, money?: boolean): string {
  if (value == null || value === "") return "—";
  if (money) {
    const n = Number(value);
    return Number.isFinite(n) ? formatInr(n) : value;
  }
  return value;
}

const norm = (v: string | null): string => (v ?? "").toString().trim();

/**
 * @param entries oldest → newest (Original first), as returned by the chain queries.
 * @param visibleIds when given, only these revision ids render as columns (the
 *   change highlighting is still computed over the FULL chain, so a value shown
 *   in a visible column is correct even if the revision that changed it is hidden).
 */
export function QuotationRevisionTimeline({
  entries,
  employees,
  visibleIds,
}: {
  entries: QuotationRevisionEntry[];
  employees?: EmployeeOption[];
  visibleIds?: string[];
}) {
  const n = entries.length;
  if (n === 0) return null;
  const nameById = new Map((employees ?? []).map((e) => [e.id, e.name]));

  // The revision index (1..n-1) at which each field FIRST changed vs. its prior
  // value. Undefined ⇒ never changed → the row is not shown at all.
  const firstChange: Partial<Record<keyof Fields, number>> = {};
  for (const f of FIELD_DEFS) {
    for (let i = 1; i < n; i++) {
      if (norm(entries[i]!.fields[f.key]) !== norm(entries[i - 1]!.fields[f.key])) {
        firstChange[f.key] = i;
        break;
      }
    }
  }
  // Rows: only participating fields, most-recently-introduced change on top.
  const rows = FIELD_DEFS.filter((f) => firstChange[f.key] !== undefined).sort(
    (a, b) => (firstChange[b.key] as number) - (firstChange[a.key] as number),
  );

  // Columns: revisions newest → oldest, then Original last — each carries its
  // index k in the full chain (used for highlighting). Optionally filtered to a
  // chosen subset.
  let cols: number[] = [];
  for (let k = n - 1; k >= 1; k--) cols.push(k);
  cols.push(0);
  if (visibleIds) cols = cols.filter((k) => visibleIds.includes(entries[k]!.id));

  if (cols.length === 0) {
    return (
      <p className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-[12.5px] text-ink-subtle">
        Pick at least one revision to compare.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-[12.5px] text-ink-subtle">
        No priced/term fields changed across the revisions (reason-only re-quotes).
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline bg-surface-soft">
            <th className="sticky left-0 z-10 bg-surface-soft px-4 py-2.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-subtle">
              Parameter
            </th>
            {cols.map((k) => {
              const e = entries[k]!;
              const isOriginal = k === 0;
              const color = isOriginal ? "#16a34a" : "#d03232";
              const label = isOriginal ? "Original" : `Revision ${Math.max(1, e.revisionNo - 1)}`;
              const who = e.createdById ? nameById.get(e.createdById) ?? null : null;
              return (
                <th key={e.id} className="min-w-[132px] px-4 py-2.5 align-top">
                  <div className="text-[11.5px] font-black" style={{ color }}>
                    {label}
                    {e.isLatestRevision && !isOriginal ? " · Current" : ""}
                  </div>
                  <Link
                    href={`/quotations/${e.id}` as Route}
                    className="font-mono text-[10.5px] font-semibold hover:underline"
                    style={{ color }}
                  >
                    {e.quoteNo}
                  </Link>
                  <div className="mt-0.5 text-[10px] font-medium text-ink-subtle">
                    {formatDateTime(e.createdAt)}
                    {who ? ` · ${who}` : ""}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const fc = firstChange[f.key] as number;
            return (
              <tr key={f.key} className="border-b border-[#f3f1ec] last:border-0">
                <td className="sticky left-0 z-10 bg-surface-card px-4 py-2 text-[12.5px] font-bold text-ink-strong">
                  {f.label}
                </td>
                {cols.map((k) => {
                  const e = entries[k]!;
                  const isOriginal = k === 0;
                  // Field not part of this revision yet (changed only later).
                  if (!isOriginal && fc > k) {
                    return (
                      <td key={e.id} className="px-4 py-2 text-[12.5px]" style={{ color: "#c4c2bd" }}>
                        —
                      </td>
                    );
                  }
                  const changed = !isOriginal && fc === k;
                  return (
                    <td key={e.id} className="px-4 py-2 text-[12.5px]">
                      <span
                        className={changed ? "rounded-[4px] px-1.5 py-0.5 font-bold" : "text-ink-muted"}
                        style={
                          changed
                            ? { color: "#b02525", background: "color-mix(in srgb, #d03232 12%, transparent)" }
                            : undefined
                        }
                      >
                        {fmt(e.fields[f.key], f.money)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Reason row — what each re-quote was for. */}
          <tr className="border-t border-hairline bg-surface-soft/50">
            <td className="sticky left-0 z-10 bg-surface-soft px-4 py-2 text-[12.5px] font-bold text-ink-strong">
              Reason
            </td>
            {cols.map((k) => {
              const e = entries[k]!;
              const isOriginal = k === 0;
              return (
                <td key={e.id} className="px-4 py-2 text-[12px] text-ink-muted">
                  {isOriginal ? "—" : e.revisionReason || "—"}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Admin-only revision history for one quote's detail page. */
export function QuotationRevisionHistory({
  revisions,
  employees,
}: {
  revisions: QuotationRevisionEntry[];
  employees?: EmployeeOption[];
}) {
  if (revisions.length <= 1) return null;

  return (
    <section
      className="rounded-section border border-hairline bg-surface-card p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#d03232]">
          Admin
        </span>
        <h2 className="text-[15px] font-black tracking-tight text-ink-strong">
          Revision History
        </h2>
      </div>
      <p className="mb-4 text-[12.5px] text-ink-subtle">
        Newest revision on the left. A field shows from the revision it first changed in
        and carries forward; the red cell is the revision where it changed. Original is
        the baseline.
      </p>
      <QuotationRevisionTimeline entries={revisions} employees={employees} />
    </section>
  );
}
