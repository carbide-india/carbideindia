import { listNotifications, getNotificationDeliveryStats } from "@/lib/queries/notifications";
import { listEmployees } from "@/lib/queries/employees";
import { NotificationList } from "@/components/admin/notification-list";
import { NotificationFilterBar } from "@/components/admin/notification-filter-bar";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const kindRaw = firstString(sp.kind);
  const toRaw = firstString(sp.to);
  const failuresOnly = sp.fail === "1";
  const beforeRaw = firstString(sp.before);
  const fromRaw = firstString(sp.from);
  const toDateRaw = firstString(sp.dto);

  const kinds = kindRaw ? kindRaw.split(",").filter(Boolean) : [];
  const recipientIds = toRaw ? toRaw.split(",").filter(Boolean) : [];

  const parseDate = (v: string) => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  const [allEmployees, stats, page] = await Promise.all([
    // Include deactivated recipients so the filter can scope to
    // historical notifications for users who have since been deactivated.
    listEmployees({ includeInactive: true }),
    getNotificationDeliveryStats(),
    listNotifications({
      kinds: kinds.length ? kinds : undefined,
      recipientIds: recipientIds.length ? recipientIds : undefined,
      from: parseDate(fromRaw),
      to: parseDate(toDateRaw),
      before: parseDate(beforeRaw),
      failuresOnly,
    }),
  ]);

  const buildLoadOlder = () => {
    if (!page.hasMore || !page.nextCursor) return null;
    const params = new URLSearchParams();
    if (kinds.length) params.set("kind", kinds.join(","));
    if (recipientIds.length) params.set("to", recipientIds.join(","));
    if (failuresOnly) params.set("fail", "1");
    if (fromRaw) params.set("from", fromRaw);
    if (toDateRaw) params.set("dto", toDateRaw);
    params.set("before", page.nextCursor);
    return `/admin/notifications?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-7">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · Communication
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Message History
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[#6b7280]">
          Per-notification delivery log across email and Web Push.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3 mb-6 max-md:grid-cols-2">
        <StatCard label="Last 24h" value={stats.total24h} />
        <StatCard label="Failures" value={stats.failures24h} tone="red" />
        <StatCard label="Email" value={stats.byChannel24h.email} />
        <StatCard label="Push" value={stats.byChannel24h.push} />
      </div>

      <NotificationFilterBar
        employees={allEmployees.map((e) => ({ value: e.id, label: e.name }))}
        initial={{
          kinds,
          recipientIds,
          failuresOnly,
          from: fromRaw,
          to: toDateRaw,
        }}
      />

      <NotificationList
        rows={page.rows}
        hasMore={page.hasMore}
        loadOlderHref={buildLoadOlder()}
      />
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "red" }) {
  return (
    <div className="rounded-2xl border border-[#e6e8ec] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div
        className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#a2a8b4]"
        style={{ fontFamily: "var(--font-mono-display)" }}
      >
        {label}
      </div>
      <div
        className={`mt-1.5 text-[34px] font-extrabold leading-none tabular-nums ${
          tone === "red" ? "text-[#d32f2f]" : "text-[#1e2f66]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
