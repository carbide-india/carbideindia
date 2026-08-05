import Link from "next/link";
import type { Route } from "next";
import { BadgeCheck, ExternalLink, ShieldAlert } from "lucide-react";
import { SELLER_STATE } from "@/db/enums";
import { parseGstin } from "@/lib/data/gst";

interface Props {
  legalName: string | null;
  gstin: string | null;
  panNo: string | null;
  regState: string | null;
  regCity: string | null;
}

/**
 * Read-only view of the company's own GST identity.  The editor lives in
 * Organisation settings → Company & Legal (a single source of truth for the
 * legal entity); this page only reads it, validates the GSTIN and points out
 * the two mismatches that break invoicing: a GSTIN whose embedded state code
 * disagrees with the registered state, and a registered state that is not the
 * seller state the GST engine pivots on.
 */
export function TaxGstProfile({ legalName, gstin, panNo, regState, regCity }: Props) {
  const parsed = gstin ? parseGstin(gstin) : null;
  const gstinValid = parsed?.valid === true;
  const derivedPan = parsed?.pan ?? null;

  const problems: string[] = [];
  if (!gstin?.trim()) {
    problems.push(
      "No company GSTIN is on record — invoices cannot legally be raised without one.",
    );
  } else if (!gstinValid) {
    problems.push(
      `The stored GSTIN is not a valid 15-character number${parsed?.error ? ` (${parsed.error})` : ""}.`,
    );
  }
  if (gstinValid && parsed?.stateName && regState?.trim()) {
    if (parsed.stateName.toLowerCase() !== regState.trim().toLowerCase()) {
      problems.push(
        `The GSTIN is registered in ${parsed.stateName} but the registered address says ${regState}.`,
      );
    }
  }
  if (regState?.trim() && regState.trim().toLowerCase() !== SELLER_STATE.toLowerCase()) {
    problems.push(
      `The GST engine pivots intra- vs inter-state on ${SELLER_STATE}; the registered state is ${regState}.`,
    );
  }
  if (gstinValid && derivedPan && panNo?.trim() && derivedPan !== panNo.trim().toUpperCase()) {
    problems.push(
      `The PAN inside the GSTIN (${derivedPan}) does not match the stored PAN (${panNo}).`,
    );
  }

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Legal entity", value: legalName?.trim() || "Not set" },
    { label: "GSTIN", value: gstin?.trim() || "Not set", mono: true },
    { label: "PAN", value: panNo?.trim() || derivedPan || "Not set", mono: true },
    {
      label: "Registered state",
      value: [regCity?.trim(), regState?.trim()].filter(Boolean).join(", ") || "Not set",
    },
    { label: "Seller state (GST pivot)", value: SELLER_STATE },
  ];

  return (
    <section className="rounded-2xl border border-[#e6e8ec] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid size-9 place-items-center rounded-lg"
            style={
              gstinValid
                ? { background: "#e8f5e9", color: "#2e7d32" }
                : { background: "#fdecec", color: "#d32f2f" }
            }
          >
            {gstinValid ? (
              <BadgeCheck className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 className="text-[15px] font-extrabold text-[#1e2f66]">
              Company GST identity
            </h2>
            <p className="text-[12.5px] text-[#6b7280]">
              {gstinValid
                ? `Valid GSTIN · registered in ${parsed?.stateName ?? SELLER_STATE}`
                : "Edited in Organisation settings — this page only reads it."}
            </p>
          </div>
        </div>
        <Link
          href={"/admin/settings?tab=legal" as Route}
          className="inline-flex h-[36px] items-center gap-1.5 rounded-lg border border-[#dfe1e6] px-3.5 text-[12.5px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eef1fb]"
        >
          Edit in Company &amp; Legal
          <ExternalLink size={13} strokeWidth={2.4} aria-hidden="true" />
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 max-md:grid-cols-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-4 border-b border-dashed border-[#eceef2] pb-2.5 last:border-b-0"
          >
            <dt className="text-[12.5px] font-bold text-[#6b7280]">{r.label}</dt>
            <dd
              className={`text-right text-[13.5px] font-semibold text-[#1f2430] ${r.mono ? "tabular-nums" : ""}`}
              style={r.mono ? { fontFamily: "var(--font-mono-display)" } : undefined}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {problems.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 rounded-lg border border-[#f5c2c2] bg-[#fef2f2] p-3.5">
          {problems.map((p) => (
            <li key={p} className="text-[12.5px] font-semibold leading-relaxed text-[#d32f2f]">
              {p}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
