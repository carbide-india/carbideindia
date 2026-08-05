"use client";

import * as React from "react";
import { useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { registerDetectedFamily } from "@/app/(admin)/admin/numbering/actions";
import type { NumberingFamily, NumberingOverview } from "@/lib/queries/numbering";
import { DOC_NUMBER_STRATEGIES, type DocNumberStrategy } from "@/db/enums";
import { NumberingFamilyDialog } from "@/components/admin/numbering-family-dialog";
import {
  PreviewPill,
  STRATEGY_BLURB,
  StrategyBadge,
  moduleLabel,
} from "@/components/admin/numbering-bits";

interface Props {
  overview: NumberingOverview;
}

const ALL = "all";

/** Short strategy names for the filter dropdown. */
const STRATEGY_SHORT: Record<DocNumberStrategy, string> = {
  fy_series: "FY series",
  sequence: "Sequence",
  sm_suffix: "SM suffix",
};

/**
 * The document-numbering register: every auto-generated number in the app,
 * grouped by module, each row showing the format, the live counter and the
 * number the next document will actually carry.
 *
 * Filters are URL state (nuqs) so a filtered view is linkable, and the manage
 * dialog is driven off the row id rather than a copy of the row, so a
 * router.refresh() after a save flows straight back into the open dialog.
 */
export function NumberingRegister({ overview }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [registering, startRegister] = React.useTransition();

  const [q, setQ] = useQueryState("q", { defaultValue: "" });
  const [moduleFilter, setModuleFilter] = useQueryState("module", {
    defaultValue: ALL,
  });
  const [strategyFilter, setStrategyFilter] = useQueryState("strategy", {
    defaultValue: ALL,
  });
  const [showRetired, setShowRetired] = useQueryState("retired", {
    defaultValue: false,
    parse: (v) => v === "1",
    serialize: (v) => (v ? "1" : "0"),
  });

  const modules = React.useMemo(
    () => [...new Set(overview.families.map((f) => f.module))].sort(),
    [overview.families],
  );

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return overview.families.filter((f) => {
      if (!showRetired && !f.isActive) return false;
      if (moduleFilter !== ALL && f.module !== moduleFilter) return false;
      if (strategyFilter !== ALL && f.strategy !== strategyFilter) return false;
      if (term === "") return true;
      return (
        f.label.toLowerCase().includes(term) ||
        f.seriesKey.toLowerCase().includes(term) ||
        f.nextPreview.toLowerCase().includes(term) ||
        f.prefix.toLowerCase().includes(term)
      );
    });
  }, [overview.families, q, moduleFilter, strategyFilter, showRetired]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, NumberingFamily[]>();
    for (const f of filtered) {
      const list = map.get(f.module);
      if (list) list.push(f);
      else map.set(f.module, [f]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const selected =
    overview.families.find((f) => f.id === selectedId) ?? null;

  const retiredCount = overview.families.filter((f) => !f.isActive).length;

  function addDetected(seriesKey: string, label: string) {
    startRegister(async () => {
      const res = await registerDetectedFamily({ seriesKey });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${label} added to the register.` });
      router.refresh();
    });
  }

  if (overview.families.length === 0) {
    return (
      <div
        className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
        >
          No document families registered
        </p>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
          The register is seeded by{" "}
          <span className="font-mono text-[13px]">pnpm seed:defaults</span>, which
          adds one row for every numbering scheme the app uses. Run it once and
          this page fills itself in.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="numbering-search"
            className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
          >
            Search
          </label>
          <div className="relative">
            <Search
              size={15}
              strokeWidth={2.3}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <input
              id="numbering-search"
              type="search"
              value={q}
              placeholder="Family, series key, prefix or number"
              onChange={(e) => void setQ(e.target.value)}
              className="nt-input w-full"
              style={{ paddingLeft: 34 }}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="numbering-module"
            className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
          >
            Module
          </label>
          <select
            id="numbering-module"
            value={moduleFilter}
            onChange={(e) => void setModuleFilter(e.target.value)}
            className="nt-input"
          >
            <option value={ALL}>All modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {moduleLabel(m)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="numbering-strategy"
            className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
          >
            Strategy
          </label>
          <select
            id="numbering-strategy"
            value={strategyFilter}
            onChange={(e) => void setStrategyFilter(e.target.value)}
            className="nt-input"
          >
            <option value={ALL}>All strategies</option>
            {DOC_NUMBER_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {STRATEGY_SHORT[s]}
              </option>
            ))}
          </select>
        </div>

        {retiredCount > 0 && (
          <label className="flex cursor-pointer select-none items-center gap-2 pb-2.5 text-[13px] font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={(e) => void setShowRetired(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            Show retired ({retiredCount})
          </label>
        )}
      </div>

      {/* ── Register ───────────────────────────────────────────────── */}
      {grouped.length === 0 ? (
        <div className="rounded-section border border-hairline bg-surface-card px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-ink-strong">
            No families match those filters
          </p>
          <p className="mt-1.5 text-[13.5px] text-ink-subtle">
            Clear the search or pick another module.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(([module, rows]) => (
            <section
              key={module}
              className="overflow-hidden rounded-section border border-hairline bg-surface-card"
              style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
              aria-labelledby={`numbering-module-${module}`}
            >
              <div className="flex items-center justify-between gap-3 border-b border-hairline bg-brand/[0.06] px-4 py-2.5">
                <h2
                  id={`numbering-module-${module}`}
                  className="text-[13px] font-bold tracking-[0.02em] text-ink-strong"
                >
                  {moduleLabel(module)}
                </h2>
                <span className="text-[12px] font-semibold tabular-nums text-ink-subtle">
                  {rows.length} {rows.length === 1 ? "family" : "families"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-soft text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                      <th className="px-4 py-2.5">Family</th>
                      <th className="px-4 py-2.5">Strategy</th>
                      <th className="px-4 py-2.5">Format</th>
                      <th className="px-4 py-2.5">Next number</th>
                      <th className="px-4 py-2.5 tabular-nums">Counter</th>
                      <th className="px-4 py-2.5 tabular-nums">Issued</th>
                      <th className="px-4 py-2.5 text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f, i) => (
                      <NumberingRow
                        key={f.id}
                        family={f}
                        rowIndex={i}
                        onManage={() => setSelectedId(f.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Detected but unregistered ──────────────────────────────── */}
      {overview.unregistered.length > 0 && (
        <section
          className="mt-6 rounded-section border border-hairline bg-surface-card p-5"
          aria-labelledby="numbering-detected"
        >
          <h2
            id="numbering-detected"
            className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-subtle"
          >
            Detected in code, not in the register
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            These schemes mint numbers today but have no register row, so nothing on
            this page describes them. Adding one records the format — the minting
            code is untouched.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {overview.unregistered.map((d) => (
              <li
                key={d.seriesKey}
                className="flex flex-wrap items-center justify-between gap-3 rounded-chip border border-hairline px-4 py-3"
              >
                <div>
                  <p className="text-[14px] font-semibold text-ink-strong">
                    {d.label}{" "}
                    <span className="font-mono text-[12px] font-normal text-ink-subtle">
                      {d.seriesKey}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-ink-subtle">
                    {d.source}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={registering}
                  onClick={() => addDetected(d.seriesKey, d.label)}
                  className="inline-flex items-center gap-1.5 rounded-chip border border-hairline-strong px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong disabled:opacity-50"
                >
                  {registering ? (
                    <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} />
                  ) : (
                    <Plus size={13} strokeWidth={2.6} />
                  )}
                  Add to register
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Counters with no register row ──────────────────────────── */}
      {overview.orphanCounters.length > 0 && (
        <section
          className="mt-6 rounded-section border border-hairline bg-surface-card p-5"
          aria-labelledby="numbering-orphans"
        >
          <h2
            id="numbering-orphans"
            className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-subtle"
          >
            Counters with no register entry
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            Live rows in <span className="font-mono text-[12.5px]">doc_number_series</span>{" "}
            whose series key is not in the register. They keep allocating — they are
            just undocumented here.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {overview.orphanCounters.map((c) => (
              <li
                key={`${c.seriesKey}-${c.fyLabel}`}
                className="rounded-chip border border-hairline px-3.5 py-2 text-[13px]"
              >
                <span className="font-mono font-semibold text-ink-strong">
                  {c.seriesKey}
                </span>{" "}
                <span className="text-ink-subtle tabular-nums">{c.fyLabel}</span>{" "}
                <span className="text-ink-subtle">· next</span>{" "}
                <span className="font-mono tabular-nums text-ink-strong">
                  {c.nextFormatted}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Legend ─────────────────────────────────────────────────── */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Strategy legend">
        {DOC_NUMBER_STRATEGIES.map((s) => (
          <div key={s} className="rounded-section border border-hairline bg-surface-card p-4">
            <StrategyBadge strategy={s} />
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              {STRATEGY_BLURB[s]}
            </p>
          </div>
        ))}
      </section>

      {/* Keyed + conditionally mounted: a different family gets a fresh
          component, so its fields seed from props with no re-sync effect. */}
      {selected && (
        <NumberingFamilyDialog
          key={selected.id}
          family={selected}
          currentFy={overview.currentFy}
          nextFy={overview.nextFy}
          sampleSmNumber={overview.sampleSmNumber}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

function NumberingRow({
  family,
  rowIndex,
  onManage,
}: {
  family: NumberingFamily;
  rowIndex: number;
  onManage: () => void;
}) {
  // What "counter" means differs per strategy: an FY register shows the current
  // year's issued count, a sequence its last value, an SM suffix has none.
  const currentCounter = family.counters.find((c) => c.isCurrentFy);
  const counterText =
    family.strategy === "fy_series"
      ? currentCounter
        ? `${currentCounter.lastValue} in ${currentCounter.fyLabel}`
        : family.counters.length > 0
          ? "prior years only"
          : "not opened"
      : family.strategy === "sequence"
        ? family.sequence?.exists
          ? String(family.sequence.lastValue ?? 0)
          : "missing"
        : "per SM";

  return (
    <tr
      className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink-strong">{family.label}</span>
          {!family.isActive && (
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]"
              style={{ background: "rgba(15, 23, 42, 0.06)", color: "var(--color-ink-subtle)" }}
            >
              Retired
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[11.5px] text-ink-subtle">
          {family.seriesKey}
        </div>
      </td>
      <td className="px-4 py-3">
        <StrategyBadge strategy={family.strategy} />
      </td>
      <td className="px-4 py-3 font-mono text-[12.5px] text-ink-soft">
        {family.prefix || "—"}
        <span className="text-ink-subtle"> · pad {family.padTo}</span>
      </td>
      <td className="px-4 py-3">
        <PreviewPill value={family.nextPreview} />
      </td>
      <td className="px-4 py-3 tabular-nums text-ink-soft">{counterText}</td>
      <td className="px-4 py-3 tabular-nums text-ink-soft">
        {family.issuedCount ?? "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={onManage}
          className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
        >
          Manage
        </button>
      </td>
    </tr>
  );
}
