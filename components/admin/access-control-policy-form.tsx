"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { TagsInput } from "@/components/ui/tags-input";
import { updateAccessPolicy } from "@/app/(admin)/admin/access-control/actions";
import { AcCard, AcPill, AcPrimaryButton } from "./access-control-primitives";

interface Props {
  initial: {
    ipAllowlistEnforced: boolean;
    ipBypassEmails: string[];
    idleTimeoutMinutes: number;
    allowSelfRegister: boolean;
  };
  /** IP_BYPASS_EMAILS from lib/ip-gate.ts — used when the DB list is empty. */
  codeFallbackEmails: string[];
  /** Active register entries; enforcement with none of them is meaningless. */
  activeEntryCount: number;
  /** Does an active entry cover the admin viewing this page? */
  callerCovered: boolean;
  callerIp: string;
  /** Lower-cased email of the admin viewing this page. */
  callerEmail: string;
  /** Is that email on the compiled-in fallback list (used when the DB list is empty)? */
  callerOnFallbackList: boolean;
}

const IDLE_MIN = 5;
const IDLE_MAX = 60;

/**
 * Session + gate policy that lives on org_settings. Every switch here is
 * reversible, but turning enforcement on is the one that can strand somebody —
 * the button stays disabled until the caller is demonstrably covered, and the
 * server repeats the check from its own view of the request.
 */
export function AccessControlPolicyForm({
  initial,
  codeFallbackEmails,
  activeEntryCount,
  callerCovered,
  callerIp,
  callerEmail,
  callerOnFallbackList,
}: Props) {
  const router = useRouter();
  const [enforced, setEnforced] = useState(initial.ipAllowlistEnforced);
  const [bypass, setBypass] = useState<string[]>(initial.ipBypassEmails);
  const [idle, setIdle] = useState(initial.idleTimeoutMinutes);
  const [selfRegister, setSelfRegister] = useState(initial.allowSelfRegister);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Mirrors the server rule exactly: the DB list wins when it has entries,
  // otherwise the compiled-in list applies.
  const callerBypassed =
    bypass.length > 0
      ? bypass.some((e) => e.trim().toLowerCase() === callerEmail)
      : callerOnFallbackList;
  const canEnforce = activeEntryCount > 0 && (callerCovered || callerBypassed);
  const idleOutOfRange = idle < IDLE_MIN || idle > IDLE_MAX;

  const dirty =
    enforced !== initial.ipAllowlistEnforced ||
    idle !== initial.idleTimeoutMinutes ||
    selfRegister !== initial.allowSelfRegister ||
    !sameList(bypass, initial.ipBypassEmails);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (idleOutOfRange) {
      setError(`Idle timeout must be between ${IDLE_MIN} and ${IDLE_MAX} minutes.`);
      return;
    }

    const patch: {
      ipAllowlistEnforced?: boolean;
      ipBypassEmails?: string[];
      idleTimeoutMinutes?: number;
      allowSelfRegister?: boolean;
    } = {};
    if (enforced !== initial.ipAllowlistEnforced) patch.ipAllowlistEnforced = enforced;
    if (!sameList(bypass, initial.ipBypassEmails)) patch.ipBypassEmails = bypass;
    if (idle !== initial.idleTimeoutMinutes) patch.idleTimeoutMinutes = idle;
    if (selfRegister !== initial.allowSelfRegister) patch.allowSelfRegister = selfRegister;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateAccessPolicy(patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Access policy saved." });
      router.refresh();
    });
  }

  return (
    <AcCard
      title="Access & session policy"
      icon={<KeyRound size={13} strokeWidth={2.4} />}
      description="Stored on org_settings. Enforcement arms the server-side allowlist check that sits on top of the environment gate; the rest govern how sessions behave."
    >
      <form onSubmit={onSubmit} className="px-5 py-4">
        <div className="flex flex-col gap-5">
          {/* Enforcement switch */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink-strong">
                Enforce the register server-side
              </div>
              <p
                className="mt-1 text-[13px] text-ink-subtle"
                style={{ lineHeight: 1.55 }}
              >
                When on, the shared check in lib/queries/access_control.ts
                (evaluateIpAccess) denies callers outside the active entries —
                cached for 60 seconds and failing open on any database error. It
                runs where the app calls it, never in edge middleware, which
                cannot reach Postgres. Off means the register is documentation and
                ALLOWED_IPS alone decides.
              </p>
              {!canEnforce && (
                <p
                  className="mt-1.5 text-[12.5px] font-semibold"
                  style={{ color: "var(--color-amber-deep)" }}
                >
                  {activeEntryCount === 0
                    ? "Add at least one active entry first."
                    : `Your address ${callerIp || "(unknown)"} is not covered by any active entry — add it before enforcing.`}
                </p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enforced}
              aria-label="Enforce the IP register server-side"
              disabled={!canEnforce && !enforced}
              onClick={() => setEnforced((v) => !v)}
              className="relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: enforced
                  ? "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))"
                  : "rgba(15, 23, 42, 0.16)",
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                style={{
                  left: 2,
                  transform: enforced ? "translateX(20px)" : "translateX(0)",
                  boxShadow: "0 1px 3px rgba(15,23,42,0.25)",
                }}
              />
            </button>
          </div>

          {/* Bypass emails */}
          <div>
            <label
              htmlFor="ac-bypass-emails"
              className="block text-[14px] font-semibold text-ink-strong"
            >
              Bypass emails
            </label>
            <p
              className="mb-2 mt-1 text-[13px] text-ink-subtle"
              style={{ lineHeight: 1.55 }}
            >
              These people reach the app from any network. Leaving the list empty
              falls back to the compiled-in list in lib/ip-gate.ts — it never
              means "nobody".
            </p>
            <TagsInput
              id="ac-bypass-emails"
              value={bypass}
              onChange={setBypass}
              maxLen={120}
              placeholder="name@carbideindia.com, then Enter"
            />
            {bypass.length === 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-subtle">
                <span>Falling back to:</span>
                {codeFallbackEmails.length === 0 ? (
                  <AcPill tone="muted">none compiled in</AcPill>
                ) : (
                  codeFallbackEmails.map((e) => (
                    <AcPill key={e} tone="brand" dot={false}>
                      {e}
                    </AcPill>
                  ))
                )}
              </p>
            )}
          </div>

          {/* Idle timeout */}
          <div>
            <label
              htmlFor="ac-idle-timeout"
              className="block text-[14px] font-semibold text-ink-strong"
            >
              Auto sign-out after (minutes idle)
            </label>
            <p
              className="mb-2 mt-1 text-[13px] text-ink-subtle"
              style={{ lineHeight: 1.55 }}
            >
              Users get a 30-second warning first. {IDLE_MIN}–{IDLE_MAX} minutes.
            </p>
            <input
              id="ac-idle-timeout"
              type="number"
              min={IDLE_MIN}
              max={IDLE_MAX}
              step={1}
              value={idle}
              aria-invalid={idleOutOfRange}
              onChange={(e) => setIdle(Number(e.target.value))}
              className="w-28 rounded-md border px-3.5 py-2.5 text-[14.5px] tabular-nums"
              style={{
                borderColor: idleOutOfRange
                  ? "var(--color-red)"
                  : "var(--color-hairline-strong)",
              }}
            />
          </div>

          {/* Self-registration */}
          <label className="group flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={selfRegister}
              onChange={(e) => setSelfRegister(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              <span className="block text-[14px] font-semibold text-ink-strong">
                Allow public sign-up
              </span>
              <span
                className="mt-0.5 block text-[13px] text-ink-subtle"
                style={{ lineHeight: 1.55 }}
              >
                Off is the recommended setting: only admins create accounts, and
                every new person arrives by invitation.
              </span>
            </span>
          </label>

          {error && (
            <div
              role="alert"
              className="rounded-md border px-3.5 py-2.5 text-[13.5px]"
              style={{
                borderColor: "color-mix(in srgb, var(--color-red) 30%, transparent)",
                background: "var(--color-red-bg)",
                color: "var(--color-red-deep)",
              }}
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <AcPrimaryButton type="submit" disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save policy"}
            </AcPrimaryButton>
            {dirty && !pending && (
              <span className="text-[12.5px] text-ink-subtle">Unsaved changes</span>
            )}
          </div>
        </div>
      </form>
    </AcCard>
  );
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].map((s) => s.toLowerCase()).sort();
  const bs = [...b].map((s) => s.toLowerCase()).sort();
  return as.every((v, i) => v === bs[i]);
}
