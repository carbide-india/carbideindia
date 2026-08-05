"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, DownloadCloud, Server } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { importEnvAllowedIps } from "@/app/(admin)/admin/access-control/actions";
import { AcCard, AcGhostButton, AcMono, AcPill } from "./access-control-primitives";

interface EnvValue {
  value: string;
  /** Present in ip_allowlist_entries (any status). */
  inRegister: boolean;
  /** Parses as an address/block — a typo here silently blocks the office. */
  valid: boolean;
}

interface Props {
  envValues: EnvValue[];
  /** Comma-joined active register entries — what ALLOWED_IPS *should* say. */
  suggestedEnvValue: string;
  /** Register entries (active) missing from ALLOWED_IPS. */
  missingFromEnv: string[];
  nodeEnv: string;
  enforced: boolean;
}

/**
 * Read-only view of the fence that is actually in force, plus the two bridges
 * between it and the register: copy the value ALLOWED_IPS should hold, or pull
 * the value it already holds into the register.
 */
export function AccessControlEnvPanel({
  envValues,
  suggestedEnvValue,
  missingFromEnv,
  nodeEnv,
  enforced,
}: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const gateOn = envValues.length > 0;

  async function copySuggested() {
    if (suggestedEnvValue === "") {
      fireToast({ message: "No active register entries to copy.", type: "error" });
      return;
    }
    try {
      await navigator.clipboard.writeText(suggestedEnvValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      fireToast({
        message: "Could not copy — select the value manually.",
        type: "error",
      });
    }
  }

  function importEnv() {
    startTransition(async () => {
      const res = await importEnvAllowedIps();
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      const bits = [`${res.added} added`, `${res.skipped} already present`];
      if (res.invalid.length > 0) bits.push(`${res.invalid.length} unparseable`);
      fireToast({ message: `Imported from ALLOWED_IPS — ${bits.join(", ")}.` });
      router.refresh();
    });
  }

  return (
    <AcCard
      title="Environment gate (in force)"
      icon={<Server size={13} strokeWidth={2.4} />}
      description="middleware.ts runs on the edge and cannot read the database, so ALLOWED_IPS is the outer fence for every request. Editing it happens in Vercel, not here."
    >
      <div className="px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] max-sm:grid-cols-1">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
              ALLOWED_IPS
            </dt>
            <dd className="mt-1">
              {gateOn ? (
                <AcPill tone="green">
                  Gate on · {envValues.length} value{envValues.length === 1 ? "" : "s"}
                </AcPill>
              ) : (
                <AcPill tone={nodeEnv === "production" ? "red" : "amber"}>
                  {nodeEnv === "production"
                    ? "Unset — production fails closed"
                    : "Unset — gate disabled in dev"}
                </AcPill>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
              Register enforcement
            </dt>
            <dd className="mt-1">
              {enforced ? (
                <AcPill tone="green">On — second, server-side check</AcPill>
              ) : (
                <AcPill tone="muted">Off — register is documentation</AcPill>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            Values currently in the variable
          </div>
          {gateOn ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {envValues.map((v) => (
                <li
                  key={v.value}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline px-3 py-2"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <AcMono>{v.value}</AcMono>
                  <span className="flex items-center gap-1.5">
                    {!v.valid && <AcPill tone="red">Unparseable</AcPill>}
                    {v.inRegister ? (
                      <AcPill tone="green">In register</AcPill>
                    ) : (
                      <AcPill tone="amber">Not in register</AcPill>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="mt-2 text-[13px] text-ink-soft"
              style={{ lineHeight: 1.55 }}
            >
              {nodeEnv === "production"
                ? "No values are set. lib/ip-gate.ts fails closed in production, so every non-bypass request is denied until the variable is populated."
                : "No values are set. Outside production this disables the gate entirely, which is why local development works from any address."}
            </p>
          )}
        </div>

        {missingFromEnv.length > 0 && (
          <div
            className="mt-4 rounded-md border px-3.5 py-3 text-[13px]"
            style={{
              borderColor: "color-mix(in srgb, var(--color-amber) 35%, transparent)",
              background: "var(--color-amber-bg)",
              color: "var(--color-amber-deep)",
              lineHeight: 1.55,
            }}
          >
            <strong className="font-semibold">
              {missingFromEnv.length} active register entr
              {missingFromEnv.length === 1 ? "y is" : "ies are"} not in ALLOWED_IPS.
            </strong>{" "}
            Those addresses are documented here but the edge gate will still turn
            them away. Copy the suggested value below into the Vercel environment
            variable to close the gap.
          </div>
        )}

        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            Suggested ALLOWED_IPS (from active register entries)
          </div>
          <div
            className="mt-2 flex items-start gap-2 rounded-md border border-hairline px-3 py-2.5"
            style={{ background: "var(--color-surface-soft)" }}
          >
            <code
              className="min-w-0 flex-1 break-all text-[12.5px] text-ink-strong"
              style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace" }}
            >
              {suggestedEnvValue || "(no active entries)"}
            </code>
            <button
              type="button"
              onClick={copySuggested}
              aria-label="Copy the suggested ALLOWED_IPS value"
              className="shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-card hover:text-ink-strong"
            >
              {copied ? (
                <Check size={14} strokeWidth={2.6} />
              ) : (
                <Copy size={14} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            How the two combine, in order
          </div>
          <ol className="mt-2 flex flex-col gap-1.5 text-[12.5px] text-ink-soft">
            {[
              gateOn
                ? "Edge middleware compares the caller's address against ALLOWED_IPS. No match and no bypass email → 403 /access-denied, before auth runs."
                : nodeEnv === "production"
                  ? "Edge middleware finds ALLOWED_IPS empty and fails closed — only bypass emails get past."
                  : "Edge middleware finds ALLOWED_IPS empty; outside production that disables the gate entirely.",
              "Bypass emails skip the address check on any network — read from the unverified session claim at the edge, then verified server-side.",
              "The session cookie is verified server-side; an invalid one lands on /login regardless of address.",
              enforced
                ? "The register is armed: evaluateIpAccess() denies callers outside the active entries wherever the app calls it. A database error fails open."
                : "The register is not armed — turn enforcement on in the panel beside this one to add that second, server-side fence.",
            ].map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span
                  className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold tabular-nums"
                  style={{
                    background: "rgba(63, 63, 148, 0.08)",
                    color: "var(--color-brand-deep)",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ lineHeight: 1.5 }}>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <AcGhostButton type="button" onClick={importEnv} disabled={pending || !gateOn}>
            <span className="inline-flex items-center gap-1.5">
              <DownloadCloud size={13} strokeWidth={2.4} />
              {pending ? "Importing…" : "Import ALLOWED_IPS into the register"}
            </span>
          </AcGhostButton>
          <span className="text-[12.5px] text-ink-subtle">
            Adds anything missing. Never removes.
          </span>
        </div>
      </div>
    </AcCard>
  );
}
