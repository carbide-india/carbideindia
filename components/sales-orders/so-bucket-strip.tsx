import Link from "next/link";
import type { Route } from "next";
import type { SalesOrderStatus } from "@/db/enums";
import type {
  OutputCounts,
  SalesOrderOutputFilter,
  StageBucketCount,
} from "@/lib/sales-orders/buckets";

/**
 * The Sales Order register's "what is left" strip.
 *
 * Manan's complaint verbatim: 20 costings exist, 3 are done, "I need to see the
 * Not Done". Same rule here - every tile is a LIVE count over the whole
 * register set and every tile is a link straight to that filtered list, so a
 * number you can see is a list you can open.
 *
 * TWO axes, kept visually apart because they must never be added together:
 *   - STAGE: `sales_order_status` is NOT NULL, so the bucket counts partition
 *     the register exactly - they always sum to Total.
 *   - OUTPUTS: the customer copy and the factory copy each have their OWN send
 *     flag, so each output row is its own pending/sent split of the SAME rows.
 *
 * Zero-count tiles are kept, not hidden: a Pending Approval that disappears
 * when empty is precisely the count that "silently excludes rows".
 */

interface Props {
  buckets: StageBucketCount[];
  outputs: OutputCounts;
  activeStatus: SalesOrderStatus | null;
  activeOutput: SalesOrderOutputFilter | null;
  /** Total rows in the register, before any filter. */
  total: number;
}

/** Build the register href preserving the other axis' filter. */
function hrefFor(
  status: SalesOrderStatus | null,
  output: SalesOrderOutputFilter | null,
): Route {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (output) params.set("output", output);
  const qs = params.toString();
  return (qs ? `/sales-orders?${qs}` : "/sales-orders") as Route;
}

export function SoBucketStrip({
  buckets,
  outputs,
  activeStatus,
  activeOutput,
  total,
}: Props) {
  return (
    <div className="mb-5 flex flex-col gap-2.5">
      {/* The STAGE BUCKET band used to lead this strip and was dropped on
          2026-08-14 — once the register grew the sidebar distribution every
          other stage has, this was the same list twice on one screen. The
          output split stays: the sidebar shows only the two "issued" views,
          and the pending halves are the ones you act on. */}

      {/* ── Dual output ──────────────────────────────────────────────── */}
      <div>
        <StripLabel>
          Outputs — one order, two copies (counted separately)
        </StripLabel>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Not Issued to Customer"
            value={outputs.customerPending}
            tone="amber"
            href={hrefFor(
              activeStatus,
              activeOutput === "customer_pending" ? null : "customer_pending",
            )}
            active={activeOutput === "customer_pending"}
          />
          <StatTile
            label="SO Issued to Customer"
            value={outputs.customerSent}
            tone="green"
            href={hrefFor(
              activeStatus,
              activeOutput === "customer_sent" ? null : "customer_sent",
            )}
            active={activeOutput === "customer_sent"}
          />
          <StatTile
            label="Not Issued to Production"
            value={outputs.factoryPending}
            tone="amber"
            href={hrefFor(
              activeStatus,
              activeOutput === "factory_pending" ? null : "factory_pending",
            )}
            active={activeOutput === "factory_pending"}
          />
          <StatTile
            label="SO Issued to Production"
            value={outputs.factorySent}
            tone="green"
            href={hrefFor(
              activeStatus,
              activeOutput === "factory_sent" ? null : "factory_sent",
            )}
            active={activeOutput === "factory_sent"}
          />
        </div>
      </div>
    </div>
  );
}

function StripLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-ink-subtle">
      {children}
    </p>
  );
}

/**
 * A dense, clickable KPI tile - the StatMini shape used on the Primary
 * Feasibility dashboard, made into a filter link. Colour comes from a status
 * colour TOKEN name, never a hex.
 */
function StatTile({
  label,
  value,
  tone,
  href,
  active,
}: {
  label: string;
  value: number;
  tone: string;
  href: Route;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className="flex items-center gap-2.5 rounded-xl border bg-surface-card px-3 py-2 transition-colors hover:border-hairline-strong"
      style={{
        borderColor: active
          ? `color-mix(in srgb, var(--color-${tone}) 55%, transparent)`
          : "var(--color-hairline)",
        background: active
          ? `color-mix(in srgb, var(--color-${tone}) 8%, var(--color-surface-card))`
          : "var(--color-surface-card)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <span
        className="font-mono text-[21px] font-black leading-none tabular-nums"
        style={{ color: `var(--color-${tone}-deep)` }}
      >
        {value}
      </span>
      <span className="min-w-0 truncate text-[11px] font-bold uppercase leading-tight tracking-[0.03em] text-ink-strong">
        {label}
      </span>
    </Link>
  );
}
