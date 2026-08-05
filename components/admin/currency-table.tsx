"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Coins, Plus, ShieldCheck } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  repairBaseCurrency,
  setCurrencyActive,
  updateCurrency,
} from "@/app/(admin)/admin/currency/actions";
import type { CurrencyMasterView, CurrencyRow } from "@/lib/queries/currency";
import { RATE_STALE_DAYS } from "@/lib/validators/currency";
import { CurrencyFormDialog } from "./currency-form-dialog";
import {
  CurrencyChip,
  CurrencyConfirmDialog,
  CurrencyGhostButton,
  CurrencyPrimaryButton,
  CurrencySection,
} from "./currency-primitives";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  view: CurrencyMasterView;
}

function formatRateUpdated(d: Date | null): string {
  if (!d) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function CurrencyTable({ view }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CurrencyRow | null>(null);
  const [toggling, setToggling] = useState<CurrencyRow | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglePending, startToggle] = useTransition();

  function confirmToggle() {
    const row = toggling;
    if (!row) return;
    setToggleError(null);
    startToggle(async () => {
      const res = await setCurrencyActive(row.id, !row.isActive);
      if (!res.ok) {
        setToggleError(res.error);
        return;
      }
      fireToast({
        message: row.isActive
          ? `${row.code} deactivated.`
          : `${row.code} reactivated.`,
      });
      setToggling(null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {!view.baseHealthy && <BaseCurrencyBanner view={view} />}

      <CurrencySection
        title="Currency master"
        icon={<Coins size={13} strokeWidth={2.4} />}
        action={
          <CurrencyPrimaryButton type="button" onClick={() => setCreateOpen(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Plus size={14} strokeWidth={2.6} />
              Add currency
            </span>
          </CurrencyPrimaryButton>
        }
      >
        <p className="mb-4 text-[13.5px] text-ink-subtle" style={{ lineHeight: 1.6 }}>
          Rates are maintained by hand — nothing is fetched from an FX feed. One
          unit of the currency is worth the rate shown in {view.settingsBaseCode}.
          A rate untouched for {RATE_STALE_DAYS} days is flagged for review.
        </p>

        {view.rows.length === 0 ? (
          <EmptyMaster onAdd={() => setCreateOpen(true)} />
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-[14.5px] min-w-[860px]">
              <caption className="sr-only">
                Currency master with exchange rate to {view.settingsBaseCode} and
                usage across enquiries and clients
              </caption>
              <thead>
                <tr
                  className="text-left text-[11.5px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <th scope="col" className="px-3 py-3">Code</th>
                  <th scope="col" className="px-3 py-3">Name</th>
                  <th scope="col" className="px-3 py-3">Symbol</th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Rate ({view.settingsBaseCode} / unit)
                  </th>
                  <th scope="col" className="px-3 py-3">Rate updated</th>
                  <th scope="col" className="px-3 py-3 text-right">Used by</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r, i) => (
                  <CurrencyTableRow
                    key={r.id}
                    row={r}
                    rowIndex={i}
                    onEdit={() => setEditing(r)}
                    onToggle={() => {
                      setToggleError(null);
                      setToggling(r);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CurrencySection>

      {view.unmapped.length > 0 && <UnmappedPanel view={view} />}

      {/* Mounted only while open so each visit starts from a clean form. */}
      {createOpen && (
        <CurrencyFormDialog
          mode="create"
          open
          onOpenChange={setCreateOpen}
          baseCode={view.settingsBaseCode}
        />
      )}
      {editing !== null && (
        <CurrencyFormDialog
          mode="edit"
          open
          row={editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          baseCode={view.settingsBaseCode}
        />
      )}

      <CurrencyConfirmDialog
        open={toggling !== null}
        onOpenChange={(o) => {
          if (!o) {
            setToggling(null);
            setToggleError(null);
          }
        }}
        title={
          toggling?.isActive
            ? `Deactivate ${toggling.code}?`
            : `Reactivate ${toggling?.code ?? ""}?`
        }
        description={
          toggling?.isActive
            ? "It stops appearing in currency pickers. Records that already carry this code keep it — currencies are deactivated, never deleted."
            : "It becomes selectable again wherever a currency is picked."
        }
        confirmLabel={toggling?.isActive ? "Deactivate" : "Reactivate"}
        destructive={toggling?.isActive ?? false}
        pending={togglePending}
        error={toggleError}
        onConfirm={confirmToggle}
      />
    </div>
  );
}

function CurrencyTableRow({
  row,
  rowIndex,
  onEdit,
  onToggle,
}: {
  row: CurrencyRow;
  rowIndex: number;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const [rate, setRate] = useState(row.exchangeRateRaw);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = rate.trim() !== row.exchangeRateRaw.trim();
  const rateInputId = `currency-rate-${row.id}`;

  function saveRate(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setError(null);
    startTransition(async () => {
      const res = await updateCurrency(row.id, { exchangeRateToInr: rate.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${row.code} rate updated.` });
    });
  }

  return (
    <tr
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{
        background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
        opacity: row.isActive ? 1 : 0.62,
      }}
    >
      <td className="px-3 py-3 font-semibold text-ink-strong tabular-nums">
        <span className="inline-flex items-center gap-2">
          {row.code}
          {row.isBase && <CurrencyChip tone="blue" dot={false}>Base</CurrencyChip>}
        </span>
      </td>
      <td className="px-3 py-3 text-ink-soft">{row.name}</td>
      <td className="px-3 py-3 text-ink-soft">{row.symbol || "—"}</td>
      <td className="px-3 py-3 text-right">
        {row.isBase ? (
          <span className="tabular-nums text-ink-soft" title="The base currency is the unit of the ledger">
            1.00
          </span>
        ) : (
          <form onSubmit={saveRate} className="flex items-center justify-end gap-1.5">
            <label htmlFor={rateInputId} className="sr-only">
              Exchange rate for {row.code}
            </label>
            <input
              id={rateInputId}
              inputMode="decimal"
              value={rate}
              disabled={pending}
              onChange={(e) => setRate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setRate(row.exchangeRateRaw);
                  setError(null);
                }
              }}
              className="w-28 rounded-md border px-2.5 py-1.5 text-[14px] text-right tabular-nums bg-white focus:outline-none disabled:opacity-60"
              style={{
                borderColor: dirty
                  ? "var(--color-brand)"
                  : "var(--color-hairline-strong)",
              }}
            />
            <CurrencyGhostButton
              type="submit"
              disabled={!dirty || pending}
              style={{ visibility: dirty ? "visible" : "hidden" }}
            >
              {pending ? "Saving" : "Save"}
            </CurrencyGhostButton>
          </form>
        )}
        {error && (
          <div className="mt-1.5 flex justify-end">
            <AdminInlineError>{error}</AdminInlineError>
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-ink-soft tabular-nums whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          {row.isBase ? "—" : formatRateUpdated(row.rateUpdatedAt)}
          {row.isRateStale && (
            <CurrencyChip tone="amber" dot={false}>Review</CurrencyChip>
          )}
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
        {row.usage.total === 0 ? (
          <span className="text-ink-subtle">0</span>
        ) : (
          <span
            title={`${row.usage.inquiries} enquiries · ${row.usage.clients} clients${
              row.matchedAliases.length > 0
                ? ` (includes legacy spelling ${row.matchedAliases.join(", ")})`
                : ""
            }`}
          >
            {row.usage.total}
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        {row.isActive ? (
          <CurrencyChip tone="green">Active</CurrencyChip>
        ) : (
          <CurrencyChip tone="neutral">Inactive</CurrencyChip>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <CurrencyGhostButton type="button" onClick={onEdit}>
            Edit
          </CurrencyGhostButton>
          <CurrencyGhostButton
            type="button"
            onClick={onToggle}
            disabled={row.isBase || (row.isActive && row.usage.total > 0)}
            title={
              row.isBase
                ? "The base currency must stay active"
                : row.isActive && row.usage.total > 0
                  ? `${row.code} is referenced by ${row.usage.total} record(s)`
                  : undefined
            }
          >
            {row.isActive ? "Deactivate" : "Reactivate"}
          </CurrencyGhostButton>
        </div>
      </td>
    </tr>
  );
}

function EmptyMaster({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-section border border-hairline-strong bg-surface-soft px-6 py-12 text-center">
      <p
        className="font-serif text-ink-strong"
        style={{ fontStyle: "italic", fontSize: 21, letterSpacing: "-0.015em" }}
      >
        No currencies defined
      </p>
      <p
        className="mx-auto mt-2 max-w-md text-[14px] text-ink-subtle"
        style={{ lineHeight: 1.55 }}
      >
        A fresh install seeds INR plus the export currencies Carbide quotes in.
        If this list is empty the default seed has not run yet — add them by hand
        below, or run the seed and reload.
      </p>
      <div className="mt-4">
        <CurrencyPrimaryButton type="button" onClick={onAdd}>
          Add the first currency
        </CurrencyPrimaryButton>
      </div>
    </div>
  );
}

/**
 * Shown whenever the base flag is missing, duplicated, inactive, or disagrees
 * with `org_settings.base_currency_code` — the invariant has no DB constraint,
 * so the admin gets a one-click repair instead of a silent wrong total.
 */
function BaseCurrencyBanner({ view }: { view: CurrencyMasterView }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await repairBaseCurrency();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Base currency repaired." });
      setOpen(false);
    });
  }

  const detail =
    view.baseCode === null
      ? "No single currency row is flagged as the base."
      : view.baseCode !== view.settingsBaseCode
        ? `The master says ${view.baseCode} but organisation settings say ${view.settingsBaseCode}.`
        : `${view.baseCode} is flagged as base but is not active.`;

  return (
    <>
      <div
        role="status"
        className="flex items-start gap-3 rounded-section border p-4"
        style={{ borderColor: "#FECACA", background: "#FEF2F2" }}
      >
        <AlertTriangle
          size={18}
          strokeWidth={2.2}
          style={{ color: "#B71C1C", marginTop: 1, flexShrink: 0 }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold" style={{ color: "#B71C1C" }}>
            Base currency needs attention
          </p>
          <p className="mt-1 text-[13.5px]" style={{ color: "#7F1D1D", lineHeight: 1.55 }}>
            {detail} Every stored amount is in INR, so the base row must be INR,
            active, and agree with organisation settings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-md px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: "#D32F2F" }}
        >
          Repair
        </button>
      </div>

      <CurrencyConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title="Repair the base currency?"
        description="INR is flagged as the one and only base currency, its rate is pinned to 1, it is reactivated if needed, and organisation settings are set to INR. No amounts are converted."
        confirmLabel="Repair base currency"
        pending={pending}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}

/**
 * Codes written on enquiries or clients that have no master row — usually a
 * legacy free-text value. Read-only: the fix is to add the row above or correct
 * the records, never to silently rewrite business data from here.
 */
function UnmappedPanel({ view }: { view: CurrencyMasterView }) {
  return (
    <CurrencySection
      title="Unmapped codes in live data"
      icon={<ShieldCheck size={13} strokeWidth={2.4} />}
    >
      <p className="mb-4 text-[13.5px] text-ink-subtle" style={{ lineHeight: 1.6 }}>
        These currency codes appear on enquiries or clients but have no row in
        the master, so no exchange rate exists for them. Add the matching
        currency above, or correct the records.
      </p>
      <ul className="flex flex-wrap gap-2">
        {view.unmapped.map((u) => (
          <li key={u.code}>
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]"
              style={{
                borderColor: "var(--color-hairline-strong)",
                background: "var(--color-surface-soft)",
              }}
            >
              <span className="font-semibold text-ink-strong">{u.code}</span>
              <span className="tabular-nums text-ink-subtle">
                {u.usage.inquiries} enq · {u.usage.clients} clients
              </span>
            </span>
          </li>
        ))}
      </ul>
    </CurrencySection>
  );
}
