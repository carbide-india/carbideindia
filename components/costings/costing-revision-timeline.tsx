import { COSTING_ROUTE_LABELS } from "@/db/enums";
import type { CostingVarianceEntry } from "@/lib/queries/costings";
import { formatInr, formatDateTime } from "@/lib/format";

/**
 * CUMULATIVE costing-revision comparison TABLE — the costing analogue of
 * `QuotationRevisionTimeline`, with the SAME layout and functionality:
 *
 *   Parameter | C02 | C01-R1 | C01 (base)
 *
 * Columns run newest → oldest, the first version (base) last. Each parameter
 * row appears only if that field changed across the chain; a field's value
 * shows from the version it FIRST changed in and carries forward, and the cell
 * is highlighted only in the version where it actually changed. The base column
 * always shows the starting value. A Reason row closes the table.
 */

interface Fields {
  route: string | null;
  finalCost: string | null;
  paymentTerms: string | null;
}

const FIELD_DEFS: { key: keyof Fields; label: string; money?: boolean }[] = [
  { key: "route", label: "Route" },
  { key: "finalCost", label: "Final Cost / pc", money: true },
  { key: "paymentTerms", label: "Payment Terms" },
];

function fieldsOf(e: CostingVarianceEntry): Fields {
  return {
    route: COSTING_ROUTE_LABELS[e.costingType] ?? e.costingType,
    finalCost: e.finalCostPerPiece,
    paymentTerms: e.paymentTerms,
  };
}

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
 * @param entries oldest → newest (base first), as the chain query returns them.
 * @param visibleIds when given, only these versions render as columns (the
 *   change highlighting is still computed over the FULL chain).
 */
export function CostingRevisionTimeline({
  entries,
  visibleIds,
}: {
  entries: CostingVarianceEntry[];
  visibleIds?: string[];
}) {
  const n = entries.length;
  if (n === 0) return null;

  const fieldsByIndex = entries.map(fieldsOf);

  // Index (1..n-1) at which each field FIRST changed vs. its prior value.
  const firstChange: Partial<Record<keyof Fields, number>> = {};
  for (const f of FIELD_DEFS) {
    for (let i = 1; i < n; i++) {
      if (norm(fieldsByIndex[i]![f.key]) !== norm(fieldsByIndex[i - 1]![f.key])) {
        firstChange[f.key] = i;
        break;
      }
    }
  }
  const rows = FIELD_DEFS.filter((f) => firstChange[f.key] !== undefined).sort(
    (a, b) => (firstChange[b.key] as number) - (firstChange[a.key] as number),
  );

  // Columns newest → oldest, base (index 0) last.
  let cols: number[] = [];
  for (let k = n - 1; k >= 1; k--) cols.push(k);
  cols.push(0);
  if (visibleIds) cols = cols.filter((k) => visibleIds.includes(entries[k]!.id));

  if (cols.length === 0) {
    return (
      <p className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-[12.5px] text-ink-subtle">
        Pick at least one version to compare.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-[12.5px] text-ink-subtle">
        No route / cost / payment-terms fields changed across these versions
        (reason-only re-costings).
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
              const isBase = k === 0;
              const color = isBase ? "#16a34a" : "#d03232";
              return (
                <th key={e.id} className="min-w-[132px] px-4 py-2.5 align-top">
                  <div className="text-[11.5px] font-black" style={{ color }}>
                    {e.code}
                    {e.isLatestRevision && !isBase ? " · Current" : ""}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {e.isChosen && (
                      <span className="rounded-[3px] bg-brand/12 px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.04em] text-brand">
                        Chosen
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium text-ink-subtle">
                    {formatDateTime(e.createdAt)}
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
                  const isBase = k === 0;
                  if (!isBase && fc > k) {
                    return (
                      <td key={e.id} className="px-4 py-2 text-[12.5px]" style={{ color: "#c4c2bd" }}>
                        —
                      </td>
                    );
                  }
                  const changed = !isBase && fc === k;
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
                        {fmt(fieldsByIndex[k]![f.key], f.money)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Reason row — why each re-costing was opened. */}
          <tr className="border-t border-hairline bg-surface-soft/50">
            <td className="sticky left-0 z-10 bg-surface-soft px-4 py-2 text-[12.5px] font-bold text-ink-strong">
              Reason
            </td>
            {cols.map((k) => {
              const e = entries[k]!;
              const isBase = k === 0;
              const sentBack = e.revisedFromQuotationId
                ? "From Quotation"
                : e.revisedFromNegotiationId
                  ? "From Negotiation"
                  : null;
              return (
                <td key={e.id} className="px-4 py-2 text-[12px] text-ink-muted">
                  {isBase ? "—" : e.revisionReason || sentBack || "—"}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
