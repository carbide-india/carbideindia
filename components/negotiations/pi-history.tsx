"use client";

import * as React from "react";
import { FileText } from "lucide-react";
import type { ProformaInvoiceWithItems } from "@/lib/queries/proforma-invoices";
import { formatDate, formatInr } from "@/lib/format";
import { SectionCard } from "@/components/inquiries/form-field";

function money(value: string | null): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "—";
}

/**
 * Proforma Invoice iteration history — every PI issued against this negotiation,
 * newest iteration first: PI No, iteration (Rev), issued date, revised total,
 * and a "View PDF" link that opens the generated PI inline.
 */
export function PiHistory({ invoices }: { invoices: ProformaInvoiceWithItems[] }) {
  return (
    <SectionCard
      title="Proforma Invoices"
      hint={
        invoices.length === 0
          ? "No proforma invoice issued yet — use Issue Proforma Invoice (PI) above."
          : "Each revision is numbered SM-PI##; the newest is the live PI."
      }
    >
      {invoices.length === 0 ? (
        <p className="text-[13.5px] text-ink-muted">No proforma invoices issued yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.10em] text-ink-subtle">
                <th className="pb-2 pr-4 font-bold">PI No</th>
                <th className="pb-2 pr-4 font-bold">Rev</th>
                <th className="pb-2 pr-4 font-bold">Issued</th>
                <th className="pb-2 pr-4 text-right font-bold">Revised Total</th>
                <th className="pb-2 text-right font-bold">PDF</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((pi) => (
                <tr key={pi.id} className="border-t border-hairline">
                  <td className="py-2.5 pr-4 font-mono font-semibold text-ink-strong">
                    {pi.piNo ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-ink-muted">{pi.iteration}</td>
                  <td className="py-2.5 pr-4 text-ink-muted">
                    {pi.issuedAt ? formatDate(pi.issuedAt) : "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-semibold text-ink-strong">
                    {money(pi.revisedTotal)}
                  </td>
                  <td className="py-2.5 text-right">
                    <a
                      href={`/proforma-invoices/${pi.id}/pi.pdf?view=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold text-brand hover:bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)]"
                    >
                      <FileText size={14} strokeWidth={2.2} />
                      View PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
