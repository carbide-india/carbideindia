import * as React from "react";
import type { AuditEntry } from "@/lib/queries/audit";

interface Props {
  entries: AuditEntry[];
}

/* ── Date formatter ─────────────────────────────────────────────────────── */

const auditDateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatAuditDate(d: Date): string {
  return auditDateFmt.format(d);
}

/* ── Field-name humanizer ───────────────────────────────────────────────── */

// Whole-field overrides for nicer labels (checked before the generic pass).
const FIELD_LABELS: Record<string, string> = {
  kycSalesPersonId: "Sales Person",
  productTypeIds: "Product Types",
};

// Tokens that should render fully upper-cased after Title-Casing.
const ACRONYMS = new Set([
  "GSTIN",
  "PAN",
  "IFSC",
  "MSME",
  "UOM",
  "HSN",
  "SO",
  "SM",
  "KYC",
]);

function humanizeField(field: string): string {
  const override = FIELD_LABELS[field];
  if (override) return override;

  // Split on camelCase transitions and underscores
  const words = field
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean);
  return words
    .map((w) => {
      const title = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return ACRONYMS.has(title.toUpperCase()) ? title.toUpperCase() : title;
    })
    .join(" ");
}

/* ── Value renderer (old/new cell) ─────────────────────────────────────── */

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ") || "—";
  return String(v);
}

/* ── Action chip ────────────────────────────────────────────────────────── */

type ChipStyle = {
  background: string;
  color: string;
};

function chipStyle(action: string): ChipStyle {
  switch (action) {
    case "create":
      return {
        background: "var(--color-green-bg)",
        color: "var(--color-green-deep)",
      };
    case "update":
      return {
        background: "rgba(59, 130, 246, 0.10)",
        color: "#1d4ed8",
      };
    case "delete":
      return {
        background: "rgba(239, 68, 68, 0.10)",
        color: "#b91c1c",
      };
    default:
      // restore / unknown
      return {
        background: "rgba(15, 23, 42, 0.06)",
        color: "var(--color-ink-soft)",
      };
  }
}

function ActionChip({ action }: { action: string }) {
  const style = chipStyle(action);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize"
      style={style}
    >
      {action}
    </span>
  );
}

/* ── AuditHistory ───────────────────────────────────────────────────────── */

export function AuditHistory({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-[14px] text-ink-subtle">No changes recorded yet.</p>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-soft p-4"
        >
          {/* Row: actor · chip · date */}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-semibold text-ink-strong">
              {entry.actorName ?? "System"}
            </span>
            <span className="text-ink-subtle" aria-hidden="true">
              &middot;
            </span>
            <ActionChip action={entry.action} />
            <span className="text-ink-subtle" aria-hidden="true">
              &middot;
            </span>
            <time
              dateTime={entry.createdAt.toISOString()}
              className="text-ink-muted"
            >
              {formatAuditDate(entry.createdAt)}
            </time>
          </div>

          {/* Changes (update) */}
          {entry.action === "update" && entry.changes && entry.changes.length > 0 && (
            <ul className="flex flex-col gap-1 pl-1">
              {entry.changes.map((change, idx) => (
                <li key={idx} className="flex flex-wrap items-baseline gap-1 text-[13px]">
                  <span className="font-semibold text-ink-muted">
                    {humanizeField(change.field)}:
                  </span>
                  <span className="text-ink-subtle">{renderValue(change.old)}</span>
                  <span className="text-ink-subtle" aria-hidden="true">&#8594;</span>
                  <span className="text-ink-strong">{renderValue(change.new)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Summary (create / delete / restore) */}
          {entry.action !== "update" && entry.summary && (
            <p className="text-[13px] text-ink-muted">{entry.summary}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
