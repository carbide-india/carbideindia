import { History } from "lucide-react";
import { AcCard, AcEmpty, AcPill } from "./access-control-primitives";

export interface AccessControlEventView {
  id: string;
  eventType: string;
  actorName: string | null;
  createdAt: Date;
  fromValue: unknown;
  toValue: unknown;
}

/** Plain-English label per settings_events.event_type written by this page. */
const EVENT_COPY: Record<string, string> = {
  allowlist_entry_created: "added an allowlist entry",
  allowlist_entry_updated: "edited an allowlist entry",
  allowlist_entry_deactivated: "deactivated an allowlist entry",
  allowlist_entry_reactivated: "reactivated an allowlist entry",
  allowlist_env_imported: "imported ALLOWED_IPS into the register",
  policy_updated: "changed the access policy",
};

const DESTRUCTIVE = new Set(["allowlist_entry_deactivated"]);

/**
 * The Access Control slice of settings_events. Rendered on the server — it is
 * read-only, so there is nothing to ship to the browser.
 */
export function AccessControlEvents({
  events,
}: {
  events: AccessControlEventView[];
}) {
  return (
    <AcCard
      title="Change history"
      icon={<History size={13} strokeWidth={2.4} />}
      description="Every change made on this page, newest first. Rows are append-only — nothing here can be edited or removed."
    >
      {events.length === 0 ? (
        <AcEmpty
          title="Nothing changed yet"
          body="Adding an entry, importing from ALLOWED_IPS or saving the policy will all land here with the name of whoever did it."
        />
      ) : (
        <ol className="divide-y divide-hairline">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-5 py-3">
              <span className="mt-1.5 shrink-0">
                <AcPill tone={DESTRUCTIVE.has(e.eventType) ? "red" : "brand"} dot={false}>
                  {e.eventType.startsWith("allowlist") ? "Register" : "Policy"}
                </AcPill>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-ink-strong">
                  <span className="font-semibold">{e.actorName ?? "Someone"}</span>{" "}
                  {EVENT_COPY[e.eventType] ?? e.eventType.replace(/_/g, " ")}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-subtle tabular-nums">
                  {e.createdAt.toLocaleString()}
                  {summarise(e.toValue) && ` · ${summarise(e.toValue)}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AcCard>
  );
}

/** Compact "key: value" tail for the jsonb payload — never more than 3 keys. */
function summarise(value: unknown): string {
  if (value === null || typeof value !== "object") return "";
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 3);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") || "none" : String(v)}`)
    .join(" · ");
}
