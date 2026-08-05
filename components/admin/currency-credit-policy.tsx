"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Info, Wallet } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  backfillClientCreditDefaults,
  updateCreditPolicy,
} from "@/app/(admin)/admin/currency/actions";
import type { CreditDefaultsGap, CreditPolicy } from "@/lib/queries/currency";
import { formatInr } from "@/lib/format";
import {
  CurrencyConfirmDialog,
  CurrencyField,
  CurrencyInput,
  CurrencyPrimaryButton,
  CurrencySection,
} from "./currency-primitives";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  policy: CreditPolicy;
  gap: CreditDefaultsGap;
}

type BackfillKey = "creditDays" | "creditLimit" | "paymentTerms";

const BACKFILL_LABEL: Record<BackfillKey, string> = {
  creditDays: "Credit days",
  creditLimit: "Credit limit",
  paymentTerms: "Payment terms",
};

/**
 * Org-wide credit defaults. These pre-fill a new client; `clients.credit_days`
 * / `credit_limit` / `payment_terms` stay the per-client override and always
 * win. The backfill only ever fills blanks, never overwrites an override.
 */
export function CurrencyCreditPolicy({ policy, gap }: Props) {
  const [days, setDays] = useState(String(policy.defaultCreditDays));
  const [limit, setLimit] = useState(policy.defaultCreditLimitRaw ?? "");
  const [terms, setTerms] = useState(policy.defaultPaymentTerms ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 365) {
      setError("Credit days must be a whole number between 0 and 365.");
      return;
    }
    const trimmedLimit = limit.trim();
    if (trimmedLimit !== "" && !(Number.isFinite(Number(trimmedLimit)) && Number(trimmedLimit) >= 0)) {
      setError("Credit limit must be a non-negative amount, or blank for none.");
      return;
    }

    startTransition(async () => {
      const res = await updateCreditPolicy({
        defaultCreditDays: parsedDays,
        defaultCreditLimit: trimmedLimit === "" ? null : trimmedLimit,
        defaultPaymentTerms: terms.trim() === "" ? null : terms.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Credit policy saved." });
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6 max-lg:grid-cols-1">
      <div className="flex flex-col gap-6 min-w-0">
        <CurrencySection
          title="Default credit terms"
          icon={<CalendarClock size={13} strokeWidth={2.4} />}
        >
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <CurrencyField
                label="Credit days"
                htmlFor="credit-default-days"
                hint="Days after the invoice date before an unpaid invoice counts as past terms."
              >
                <CurrencyInput
                  id="credit-default-days"
                  type="number"
                  min={0}
                  max={365}
                  required
                  disabled={pending}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="tabular-nums"
                />
              </CurrencyField>
              <CurrencyField
                label={`Credit limit (${policy.baseCurrencyCode})`}
                htmlFor="credit-default-limit"
                hint="Blank means no org-wide limit — only clients with their own limit are checked."
              >
                <CurrencyInput
                  id="credit-default-limit"
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={pending}
                  value={limit}
                  placeholder="No limit"
                  onChange={(e) => setLimit(e.target.value)}
                  className="tabular-nums"
                />
              </CurrencyField>
            </div>

            <CurrencyField
              label="Default payment terms"
              htmlFor="credit-default-terms"
              hint="Free text copied onto quotations and sales orders, e.g. “30 days from invoice date”."
            >
              <CurrencyInput
                id="credit-default-terms"
                maxLength={200}
                autoComplete="off"
                disabled={pending}
                value={terms}
                placeholder="Not set"
                onChange={(e) => setTerms(e.target.value)}
              />
            </CurrencyField>

            {error && <AdminInlineError>{error}</AdminInlineError>}

            <div className="flex items-center gap-3 pt-1">
              <CurrencyPrimaryButton type="submit" disabled={pending}>
                {pending ? "Saving" : "Save credit policy"}
              </CurrencyPrimaryButton>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setDays(String(policy.defaultCreditDays));
                  setLimit(policy.defaultCreditLimitRaw ?? "");
                  setTerms(policy.defaultPaymentTerms ?? "");
                  setError(null);
                }}
                className="text-[13px] font-semibold text-brand hover:underline underline-offset-2 disabled:opacity-50"
              >
                Reset to saved values
              </button>
            </div>
          </form>
        </CurrencySection>

        <BackfillPanel policy={policy} gap={gap} />
      </div>

      <aside className="max-lg:order-first">
        <div className="lg:sticky lg:top-10 flex flex-col gap-4">
          <section
            className="rounded-section border border-hairline bg-surface-card p-5"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold">
              <Info size={13} strokeWidth={2.4} />
              How this is used
            </div>
            <h3
              className="mt-2 text-ink-strong"
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 20,
                letterSpacing: "-0.015em",
              }}
            >
              Defaults, not rules
            </h3>
            <p className="mt-2 text-[14px] text-ink-soft" style={{ lineHeight: 1.6 }}>
              A client with its own credit days or limit always wins. These
              values fill the blanks: they pre-fill a new client record and they
              are the fallback the exposure view uses when a client has nothing
              of its own.
            </p>
          </section>

          <section
            className="rounded-section border border-hairline bg-surface-card p-5"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <div className="text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold">
              Client coverage
            </div>
            <dl className="mt-3 space-y-2 text-[14px]">
              <CoverageRow
                label="Active clients"
                value={gap.activeClients}
                total={gap.activeClients}
              />
              <CoverageRow
                label="Without credit days"
                value={gap.missingCreditDays}
                total={gap.activeClients}
              />
              <CoverageRow
                label="Without credit limit"
                value={gap.missingCreditLimit}
                total={gap.activeClients}
              />
              <CoverageRow
                label="Without payment terms"
                value={gap.missingPaymentTerms}
                total={gap.activeClients}
              />
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}

function CoverageRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums font-semibold text-ink-strong">
        {value}
        {total > 0 && value !== total && (
          <span className="ml-1 text-[12px] font-normal text-ink-subtle">
            of {total}
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * One-shot fill of blank client credit fields from the org defaults. Explicit
 * per-field opt-in plus a confirm step, because it writes to every matching
 * client row in one go.
 */
function BackfillPanel({ policy, gap }: Props) {
  const [selected, setSelected] = useState<Record<BackfillKey, boolean>>({
    creditDays: false,
    creditLimit: false,
    paymentTerms: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const available: Record<BackfillKey, { count: number; blocked: string | null }> = {
    creditDays: { count: gap.missingCreditDays, blocked: null },
    creditLimit: {
      count: gap.missingCreditLimit,
      blocked:
        policy.defaultCreditLimitRaw === null
          ? "Set a default credit limit first"
          : null,
    },
    paymentTerms: {
      count: gap.missingPaymentTerms,
      blocked: policy.defaultPaymentTerms ? null : "Set default payment terms first",
    },
  };

  const chosen = (Object.keys(selected) as BackfillKey[]).filter((k) => selected[k]);
  const affected = chosen.reduce((sum, k) => sum + available[k].count, 0);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await backfillClientCreditDefaults(selected);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: `Backfilled ${res.creditDays} credit days, ${res.creditLimit} limits, ${res.paymentTerms} payment terms.`,
      });
      setConfirmOpen(false);
      setSelected({ creditDays: false, creditLimit: false, paymentTerms: false });
    });
  }

  const nothingToDo =
    gap.missingCreditDays === 0 &&
    gap.missingCreditLimit === 0 &&
    gap.missingPaymentTerms === 0;

  return (
    <CurrencySection
      title="Apply defaults to existing clients"
      icon={<Wallet size={13} strokeWidth={2.4} />}
    >
      <p className="mb-4 text-[13.5px] text-ink-subtle" style={{ lineHeight: 1.6 }}>
        Fills only the blanks on active clients. A client that already has its
        own value keeps it — this can be re-run safely.
      </p>

      {gap.activeClients === 0 ? (
        <p className="text-[14px] text-ink-subtle">
          There are no active clients yet, so there is nothing to backfill.
        </p>
      ) : nothingToDo ? (
        <p className="text-[14px] text-ink-soft">
          Every active client already has credit days, a credit limit and payment
          terms. Nothing to fill.
        </p>
      ) : (
        <>
          <fieldset className="space-y-2.5">
            <legend className="sr-only">Fields to backfill</legend>
            {(Object.keys(BACKFILL_LABEL) as BackfillKey[]).map((key) => {
              const info = available[key];
              const disabled = info.count === 0 || info.blocked !== null;
              return (
                <label
                  key={key}
                  className="flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-[14px] cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55"
                  style={{ borderColor: "var(--color-hairline-strong)" }}
                >
                  <input
                    type="checkbox"
                    disabled={disabled || pending}
                    checked={selected[key]}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                  <span className="font-medium text-ink-strong">
                    {BACKFILL_LABEL[key]}
                  </span>
                  <span className="ml-auto tabular-nums text-[13px] text-ink-subtle">
                    {info.blocked ?? `${info.count} blank`}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {error && <AdminInlineError className="mt-4">{error}</AdminInlineError>}

          <div className="mt-4">
            <CurrencyPrimaryButton
              type="button"
              disabled={chosen.length === 0 || pending}
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              Backfill {affected > 0 ? `${affected} field${affected === 1 ? "" : "s"}` : "selected"}
            </CurrencyPrimaryButton>
          </div>
        </>
      )}

      <CurrencyConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setError(null);
        }}
        title="Apply credit defaults?"
        description={
          <>
            {affected} blank field{affected === 1 ? "" : "s"} across active
            clients will be set to the org defaults
            {" — "}
            {chosen
              .map((k) =>
                k === "creditDays"
                  ? `${policy.defaultCreditDays} days`
                  : k === "creditLimit"
                    ? policy.defaultCreditLimit !== null
                      ? formatInr(policy.defaultCreditLimit)
                      : "no limit"
                    : (policy.defaultPaymentTerms ?? "no terms"),
              )
              .join(", ")}
            . Existing per-client values are not touched. This cannot be undone
            in bulk.
          </>
        }
        confirmLabel="Apply defaults"
        pending={pending}
        error={error}
        onConfirm={run}
      />
    </CurrencySection>
  );
}
