import type { NotificationKind } from "@/db/schema";
import type { TemplateChannel } from "@/db/enums";

/**
 * Ready-made message templates — one per (kind, channel) slot.
 *
 * Every notification kind gets all three channels rather than email only, so a
 * fresh install has real wording everywhere instead of falling back to the
 * built-in react-email component for push and inbox.
 *
 * The copy is written per channel, because the channels are not the same medium:
 *   • email    — greeting, context, explicit call to action, deep link
 *   • web_push — no greeting, title ≲50 chars, body ≲120; the URL rides on the
 *                push payload, so never put a link in the text
 *   • inbox    — one scannable headline plus a single line of detail; the row
 *                is already clickable, so no link either
 *
 * Tokens are restricted to what `variablesForKind()` in ./catalogue.ts allows
 * for that kind — the editor rejects unknown tokens on save, and a seed that
 * shipped an illegal one would be unsaveable the moment an admin opened it.
 * `overdue_digest` is not task-scoped, so it may only use recipientName,
 * siteUrl, overdueCount, digestDate and boardUrl.
 */
export interface MessageTemplateSeed {
  kind: NotificationKind;
  channel: TemplateChannel;
  name: string;
  subject: string;
  body: string;
  variables: string[];
}

const TASK = ["recipientName", "actorName", "taskTitle", "taskNo", "taskUrl", "siteUrl"];

export const MESSAGE_TEMPLATE_SEEDS: MessageTemplateSeed[] = [
  /* ── Task assigned ────────────────────────────────────────────────── */
  {
    kind: "task_assigned",
    channel: "email",
    name: "Task assigned · email",
    subject: "New task {{taskNo}}: {{taskTitle}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{actorName}} has assigned you a task.",
      "",
      "  Task      {{taskNo}} — {{taskTitle}}",
      "  Priority  {{priority}}",
      "  Due       {{dueDate}}",
      "  Raised by {{initiatorName}}",
      "",
      "Open it here: {{taskUrl}}",
      "",
      "If the due date does not work, reply to {{initiatorName}} before it slips.",
    ].join("\n"),
    variables: [...TASK, "dueDate", "priority", "initiatorName"],
  },
  {
    kind: "task_assigned",
    channel: "web_push",
    name: "Task assigned · push",
    subject: "New task · {{taskNo}}",
    body: "{{actorName}} assigned you \"{{taskTitle}}\". Due {{dueDate}} · {{priority}} priority.",
    variables: [...TASK, "dueDate", "priority"],
  },
  {
    kind: "task_assigned",
    channel: "inbox",
    name: "Task assigned · inbox",
    subject: "{{actorName}} assigned you {{taskNo}}",
    body: "{{taskTitle}} — due {{dueDate}}, {{priority}} priority.",
    variables: [...TASK, "dueDate", "priority"],
  },

  /* ── Task initiated ───────────────────────────────────────────────── */
  {
    kind: "task_initiated",
    channel: "email",
    name: "Task initiated · email",
    subject: "Started: {{taskNo}} — {{taskTitle}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{doerName}} has started work on {{taskNo}} — {{taskTitle}}.",
      "",
      "It is due {{dueDate}}. You will be told again when it moves to approval.",
      "",
      "Follow it here: {{taskUrl}}",
    ].join("\n"),
    variables: [...TASK, "dueDate", "doerName"],
  },
  {
    kind: "task_initiated",
    channel: "web_push",
    name: "Task initiated · push",
    subject: "Work started · {{taskNo}}",
    body: "{{doerName}} started \"{{taskTitle}}\". Due {{dueDate}}.",
    variables: [...TASK, "dueDate", "doerName"],
  },
  {
    kind: "task_initiated",
    channel: "inbox",
    name: "Task initiated · inbox",
    subject: "{{doerName}} started {{taskNo}}",
    body: "{{taskTitle}} — due {{dueDate}}.",
    variables: [...TASK, "dueDate", "doerName"],
  },

  /* ── Status changed ───────────────────────────────────────────────── */
  {
    kind: "status_changed",
    channel: "email",
    name: "Status changed · email",
    subject: "{{taskNo}} is now {{newStatus}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{actorName}} moved {{taskNo}} — {{taskTitle}} from {{oldStatus}} to {{newStatus}}.",
      "",
      "Open it here: {{taskUrl}}",
    ].join("\n"),
    variables: [...TASK, "oldStatus", "newStatus"],
  },
  {
    kind: "status_changed",
    channel: "web_push",
    name: "Status changed · push",
    subject: "{{taskNo}} → {{newStatus}}",
    body: "{{actorName}} moved \"{{taskTitle}}\" from {{oldStatus}} to {{newStatus}}.",
    variables: [...TASK, "oldStatus", "newStatus"],
  },
  {
    kind: "status_changed",
    channel: "inbox",
    name: "Status changed · inbox",
    subject: "{{taskNo}} moved to {{newStatus}}",
    body: "{{actorName}} moved {{taskTitle}} from {{oldStatus}}.",
    variables: [...TASK, "oldStatus", "newStatus"],
  },

  /* ── Approved ─────────────────────────────────────────────────────── */
  {
    kind: "approved",
    channel: "email",
    name: "Approved · email",
    subject: "Approved: {{taskNo}} — {{taskTitle}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{actorName}} approved {{taskNo}} — {{taskTitle}}. Nothing further is needed from you.",
      "",
      "Note: {{note}}",
      "",
      "Record: {{taskUrl}}",
    ].join("\n"),
    variables: [...TASK, "note"],
  },
  {
    kind: "approved",
    channel: "web_push",
    name: "Approved · push",
    subject: "Approved · {{taskNo}}",
    body: "{{actorName}} approved \"{{taskTitle}}\".",
    variables: [...TASK, "note"],
  },
  {
    kind: "approved",
    channel: "inbox",
    name: "Approved · inbox",
    subject: "{{actorName}} approved {{taskNo}}",
    body: "{{taskTitle}} — {{note}}",
    variables: [...TASK, "note"],
  },

  /* ── Not approved ─────────────────────────────────────────────────── */
  {
    kind: "declined",
    channel: "email",
    name: "Not approved · email",
    subject: "Sent back: {{taskNo}} — {{taskTitle}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{actorName}} has sent {{taskNo}} — {{taskTitle}} back for rework.",
      "",
      "Reason given:",
      "  {{note}}",
      "",
      "Pick it up here: {{taskUrl}}",
    ].join("\n"),
    variables: [...TASK, "note"],
  },
  {
    kind: "declined",
    channel: "web_push",
    name: "Not approved · push",
    subject: "Sent back · {{taskNo}}",
    body: "{{actorName}} returned \"{{taskTitle}}\": {{note}}",
    variables: [...TASK, "note"],
  },
  {
    kind: "declined",
    channel: "inbox",
    name: "Not approved · inbox",
    subject: "{{actorName}} sent back {{taskNo}}",
    body: "{{taskTitle}} — {{note}}",
    variables: [...TASK, "note"],
  },

  /* ── Reassigned ───────────────────────────────────────────────────── */
  {
    kind: "reassigned",
    channel: "email",
    name: "Reassigned · email",
    subject: "Reassigned: {{taskNo}} — {{taskTitle}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{actorName}} reassigned {{taskNo}} — {{taskTitle}}.",
      "The other person on this change is {{counterpartName}}.",
      "",
      "Open it here: {{taskUrl}}",
    ].join("\n"),
    variables: [...TASK, "counterpartName"],
  },
  {
    kind: "reassigned",
    channel: "web_push",
    name: "Reassigned · push",
    subject: "Reassigned · {{taskNo}}",
    body: "{{actorName}} reassigned \"{{taskTitle}}\" ({{counterpartName}}).",
    variables: [...TASK, "counterpartName"],
  },
  {
    kind: "reassigned",
    channel: "inbox",
    name: "Reassigned · inbox",
    subject: "{{taskNo}} reassigned",
    body: "{{actorName}} reassigned {{taskTitle}} — {{counterpartName}}.",
    variables: [...TASK, "counterpartName"],
  },

  /* ── Transferred ──────────────────────────────────────────────────── */
  {
    kind: "transferred",
    channel: "email",
    name: "Transferred · email",
    subject: "Transferred: {{taskNo}} — {{taskTitle}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{actorName}} transferred {{taskNo}} — {{taskTitle}} to {{externalTo}}.",
      "",
      "Handover note:",
      "  {{note}}",
      "",
      "Record: {{taskUrl}}",
    ].join("\n"),
    variables: [...TASK, "externalTo", "note"],
  },
  {
    kind: "transferred",
    channel: "web_push",
    name: "Transferred · push",
    subject: "Transferred · {{taskNo}}",
    body: "{{actorName}} transferred \"{{taskTitle}}\" to {{externalTo}}.",
    variables: [...TASK, "externalTo", "note"],
  },
  {
    kind: "transferred",
    channel: "inbox",
    name: "Transferred · inbox",
    subject: "{{taskNo}} transferred to {{externalTo}}",
    body: "{{taskTitle}} — {{note}}",
    variables: [...TASK, "externalTo", "note"],
  },

  /* ── Cancelled ────────────────────────────────────────────────────── */
  {
    kind: "cancelled",
    channel: "email",
    name: "Cancelled · email",
    subject: "Cancelled: {{taskNo}} — {{taskTitle}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{actorName}} cancelled {{taskNo}} — {{taskTitle}}. No further work is needed.",
      "",
      "Reason: {{note}}",
      "",
      "Record: {{taskUrl}}",
    ].join("\n"),
    variables: [...TASK, "note"],
  },
  {
    kind: "cancelled",
    channel: "web_push",
    name: "Cancelled · push",
    subject: "Cancelled · {{taskNo}}",
    body: "{{actorName}} cancelled \"{{taskTitle}}\": {{note}}",
    variables: [...TASK, "note"],
  },
  {
    kind: "cancelled",
    channel: "inbox",
    name: "Cancelled · inbox",
    subject: "{{actorName}} cancelled {{taskNo}}",
    body: "{{taskTitle}} — {{note}}",
    variables: [...TASK, "note"],
  },

  /* ── Comment posted ───────────────────────────────────────────────── */
  {
    kind: "commented",
    channel: "email",
    name: "Comment posted · email",
    subject: "New comment on {{taskNo}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "{{actorName}} commented on {{taskNo}} — {{taskTitle}}:",
      "",
      "  {{note}}",
      "",
      "Reply on the task: {{taskUrl}}",
    ].join("\n"),
    variables: [...TASK, "note"],
  },
  {
    kind: "commented",
    channel: "web_push",
    name: "Comment posted · push",
    subject: "Comment · {{taskNo}}",
    body: "{{actorName}}: {{note}}",
    variables: [...TASK, "note"],
  },
  {
    kind: "commented",
    channel: "inbox",
    name: "Comment posted · inbox",
    subject: "{{actorName}} commented on {{taskNo}}",
    body: "{{note}}",
    variables: [...TASK, "note"],
  },

  /* ── Daily overdue digest (not task-scoped) ───────────────────────── */
  {
    kind: "overdue_digest",
    channel: "email",
    name: "Overdue digest · email",
    subject: "{{overdueCount}} task(s) overdue — {{digestDate}}",
    body: [
      "Hi {{recipientName}},",
      "",
      "As of {{digestDate}} you have {{overdueCount}} task(s) past their due date.",
      "",
      "Open your board to clear them: {{boardUrl}}",
      "",
      "This digest is sent once a day. Change when it arrives in Admin → Company & Branding.",
    ].join("\n"),
    variables: ["recipientName", "siteUrl", "overdueCount", "digestDate", "boardUrl"],
  },
  {
    kind: "overdue_digest",
    channel: "web_push",
    name: "Overdue digest · push",
    subject: "{{overdueCount}} overdue",
    body: "You have {{overdueCount}} task(s) past due as of {{digestDate}}.",
    variables: ["recipientName", "siteUrl", "overdueCount", "digestDate"],
  },
  {
    kind: "overdue_digest",
    channel: "inbox",
    name: "Overdue digest · inbox",
    subject: "{{overdueCount}} task(s) overdue",
    body: "As of {{digestDate}}. Open your board to clear them.",
    variables: ["recipientName", "siteUrl", "overdueCount", "digestDate", "boardUrl"],
  },
];
