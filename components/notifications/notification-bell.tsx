"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  UserPlus,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Users,
  ArrowRightLeft,
  Ban,
  MessageSquare,
  AlarmClock,
  CheckCheck,
  ArrowRight,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { NotificationKind } from "@/db/schema";
import {
  getInboxPreview,
  markNotificationRead,
  markAllNotificationsRead,
  type InboxPreview,
  type InboxPreviewItem,
} from "@/app/(app)/inbox/actions";
import { cn } from "@/lib/utils";

/* Per-kind icon + tone token (matches the /inbox row identity). */
const KIND_META: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  task_assigned: { icon: UserPlus, tone: "blue" },
  task_initiated: { icon: Sparkles, tone: "blue" },
  status_changed: { icon: RefreshCw, tone: "amber" },
  approved: { icon: CheckCircle2, tone: "green" },
  declined: { icon: XCircle, tone: "red" },
  reassigned: { icon: Users, tone: "purple" },
  transferred: { icon: ArrowRightLeft, tone: "purple" },
  cancelled: { icon: Ban, tone: "red" },
  commented: { icon: MessageSquare, tone: "blue" },
  overdue_digest: { icon: AlarmClock, tone: "amber" },
};

/**
 * Header notification bell → a premium in-screen popover (no page nav). Shows
 * an animated unread badge, a live-fetched preview of the latest notifications
 * (per-kind coloured icon, unread accent, relative time), inline "Mark all
 * read", per-row click-to-open-and-mark-read, and a footer into the full inbox.
 */
export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<InboxPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [markingAll, setMarkingAll] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInboxPreview();
      setData(res);
    } catch {
      /* silent - the badge just won't update */
    } finally {
      setLoading(false);
    }
  }, []);

  // Badge on mount; refetch each time the popover opens.
  React.useEffect(() => {
    void load();
  }, [load]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
  }

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  function openItem(item: InboxPreviewItem) {
    setOpen(false);
    if (!item.read) {
      setData((d) =>
        d
          ? {
              unread: Math.max(0, d.unread - 1),
              items: d.items.map((i) => (i.id === item.id ? { ...i, read: true } : i)),
            }
          : d,
      );
      void markNotificationRead(item.id);
    }
    router.push((item.taskId ? `/tasks/${item.taskId}` : "/inbox") as Route);
  }

  async function markAll() {
    setMarkingAll(true);
    setData((d) => (d ? { unread: 0, items: d.items.map((i) => ({ ...i, read: true })) } : d));
    try {
      await markAllNotificationsRead();
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
          className={cn(
            "relative grid h-9 w-9 place-items-center rounded-full text-[#4b5563] transition-colors hover:bg-[#efeffb] hover:text-[#3f3f94]",
            open && "bg-[#efeffb] text-[#3f3f94]",
            className,
          )}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[17px] items-center justify-center rounded-full bg-[#d32f2f] px-1 text-[10px] font-black leading-[16px] text-white ring-2 ring-white">
              {unread > 99 ? "99+" : unread}
              <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#d32f2f] opacity-60" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[384px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3.5"
          style={{ background: "linear-gradient(180deg, #f5f6ff 0%, #eef0fb 100%)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black tracking-tight text-[#1f2430]">Notifications</span>
            {unread > 0 && (
              <span className="inline-flex items-center rounded-full bg-[#3f3f94] px-2 py-0.5 text-[11px] font-black text-white tabular-nums">
                {unread} new
              </span>
            )}
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              disabled={markingAll}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold text-[#3f3f94] transition-colors hover:bg-white/70 disabled:opacity-50"
            >
              {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[min(60vh,440px)] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex flex-col gap-3 px-4 py-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[#eceef4]" />
                  <div className="flex-1 space-y-2">
                    <span className="block h-3 w-3/4 animate-pulse rounded bg-[#eceef4]" />
                    <span className="block h-2.5 w-1/3 animate-pulse rounded bg-[#f1f2f7]" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-[#eef0f4]">
              {items.map((item) => (
                <NotificationItem key={item.id} item={item} onOpen={() => openItem(item)} />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <Link
          href={"/inbox" as Route}
          onClick={() => setOpen(false)}
          className="flex items-center justify-center gap-1.5 border-t border-[#eceef4] bg-[#fafbff] py-3 text-[13px] font-bold text-[#3f3f94] transition-colors hover:bg-[#f1f2fd]"
        >
          View all notifications
          <ArrowRight className="h-[15px] w-[15px]" strokeWidth={2.4} />
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({ item, onOpen }: { item: InboxPreviewItem; onOpen: () => void }) {
  const meta = KIND_META[item.kind] ?? { icon: Bell, tone: "blue" };
  const Icon = meta.icon;
  const when = React.useMemo(() => {
    const d = new Date(item.createdAt);
    return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
  }, [item.createdAt]);

  return (
    <li className="relative">
      {!item.read && (
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#3f3f94]" />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f6f7fe]"
        style={{
          background: item.read ? undefined : "color-mix(in srgb, #3f3f94 4%, transparent)",
        }}
      >
        <span
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `color-mix(in srgb, var(--color-${meta.tone}) 16%, #ffffff)`,
            color: `var(--color-${meta.tone}-deep)`,
            border: `1.5px solid color-mix(in srgb, var(--color-${meta.tone}) 34%, transparent)`,
          }}
        >
          <Icon size={16} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[13.5px] leading-snug text-[#1f2430]",
              item.read ? "font-semibold" : "font-bold",
            )}
          >
            {item.title}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[12px] text-[#8b90a0]">
            <span className="font-semibold text-[#6b7280]">{item.actorName ?? "System"}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{when}</span>
          </span>
        </span>
        {!item.read && (
          <span aria-hidden className="mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-[#3f3f94]" />
        )}
      </button>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span
        className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          background: "linear-gradient(135deg, #eef0fb, #e5e8f8)",
          color: "#3f3f94",
          border: "1px solid #d7dbf0",
        }}
      >
        <CheckCheck className="h-6 w-6" strokeWidth={2.2} />
      </span>
      <p className="text-[14px] font-bold text-[#1f2430]">You&apos;re all caught up</p>
      <p className="mt-1 text-[12.5px] text-[#8b90a0]">New activity on your work will show up here.</p>
    </div>
  );
}
