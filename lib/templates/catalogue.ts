/**
 * Message-template catalogue — the pure, isomorphic half of /admin/templates.
 *
 * Nothing here touches the database, so both the Server Actions (validation)
 * and the browser editor (live preview + unknown-token highlighting) import
 * the exact same rules.  Keeping one copy is the point: the editor must never
 * accept a token the server would reject.
 *
 * Vocabulary
 *   kind     — a NOTIFICATION_KINDS value (the event that fires a message)
 *   channel  — a TEMPLATE_CHANNELS value (email · web_push · inbox)
 *   slot     — one (kind, channel) pair; exactly one message_templates row
 *   token    — a `{{placeholder}}` inside a subject or body
 */

import { NOTIFICATION_KINDS, type NotificationKind } from "@/db/schema";
import {
  TEMPLATE_CHANNELS,
  TEMPLATE_CHANNEL_LABELS,
  type TemplateChannel,
} from "@/db/enums";

export { NOTIFICATION_KINDS, TEMPLATE_CHANNELS, TEMPLATE_CHANNEL_LABELS };
export type { NotificationKind, TemplateChannel };

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/** Mirrors the wording used by /admin/settings → Notifications. */
export const KIND_LABELS: Record<NotificationKind, string> = {
  task_assigned: "Task assigned",
  task_initiated: "Task initiated",
  status_changed: "Status changed",
  approved: "Approved",
  declined: "Not approved",
  reassigned: "Reassigned",
  transferred: "Transferred",
  cancelled: "Cancelled",
  commented: "Comment posted",
  overdue_digest: "Daily overdue digest",
};

/** One line explaining, in Carbide terms, when the event actually fires. */
export const KIND_DESCRIPTIONS: Record<NotificationKind, string> = {
  task_assigned: "A task's doer is set — the person now owning the work is told.",
  task_initiated: "The doer starts the task; the initiator and creator are told.",
  status_changed: "Any status move on a task the recipient is party to.",
  approved: "The initiator approves completed work.",
  declined: "The initiator sends work back with a reason.",
  reassigned: "The doer changes — both the incoming and outgoing person are told.",
  transferred: "Ownership moves outside the tracked team.",
  cancelled: "A task is called off before completion.",
  commented: "Someone posts a comment on a task the recipient follows.",
  overdue_digest: "The daily cron summary of everything still pending.",
};

/**
 * Where the message comes from when no active row exists for the slot.  This
 * is the "fallback is explicit" contract the admin page promises: switching a
 * template off is always safe because these still ship in the codebase.
 */
export const CHANNEL_FALLBACKS: Record<
  TemplateChannel,
  { source: string; note: string }
> = {
  email: {
    source: "emails/notifications/*.tsx",
    note: "Branded react-email component rendered by lib/email/resend.ts and delivered through Resend.",
  },
  web_push: {
    source: "lib/web-push/payload.ts",
    note: "buildPushPayload() composes the title and body handed to the VAPID push service.",
  },
  inbox: {
    source: "notify() call sites",
    note: "The title and body passed to lib/notifications/dispatch.ts land verbatim on the in-app notifications row.",
  },
};

/** What the `subject` column means on each channel — the label changes. */
export const CHANNEL_SUBJECT_LABELS: Record<TemplateChannel, string> = {
  email: "Subject line",
  web_push: "Notification title",
  inbox: "Inbox headline",
};

/**
 * Soft length ceilings. Email matches SUBJECT_MAX in lib/email/resend.ts
 * (which hard-clamps at 80); the push number is the practical Android/iOS
 * truncation point. Exceeding these is a warning, never a save blocker.
 */
export const CHANNEL_SUBJECT_SOFT_MAX: Record<TemplateChannel, number> = {
  email: 80,
  web_push: 50,
  inbox: 90,
};

/** Hard caps enforced by zod on the server. Generous — these catch abuse. */
export const SUBJECT_HARD_MAX = 200;
export const BODY_HARD_MAX = 8000;
export const NAME_HARD_MAX = 80;

/* ------------------------------------------------------------------ */
/* Variables                                                           */
/* ------------------------------------------------------------------ */

export interface TemplateVariable {
  /** The bare identifier — written `{{token}}` in a template. */
  token: string;
  label: string;
  /** Value substituted by the live preview and the "send test" action. */
  sample: string;
}

/**
 * Every task-scoped notification resolves these six.  They map onto what
 * lib/email/resend.ts already puts in RenderContext (recipient, actor, task
 * subject, deep link) plus the site origin.
 */
const BASE_TASK_VARIABLES: readonly TemplateVariable[] = [
  { token: "recipientName", label: "Person receiving the message", sample: "Alok Deshpande" },
  { token: "actorName", label: "Person who triggered the event", sample: "Manan Shah" },
  { token: "taskTitle", label: "Task subject line", sample: "Quote 12 mm K20 inserts — Bharat Forge" },
  { token: "taskNo", label: "Short task id", sample: "CI-1042" },
  { token: "taskUrl", label: "Deep link to the task", sample: "https://wms.carbideindia.com/tasks/CI-1042" },
  { token: "siteUrl", label: "WMS base URL", sample: "https://wms.carbideindia.com" },
];

/** Extras that only exist for particular kinds. */
const EXTRA_VARIABLES: Record<NotificationKind, readonly TemplateVariable[]> = {
  task_assigned: [
    { token: "dueDate", label: "Formatted due date", sample: "12 Aug 2026" },
    { token: "priority", label: "Task priority", sample: "High" },
    { token: "initiatorName", label: "Who raised the task", sample: "Manan Shah" },
  ],
  task_initiated: [
    { token: "dueDate", label: "Formatted due date", sample: "12 Aug 2026" },
    { token: "doerName", label: "Who is doing the work", sample: "Alok Deshpande" },
  ],
  status_changed: [
    { token: "oldStatus", label: "Status before the move", sample: "In progress" },
    { token: "newStatus", label: "Status after the move", sample: "Done" },
  ],
  approved: [{ token: "note", label: "Approver's note", sample: "Dimensions verified against the drawing." }],
  declined: [{ token: "note", label: "Reason given", sample: "Tolerance band on the OD is still open." }],
  reassigned: [
    { token: "counterpartName", label: "The other person in the swap", sample: "Priya Kulkarni" },
  ],
  transferred: [
    { token: "externalTo", label: "External destination", sample: "Ambad Plant — Tooling" },
    { token: "note", label: "Handover note", sample: "Drawing pack attached in the task." },
  ],
  cancelled: [{ token: "note", label: "Reason given", sample: "Customer withdrew the enquiry." }],
  commented: [{ token: "note", label: "The comment text", sample: "Grade should be K20, not K10." }],
  overdue_digest: [
    { token: "overdueCount", label: "How many tasks are overdue", sample: "7" },
    { token: "digestDate", label: "Date the digest was built", sample: "4 Aug 2026" },
    { token: "boardUrl", label: "Link to the recipient's board", sample: "https://wms.carbideindia.com/board" },
  ],
};

/**
 * The digest is not about one task, so it deliberately drops the task-scoped
 * tokens — offering `{{taskUrl}}` there would render a dead link.
 */
const NON_TASK_KINDS: ReadonlySet<NotificationKind> = new Set(["overdue_digest"]);

/** Every token an admin may legally use for this kind, in display order. */
export function variablesForKind(kind: NotificationKind): TemplateVariable[] {
  const base = NON_TASK_KINDS.has(kind)
    ? BASE_TASK_VARIABLES.filter(
        (v) => v.token === "recipientName" || v.token === "siteUrl",
      )
    : BASE_TASK_VARIABLES;
  return [...base, ...(EXTRA_VARIABLES[kind] ?? [])];
}

/** `{ token: sample }` for the live preview and the test send. */
export function sampleValuesForKind(
  kind: NotificationKind,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of variablesForKind(kind)) out[v.token] = v.sample;
  return out;
}

/* ------------------------------------------------------------------ */
/* Token parsing + validation                                          */
/* ------------------------------------------------------------------ */

/**
 * A well-formed placeholder: `{{token}}`, optionally padded, identifier only.
 * Deliberately strict — no expressions, no dotted paths, no function calls,
 * so a stored template can never become a mini template language.
 */
const TOKEN_RE = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** Any `{{` at all — used to spot the ones TOKEN_RE did not consume. */
const OPEN_BRACE_RE = /\{\{/g;

/** Distinct tokens used in `text`, in first-appearance order. */
export function extractTokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const token = m[1];
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** How many `{{` openers are not part of a valid placeholder. */
function countMalformed(text: string): number {
  const opens = text.match(OPEN_BRACE_RE)?.length ?? 0;
  const valid = text.match(TOKEN_RE)?.length ?? 0;
  return Math.max(0, opens - valid);
}

export interface TemplateValidation {
  ok: boolean;
  /** Tokens that are not in this kind's catalogue — hard rejection. */
  unknownTokens: string[];
  /** Count of `{{` that never resolved into a placeholder — hard rejection. */
  malformedCount: number;
  /** Catalogue tokens actually referenced. Purely informational. */
  usedTokens: string[];
  /** First human-readable problem, or null when the template is clean. */
  error: string | null;
}

/**
 * The single validation rule for a template, run identically on both sides of
 * the wire.  Unknown placeholders are rejected rather than silently rendered
 * so an admin can never ship an email that says `{{cusomterName}}` to a client.
 */
export function validateTemplate(input: {
  kind: NotificationKind;
  subject: string;
  body: string;
}): TemplateValidation {
  const allowed = new Set(variablesForKind(input.kind).map((v) => v.token));
  const combined = `${input.subject}\n${input.body}`;
  const used = extractTokens(combined);
  const unknown = used.filter((t) => !allowed.has(t));
  const malformedCount = countMalformed(combined);

  let error: string | null = null;
  if (unknown.length > 0) {
    error = `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown
      .map((t) => `{{${t}}}`)
      .join(", ")}. Use only the variables listed for ${KIND_LABELS[input.kind]}.`;
  } else if (malformedCount > 0) {
    error = `${malformedCount} unclosed or malformed placeholder${
      malformedCount > 1 ? "s" : ""
    }. Every placeholder must read {{likeThis}}.`;
  }

  return {
    ok: error === null,
    unknownTokens: unknown,
    malformedCount,
    usedTokens: used.filter((t) => allowed.has(t)),
    error,
  };
}

/**
 * Substitutes every well-formed placeholder from `values`.  Tokens with no
 * value are left standing so a preview visibly shows what is missing rather
 * than rendering a confusing blank.
 */
export function renderTemplate(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(TOKEN_RE, (whole, token: string) => {
    const value = values[token];
    return value === undefined ? whole : value;
  });
}

/* ------------------------------------------------------------------ */
/* Shipped defaults                                                    */
/* ------------------------------------------------------------------ */

export interface TemplateDefault {
  name: string;
  subject: string;
  body: string;
}

/**
 * Email defaults are byte-identical to TEMPLATE_SEEDS in
 * scripts/seed-defaults.ts, so "Restore shipped wording" genuinely returns the
 * row to what a fresh install would have written.  Keep the two in sync.
 */
const EMAIL_DEFAULTS: Record<NotificationKind, TemplateDefault> = {
  task_assigned: {
    name: "Task assigned",
    subject: "New task: {{taskTitle}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} assigned you "{{taskTitle}}" (#{{taskNo}}), due {{dueDate}}.\n\nOpen it: {{taskUrl}}',
  },
  task_initiated: {
    name: "Task initiated",
    subject: "Task started: {{taskTitle}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} started work on "{{taskTitle}}" (#{{taskNo}}).\n\nOpen it: {{taskUrl}}',
  },
  status_changed: {
    name: "Status changed",
    subject: "{{taskTitle}} is now {{newStatus}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} moved "{{taskTitle}}" (#{{taskNo}}) from {{oldStatus}} to {{newStatus}}.\n\nOpen it: {{taskUrl}}',
  },
  approved: {
    name: "Approved",
    subject: "Approved: {{taskTitle}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} approved "{{taskTitle}}" (#{{taskNo}}).\n\nOpen it: {{taskUrl}}',
  },
  declined: {
    name: "Not approved",
    subject: "Not approved: {{taskTitle}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} did not approve "{{taskTitle}}" (#{{taskNo}}).\n\nReason: {{note}}\n\nOpen it: {{taskUrl}}',
  },
  reassigned: {
    name: "Reassigned",
    subject: "Reassigned to you: {{taskTitle}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} reassigned "{{taskTitle}}" (#{{taskNo}}) to you.\n\nOpen it: {{taskUrl}}',
  },
  transferred: {
    name: "Transferred",
    subject: "Transferred: {{taskTitle}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} transferred "{{taskTitle}}" (#{{taskNo}}).\n\nOpen it: {{taskUrl}}',
  },
  cancelled: {
    name: "Cancelled",
    subject: "Cancelled: {{taskTitle}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} cancelled "{{taskTitle}}" (#{{taskNo}}).\n\nOpen it: {{taskUrl}}',
  },
  commented: {
    name: "New comment",
    subject: "New comment on {{taskTitle}}",
    body: 'Hi {{recipientName}},\n\n{{actorName}} commented on "{{taskTitle}}" (#{{taskNo}}):\n\n{{note}}\n\nOpen it: {{taskUrl}}',
  },
  overdue_digest: {
    name: "Overdue digest",
    subject: "{{overdueCount}} task(s) overdue",
    body: "Hi {{recipientName}},\n\nYou have {{overdueCount}} overdue task(s) as of {{digestDate}}.\n\nOpen your board: {{boardUrl}}",
  },
};

/**
 * Push defaults transcribe the TITLES map in lib/web-push/payload.ts, whose
 * body is `taskSubject` (optionally " - " + the meta note).
 */
const PUSH_TITLES: Record<NotificationKind, string> = {
  task_assigned: "{{actorName}} assigned you a task",
  task_initiated: "{{actorName}} initiated your task",
  status_changed: "{{actorName}} updated a task",
  approved: "{{actorName}} approved your task",
  declined: "{{actorName}} declined your task",
  reassigned: "{{actorName}} reassigned a task",
  transferred: "{{actorName}} transferred a task",
  cancelled: "{{actorName}} cancelled a task",
  commented: "{{actorName}} commented on your task",
  overdue_digest: "You have overdue tasks",
};

/** Which kinds carry a free-text note the push/inbox body can quote. */
const KINDS_WITH_NOTE: ReadonlySet<NotificationKind> = new Set([
  "approved",
  "declined",
  "cancelled",
  "transferred",
  "commented",
]);

/** The shipped wording for a slot, used by preview + "restore default". */
export function defaultTemplate(
  kind: NotificationKind,
  channel: TemplateChannel,
): TemplateDefault {
  const email = EMAIL_DEFAULTS[kind];
  if (channel === "email") return email;

  const title = PUSH_TITLES[kind];
  const noteSuffix = KINDS_WITH_NOTE.has(kind) ? " — {{note}}" : "";

  if (channel === "web_push") {
    return {
      name: `${KIND_LABELS[kind]} (push)`,
      subject: title,
      body:
        kind === "overdue_digest"
          ? "{{overdueCount}} task(s) need your attention"
          : `{{taskTitle}}${noteSuffix}`,
    };
  }

  // inbox
  return {
    name: `${KIND_LABELS[kind]} (inbox)`,
    subject: title,
    body:
      kind === "overdue_digest"
        ? "{{overdueCount}} task(s) overdue as of {{digestDate}}"
        : `{{taskTitle}}${noteSuffix}`,
  };
}

/** Stable slot identifier used for settings_events targets and DOM ids. */
export function slotKey(kind: NotificationKind, channel: TemplateChannel): string {
  return `${kind}:${channel}`;
}

/** Narrowing helpers so hostile query strings and payloads bounce cleanly. */
export function isNotificationKind(v: string): v is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(v);
}

export function isTemplateChannel(v: string): v is TemplateChannel {
  return (TEMPLATE_CHANNELS as readonly string[]).includes(v);
}
