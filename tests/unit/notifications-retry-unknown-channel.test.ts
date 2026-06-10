import { describe, it, expect, vi, beforeEach } from "vitest";

// `lib/notifications/retry.ts` imports "server-only" at the top.  The
// real module throws when loaded outside an RSC; Vitest needs a no-op.
vi.mock("server-only", () => ({}));

/**
 * Regression — the Slack/WhatsApp removal can leave legacy dispatch-log
 * rows whose `channel` column (plain text in the DB) still says "slack"
 * or "whatsapp".  `runChannel` used to be a switch with no default, so
 * such a row made it return `undefined` and the cron crashed on
 * `outcome.status` — then crashed again on the SAME row every run.
 *
 * This test feeds the retry loop one channel="slack" row and asserts it
 * resolves without throwing, terminal-fails the row (so it can never be
 * picked again), and never invokes a real channel sender.
 */

const state = vi.hoisted(() => ({
  // Each db.select()...limit() call shifts the next result off this queue.
  selectResults: [] as unknown[][],
  // Every db.update().set(patch) records its patch here.
  updatePatches: [] as Array<Record<string, unknown>>,
}));

const { emailSpy, webPushSpy } = vi.hoisted(() => ({
  emailSpy: vi.fn(async () => undefined),
  webPushSpy: vi.fn(async () => "sent" as const),
}));

vi.mock("@/lib/db", () => {
  // select(...).from(...).where(...)[.orderBy(...)].limit(n) — both the
  // pick query and the notification lookup terminate in .limit().
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(async () => state.selectResults.shift() ?? []);
  const select = vi.fn(() => chain);

  // update(...).set(patch).where(...) — record the patch.
  const where = vi.fn(async () => undefined);
  const set = vi.fn((patch: Record<string, unknown>) => {
    state.updatePatches.push(patch);
    return { where };
  });
  const update = vi.fn(() => ({ set }));

  return { db: { select, update } };
});

vi.mock("@/db/schema", () => ({
  notifications: {
    id: "notifications.id",
    userId: "notifications.user_id",
    taskId: "notifications.task_id",
    kind: "notifications.kind",
    title: "notifications.title",
    body: "notifications.body",
    actorId: "notifications.actor_id",
    deliveredChannels: "notifications.delivered_channels",
  },
  notificationDispatchLog: {
    id: "ndl.id",
    notificationId: "ndl.notification_id",
    channel: "ndl.channel",
    status: "ndl.status",
    attemptCount: "ndl.attempt_count",
    nextAttemptAt: "ndl.next_attempt_at",
  },
  tasks: {
    id: "tasks.id",
    title: "tasks.title",
    subject: "tasks.subject",
    shortId: "tasks.short_id",
  },
  employees: { id: "employees.id", name: "employees.name" },
}));

vi.mock("@/lib/email/resend", () => ({ sendNotificationEmail: emailSpy }));
vi.mock("@/lib/web-push/client", () => ({ sendWebPushToUser: webPushSpy }));

vi.mock("@/lib/notifications/channel-prefs", () => ({
  getRecipientChannelPrefs: vi.fn(async () => ({
    id: "u-1",
    name: "Recipient",
    email: "recipient@example.com",
    emailOptIn: true,
    mentionEscalation: true,
    oooDelegateId: null,
    oooStart: null,
    oooEnd: null,
  })),
}));

// retry.ts only needs nextRetryAt from dispatch.ts — stub the module so
// the test doesn't drag in the whole notify() dependency graph.
vi.mock("@/lib/notifications/dispatch", () => ({
  nextRetryAt: vi.fn(() => new Date(Date.now() + 60_000)),
}));

import { retryFailedDispatches } from "@/lib/notifications/retry";

beforeEach(() => {
  state.selectResults = [];
  state.updatePatches = [];
  emailSpy.mockClear();
  webPushSpy.mockClear();
});

describe("retryFailedDispatches — unknown channel rows", () => {
  it("terminal-fails a legacy channel='slack' row without throwing", async () => {
    state.selectResults = [
      // 1. pick query → one stale slack row that slipped past the filter.
      [
        {
          id: "log-1",
          notificationId: "n-1",
          channel: "slack",
          attemptCount: 1,
        },
      ],
      // 2. notification lookup → parent row still exists.
      [
        {
          id: "n-1",
          userId: "u-1",
          taskId: null,
          kind: "task_assigned",
          title: "Hello",
          body: null,
          actorId: null,
        },
      ],
    ];

    const stats = await retryFailedDispatches();

    // The batch survived and the row is counted as terminal.
    expect(stats).toEqual({
      picked: 1,
      sent: 0,
      failed: 0,
      terminal: 1,
      notFound: 0,
    });

    // The row's status moved to failed_terminal with no next attempt, so
    // the pick query can never select it again.
    expect(state.updatePatches).toHaveLength(1);
    const patch = state.updatePatches[0]!;
    expect(patch.status).toBe("failed_terminal");
    expect(patch.errorMessage).toBe("unknown channel: slack");
    expect(patch.nextAttemptAt).toBeNull();

    // No real channel sender was ever invoked for the unknown channel.
    expect(emailSpy).not.toHaveBeenCalled();
    expect(webPushSpy).not.toHaveBeenCalled();
  });
});
