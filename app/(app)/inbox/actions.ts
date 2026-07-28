"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import {
  markRead as markReadQuery,
  markAllRead as markAllReadQuery,
  listInboxNotifications,
  getUnreadCount,
} from "@/lib/queries/notifications";
import type { NotificationKind } from "@/db/schema";

/** A lightweight, serialisable notification for the bell popover preview. */
export interface InboxPreviewItem {
  id: string;
  kind: NotificationKind;
  title: string;
  actorName: string | null;
  taskId: string | null;
  /** ISO string (Dates aren't serialisable across the action boundary). */
  createdAt: string;
  read: boolean;
}

export interface InboxPreview {
  unread: number;
  items: InboxPreviewItem[];
}

/**
 * Feed for the header bell popover: the unread count (for the badge) plus the
 * latest few notifications, in one round-trip. Read-model only - never writes.
 */
export async function getInboxPreview(): Promise<InboxPreview> {
  const me = await requireUser();
  const [{ notifications }, unread] = await Promise.all([
    listInboxNotifications({ userId: me.id, isAdmin: me.isAdmin, limit: 8 }),
    getUnreadCount(me.id),
  ]);
  return {
    unread,
    items: notifications.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      actorName: n.actorName,
      taskId: n.taskId,
      createdAt: n.createdAt.toISOString(),
      read: n.readAt !== null,
    })),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Mark a single notification read.  RLS + the query's user_id scope
 * make this safe even if a forged id is passed.  Returns void so the
 * client doesn't need a JSON envelope; we revalidate /inbox + / to
 * refresh the nav-badge.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(notificationId)) return { ok: false, error: "Invalid id." };
  const me = await requireUser();
  try {
    await markReadQuery(notificationId, me.id);
  } catch (err) {
    // Non-critical: marking read failing must never block opening the task.
    return { ok: false, error: `Could not mark read: ${(err as Error).message}` };
  }
  revalidatePath("/inbox");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Mark every unread notification for the current user as read.  Powers
 * the "Mark all read" button at the top of /inbox.
 */
export async function markAllNotificationsRead(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await requireUser();
  try {
    await markAllReadQuery(me.id);
  } catch (err) {
    return { ok: false, error: `Could not mark all read: ${(err as Error).message}` };
  }
  revalidatePath("/inbox");
  revalidatePath("/");
  return { ok: true };
}
