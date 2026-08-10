"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { AccessControlEntryDialog } from "./access-control-entry-dialog";
import {
  AcCard,
  AcEmpty,
  AcGhostButton,
  AcMono,
  AcPill,
} from "./access-control-primitives";

export interface AccessControlSighting {
  ip: string;
  hits: number;
  lastSeenAt: string;
  people: string[];
  covered: boolean;
}

/**
 * Addresses seen on recent sign-ins (login_sessions). The point is that an
 * admin adding an office circuit should never have to type an address from
 * memory — promote one that has demonstrably been used.
 */
export function AccessControlSightings({
  sightings,
}: {
  sightings: AccessControlSighting[];
}) {
  const router = useRouter();
  const [suggested, setSuggested] = useState<string | null>(null);

  return (
    <>
      <AcCard
        title="Recently seen sign-in addresses"
        icon={<Fingerprint size={13} strokeWidth={2.4} />}
        description="Sourced from the session log. Anything here has already carried a real sign-in, so it is a safe candidate for the register."
      >
        {sightings.length === 0 ? (
          <AcEmpty
            title="No sign-in addresses recorded yet"
            body="The session log fills as people sign in. Until then, use the address shown at the top of this page — that is the one this very request arrived from."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {sightings.map((s) => (
              <li
                key={s.ip}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AcMono>{s.ip}</AcMono>
                    {s.covered ? (
                      <AcPill tone="green">Covered</AcPill>
                    ) : (
                      <AcPill tone="amber">Not covered</AcPill>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-subtle tabular-nums">
                    {s.hits} session{s.hits === 1 ? "" : "s"} · last{" "}
                    {formatDateTime(new Date(s.lastSeenAt))}
                    {s.people.length > 0 && ` · ${s.people.slice(0, 3).join(", ")}`}
                    {s.people.length > 3 && ` +${s.people.length - 3}`}
                  </p>
                </div>
                {!s.covered && (
                  <AcGhostButton type="button" onClick={() => setSuggested(s.ip)}>
                    Add to register
                  </AcGhostButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </AcCard>

      <AccessControlEntryDialog
        open={suggested !== null}
        entry={null}
        suggestedCidr={suggested ?? undefined}
        onOpenChange={(o) => {
          if (!o) {
            setSuggested(null);
            router.refresh();
          }
        }}
      />
    </>
  );
}
