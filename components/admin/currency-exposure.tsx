"use client";

import { Gauge } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { CreditExposure, CreditPolicy } from "@/lib/queries/currency";
import { CurrencyChip, CurrencySection } from "./currency-primitives";

interface Props {
  exposure: CreditExposure;
  policy: CreditPolicy;
}

/**
 * Read-only credit exposure, derived on every render from issued invoices —
 * nothing here is stored and nothing here is editable. Outstanding is
 * `grand_total - amount_paid` on issued / part-paid invoices; past terms is
 * `invoice_date + credit days < today`, where credit days is the client's own
 * value falling back to the org default.
 */
export function CurrencyExposure({ exposure, policy }: Props) {
  return (
    <CurrencySection
      title="Credit exposure"
      icon={<Gauge size={13} strokeWidth={2.4} />}
      action={
        <span className="text-[13px] tabular-nums text-ink-subtle">
          {formatInr(exposure.totalOutstanding)} outstanding ·{" "}
          {formatInr(exposure.totalOverdue)} past terms
        </span>
      }
    >
      <p className="mb-4 text-[13.5px] text-ink-subtle" style={{ lineHeight: 1.6 }}>
        Derived live from issued invoices. Credit days fall back to the org
        default of {policy.defaultCreditDays}{" "}
        {policy.defaultCreditDays === 1 ? "day" : "days"}; the credit limit falls
        back to{" "}
        {policy.defaultCreditLimit === null
          ? "no org-wide limit"
          : formatInr(policy.defaultCreditLimit)}
        . Values marked <em>default</em> come from that fallback rather than the
        client record.
      </p>

      {!exposure.hasInvoiceData ? (
        <EmptyState
          title="No invoices issued yet"
          body="Credit exposure appears here once the first invoice is issued. Until then there is nothing to measure the credit policy against."
        />
      ) : exposure.rows.length === 0 ? (
        <EmptyState
          title="Nothing outstanding"
          body="Every issued invoice is fully settled, so no client is carrying a balance against their credit limit."
        />
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-[14.5px] min-w-[900px]">
            <caption className="sr-only">
              Clients with an outstanding balance on issued invoices
            </caption>
            <thead>
              <tr
                className="text-left text-[11.5px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
                style={{ background: "var(--color-surface-soft)" }}
              >
                <th scope="col" className="px-3 py-3">Client</th>
                <th scope="col" className="px-3 py-3 text-right">Open</th>
                <th scope="col" className="px-3 py-3 text-right">Outstanding</th>
                <th scope="col" className="px-3 py-3 text-right">Credit limit</th>
                <th scope="col" className="px-3 py-3 text-right">Over by</th>
                <th scope="col" className="px-3 py-3 text-right">Terms</th>
                <th scope="col" className="px-3 py-3 text-right">Past terms</th>
                <th scope="col" className="px-3 py-3">Flags</th>
              </tr>
            </thead>
            <tbody>
              {exposure.rows.map((r, i) => (
                <tr
                  key={r.clientId}
                  className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
                  style={{
                    background: i % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
                  }}
                >
                  <td className="px-3 py-3">
                    <div className="font-medium text-ink-strong">{r.clientName}</div>
                    <div className="text-[12.5px] tabular-nums text-ink-subtle">
                      {r.clientCode ?? "no code"}
                      {r.currency && r.currency !== policy.baseCurrencyCode
                        ? ` · quotes in ${r.currency}`
                        : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                    {r.openInvoices}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink-strong">
                    {formatInr(r.outstanding)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                    {r.effectiveCreditLimit === null ? (
                      <span className="text-ink-subtle">None</span>
                    ) : (
                      <>
                        {formatInr(r.effectiveCreditLimit)}
                        {!r.creditLimitFromClient && (
                          <span className="ml-1 text-[12px] text-ink-subtle">default</span>
                        )}
                      </>
                    )}
                  </td>
                  <td
                    className="px-3 py-3 text-right tabular-nums font-semibold"
                    style={{ color: r.isOverLimit ? "var(--color-red-deep)" : undefined }}
                  >
                    {r.isOverLimit ? formatInr(r.overLimitBy) : <span className="text-ink-subtle font-normal">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-soft whitespace-nowrap">
                    {r.effectiveCreditDays}d
                    {!r.creditDaysFromClient && (
                      <span className="ml-1 text-[12px] text-ink-subtle">default</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {r.isPastTerms ? (
                      <span style={{ color: "var(--color-amber-deep)" }} className="font-semibold">
                        {formatInr(r.overdueAmount)}
                        <span className="ml-1 text-[12px] font-normal">
                          {r.maxDaysPastDue}d
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {r.isOverLimit && <CurrencyChip tone="red">Over limit</CurrencyChip>}
                      {r.isPastTerms && <CurrencyChip tone="amber">Past terms</CurrencyChip>}
                      {!r.isOverLimit && !r.isPastTerms && (
                        <CurrencyChip tone="green">Within terms</CurrencyChip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CurrencySection>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-section border border-hairline-strong bg-surface-soft px-6 py-12 text-center">
      <p
        className="font-serif text-ink-strong"
        style={{ fontStyle: "italic", fontSize: 21, letterSpacing: "-0.015em" }}
      >
        {title}
      </p>
      <p
        className="mx-auto mt-2 max-w-md text-[14px] text-ink-subtle"
        style={{ lineHeight: 1.55 }}
      >
        {body}
      </p>
    </div>
  );
}
