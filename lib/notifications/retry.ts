import "server-only";
import { and, asc, eq, inArray, lte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  notifications,
  notificationDispatchLog,
  tasks,
  employees,
  type NotificationKind,
} from "@/db/schema";
import { sendNotificationEmail } from "@/lib/email/resend";
import { sendWebPushToUser } from "@/lib/web-push/client";
import { getRecipientChannelPrefs } from "@/lib/notifications/channel-prefs";
import { nextRetryAt } from "@/lib/notifications/dispatch";

const MAX_ATTEMPTS = 3;
const RETRYABLE_CHANNELS = ["email", "web_push"] as const;

interface RetryRow {
  id: string;
  notificationId: string;
  // Plain text in the DB - legacy rows may carry retired channel names
  // (e.g. "slack"/"whatsapp"), so we treat this as an open string and
  // let runChannel's default arm terminal-fail anything unknown.
  channel: string;
  attemptCount: number;
}

interface NotificationCtx {
  id: string;
  userId: string;
  taskId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  actorId: string | null;
}

/**
 * Phase 2.1 - drain the retry queue. Picks dispatch-log rows where
 *   status = 'failed'
 *   AND next_attempt_at <= now()
 *   AND attempt_count < MAX_ATTEMPTS
 * and re-runs each row's single channel. Each row's status is updated to
 * `sent` / `failed` (with bumped attempt_count + next_attempt_at) /
 * `failed_terminal` (after MAX_ATTEMPTS).
 *
 * Returns a per-channel summary so the cron route can log it.
 */
export async function retryFailedDispatches(opts: { limit?: number } = {}): Promise<{
  picked: number;
  sent: number;
  failed: number;
  terminal: number;
  notFound: number;
}> {
  const limit = opts.limit ?? 50;
  const now = new Date();
  const stats = { picked: 0, sent: 0, failed: 0, terminal: 0, notFound: 0 };

  // Pick eligible rows.
  const pending = (await db
    .select({
      id: notificationDispatchLog.id,
      notificationId: notificationDispatchLog.notificationId,
      channel: notificationDispatchLog.channel,
      attemptCount: notificationDispatchLog.attemptCount,
    })
    .from(notificationDispatchLog)
    .where(
      and(
        eq(notificationDispatchLog.status, "failed"),
        inArray(notificationDispatchLog.channel, [...RETRYABLE_CHANNELS]),
        lte(notificationDispatchLog.nextAttemptAt, now),
        lt(notificationDispatchLog.attemptCount, MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(notificationDispatchLog.nextAttemptAt))
    .limit(limit)) as RetryRow[];

  stats.picked = pending.length;
  if (pending.length === 0) return stats;

  // Lazily-loaded shared cache so we don't re-fetch the same notification
  // / recipient / task across multiple retry rows for the same notification.
  const notifCache = new Map<string, NotificationCtx | null>();
  const prefsCache = new Map<string, Awaited<ReturnType<typeof getRecipientChannelPrefs>>>();
  const taskCache = new Map<string, { title: string; subject: string | null; shortId: string | null } | null>();
  const actorCache = new Map<string, string>();

  for (const row of pending) {
    const next = row.attemptCount + 1;
    // 1. Load notification context.
    let notif = notifCache.get(row.notificationId);
    if (notif === undefined) {
      const [n] = await db
        .select({
          id: notifications.id,
          userId: notifications.userId,
          taskId: notifications.taskId,
          kind: notifications.kind,
          title: notifications.title,
          body: notifications.body,
          actorId: notifications.actorId,
        })
        .from(notifications)
        .where(eq(notifications.id, row.notificationId))
        .limit(1);
      notif = (n as NotificationCtx | undefined) ?? null;
      notifCache.set(row.notificationId, notif);
    }
    if (!notif) {
      // The notification was deleted - terminal-fail this log row so
      // we stop trying.
      await db
        .update(notificationDispatchLog)
        .set({
          status: "failed_terminal",
          errorMessage: "notification deleted",
          attemptCount: next,
          attemptedAt: new Date(),
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(notificationDispatchLog.id, row.id));
      stats.notFound++;
      stats.terminal++;
      continue;
    }

    // 2. Load recipient prefs.
    let prefs = prefsCache.get(notif.userId);
    if (prefs === undefined) {
      prefs = await getRecipientChannelPrefs(notif.userId);
      prefsCache.set(notif.userId, prefs);
    }
    if (!prefs) {
      // Recipient deleted - terminal-fail.
      await db
        .update(notificationDispatchLog)
        .set({
          status: "failed_terminal",
          errorMessage: "recipient deleted",
          attemptCount: next,
          attemptedAt: new Date(),
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(notificationDispatchLog.id, row.id));
      stats.terminal++;
      continue;
    }

    // 3. Run the one channel.
    const outcome = await runChannel(row.channel, notif, prefs, {
      taskCache,
      actorCache,
    });

    // 4. Persist the new outcome.
    const isTerminal =
      outcome.status === "failed_terminal" ||
      (outcome.status === "failed" && next >= MAX_ATTEMPTS);
    const finalStatus = isTerminal ? "failed_terminal" : outcome.status;
    await db
      .update(notificationDispatchLog)
      .set({
        status: finalStatus,
        errorMessage: outcome.error ?? null,
        attemptCount: next,
        attemptedAt: new Date(),
        nextAttemptAt:
          outcome.status === "failed" && !isTerminal ? nextRetryAt(next) : null,
        updatedAt: new Date(),
      })
      .where(eq(notificationDispatchLog.id, row.id));

    if (outcome.status === "sent") {
      stats.sent++;
      // Add the channel name to the parent notification's
      // delivered_channels so the UI catches up.
      await db
        .update(notifications)
        .set({
          deliveredChannels: sql`array_append(coalesce(${notifications.deliveredChannels}, '{}'), ${row.channel})`,
          ...(row.channel === "email" ? { emailSentAt: new Date() } : {}),
        })
        .where(eq(notifications.id, notif.id))
        .catch(() => {});
    } else if (isTerminal) {
      stats.terminal++;
    } else {
      stats.failed++;
    }
  }

  return stats;
}

interface ChannelOutcome {
  status: "sent" | "skipped" | "failed" | "failed_terminal";
  error?: string;
}

interface ChannelHelpers {
  taskCache: Map<string, { title: string; subject: string | null; shortId: string | null } | null>;
  actorCache: Map<string, string>;
}

async function runChannel(
  channel: string,
  notif: NotificationCtx,
  prefs: NonNullable<Awaited<ReturnType<typeof getRecipientChannelPrefs>>>,
  helpers: ChannelHelpers,
): Promise<ChannelOutcome> {
  try {
    switch (channel) {
      case "email": {
        if (!prefs.emailOptIn) return { status: "skipped" };
        await sendNotificationEmail({
          id: notif.id,
          userId: notif.userId,
          kind: notif.kind,
          title: notif.title,
          body: notif.body,
          taskId: notif.taskId,
        });
        return { status: "sent" };
      }
      case "web_push": {
        const ctx = await buildOutboundCtx(notif, helpers);
        const res = await sendWebPushToUser(notif.userId, notif.kind, {
          actorName: ctx.actorName,
          taskSubject: ctx.taskSubject,
          body: ctx.body,
          shortId: ctx.shortId,
          taskId: notif.taskId ?? "",
        });
        return outcomeFromChannelResult(res);
      }
      default: {
        // Legacy/unknown channel name in the DB (e.g. a retired "slack"
        // or "whatsapp" row). Terminal-fail it so it can never wedge the
        // retry queue.
        return {
          status: "failed_terminal",
          error: `unknown channel: ${channel}`,
        };
      }
    }
  } catch (err) {
    return { status: "failed", error: errMsg(err).slice(0, 2000) };
  }
}

function outcomeFromChannelResult(res: "sent" | "skip" | { error: string }): ChannelOutcome {
  if (res === "sent") return { status: "sent" };
  if (res === "skip") return { status: "skipped" };
  return { status: "failed", error: res.error.slice(0, 2000) };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : JSON.stringify(e);
}

async function buildOutboundCtx(
  notif: NotificationCtx,
  helpers: ChannelHelpers,
): Promise<{
  kind: NotificationKind;
  actorName: string;
  taskSubject: string;
  body: string | undefined;
  shortId: string;
}> {
  // Task (cached per notification id).
  let task = notif.taskId ? helpers.taskCache.get(notif.taskId) : null;
  if (notif.taskId && task === undefined) {
    const [t] = await db
      .select({ title: tasks.title, subject: tasks.subject, shortId: tasks.shortId })
      .from(tasks)
      .where(eq(tasks.id, notif.taskId))
      .limit(1);
    task = t ?? null;
    helpers.taskCache.set(notif.taskId, task);
  }

  // Actor (cached per id).
  let actorName = "";
  if (notif.actorId) {
    const cached = helpers.actorCache.get(notif.actorId);
    if (cached !== undefined) {
      actorName = cached;
    } else {
      const [a] = await db
        .select({ name: employees.name })
        .from(employees)
        .where(eq(employees.id, notif.actorId))
        .limit(1);
      actorName = a?.name ?? "";
      helpers.actorCache.set(notif.actorId, actorName);
    }
  }

  return {
    kind: notif.kind,
    actorName,
    taskSubject: (task?.subject ?? task?.title ?? notif.title) || "",
    body: notif.body ?? undefined,
    shortId: task?.shortId ?? "",
  };
}
