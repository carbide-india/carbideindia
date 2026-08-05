import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  messageTemplates,
  type MessageTemplate,
} from "@/db/schema";
import {
  NOTIFICATION_KINDS,
  TEMPLATE_CHANNELS,
  defaultTemplate,
  slotKey,
  validateTemplate,
  type NotificationKind,
  type TemplateChannel,
} from "@/lib/templates/catalogue";

/**
 * Read side of /admin/templates.
 *
 * The page is a fixed grid: every notification kind × every template channel
 * is a "slot", whether or not a `message_templates` row exists for it.  A slot
 * with no row (or an inactive row) resolves to the built-in react-email /
 * push-payload wording that ships in the codebase, so a fresh install renders
 * a complete page with zero database rows.
 */

export type TemplateSlotStatus =
  /** A stored row is active — its wording is the configured copy. */
  | "custom"
  /** A stored row exists but is switched off; the built-in wins. */
  | "disabled"
  /** No row at all; the built-in wins. */
  | "builtin";

export interface TemplateSlot {
  key: string;
  kind: NotificationKind;
  channel: TemplateChannel;
  status: TemplateSlotStatus;
  /** Row id when one exists — the editor upserts by (kind, channel) either way. */
  id: string | null;
  name: string;
  subject: string;
  body: string;
  /** Tokens the stored row declares. Empty for a built-in slot. */
  variables: string[];
  isActive: boolean;
  /** True when the stored wording differs from the shipped default. */
  isEdited: boolean;
  /**
   * Set when a STORED row references a placeholder that is no longer in the
   * catalogue — e.g. the seed shipped a token that a later kind change dropped.
   * The editor surfaces this so the row gets fixed before the next save.
   */
  validationError: string | null;
  updatedAt: Date | null;
  updatedByName: string | null;
}

export interface TemplateOverview {
  slots: TemplateSlot[];
  totals: {
    slots: number;
    stored: number;
    active: number;
    disabled: number;
    builtin: number;
    invalid: number;
  };
}

/** Fold a stored row (or its absence) into the fixed slot shape. */
function toSlot(
  kind: NotificationKind,
  channel: TemplateChannel,
  row: (MessageTemplate & { updatedByName: string | null }) | undefined,
): TemplateSlot {
  const fallback = defaultTemplate(kind, channel);

  if (!row) {
    return {
      key: slotKey(kind, channel),
      kind,
      channel,
      status: "builtin",
      id: null,
      name: fallback.name,
      subject: fallback.subject,
      body: fallback.body,
      variables: [],
      isActive: false,
      isEdited: false,
      validationError: null,
      updatedAt: null,
      updatedByName: null,
    };
  }

  const subject = row.subject ?? "";
  const check = validateTemplate({ kind, subject, body: row.body });

  return {
    key: slotKey(kind, channel),
    kind,
    channel,
    status: row.isActive ? "custom" : "disabled",
    id: row.id,
    name: row.name,
    subject,
    body: row.body,
    variables: row.variables,
    isActive: row.isActive,
    isEdited: subject !== fallback.subject || row.body !== fallback.body,
    validationError: check.ok ? null : check.error,
    updatedAt: row.updatedAt,
    updatedByName: row.updatedByName,
  };
}

/**
 * Every slot, ordered kind-major then channel, plus the counts the page header
 * shows.  One query — the grid is 10 × 3, so there is nothing to paginate.
 */
export async function getTemplateOverview(): Promise<TemplateOverview> {
  const rows = await db
    .select({
      id: messageTemplates.id,
      kind: messageTemplates.kind,
      channel: messageTemplates.channel,
      name: messageTemplates.name,
      subject: messageTemplates.subject,
      body: messageTemplates.body,
      variables: messageTemplates.variables,
      isActive: messageTemplates.isActive,
      updatedById: messageTemplates.updatedById,
      createdAt: messageTemplates.createdAt,
      updatedAt: messageTemplates.updatedAt,
      updatedByName: employees.name,
    })
    .from(messageTemplates)
    .leftJoin(employees, eq(employees.id, messageTemplates.updatedById))
    .orderBy(asc(messageTemplates.kind), asc(messageTemplates.channel));

  const byKey = new Map<string, MessageTemplate & { updatedByName: string | null }>();
  for (const r of rows) {
    // `kind` is plain text in the DB, so a row for a retired kind can exist.
    // Those are simply not addressable by the fixed grid and are ignored here.
    byKey.set(`${r.kind}:${r.channel}`, r as MessageTemplate & { updatedByName: string | null });
  }

  const slots: TemplateSlot[] = [];
  for (const kind of NOTIFICATION_KINDS) {
    for (const channel of TEMPLATE_CHANNELS) {
      slots.push(toSlot(kind, channel, byKey.get(`${kind}:${channel}`)));
    }
  }

  return {
    slots,
    totals: {
      slots: slots.length,
      stored: slots.filter((s) => s.id !== null).length,
      active: slots.filter((s) => s.status === "custom").length,
      disabled: slots.filter((s) => s.status === "disabled").length,
      builtin: slots.filter((s) => s.status === "builtin").length,
      invalid: slots.filter((s) => s.validationError !== null).length,
    },
  };
}

/**
 * The resolver every channel sender should consult before falling back to its
 * built-in component: returns the stored wording only when a row exists AND is
 * active AND still validates.  A null result means "use the built-in".
 *
 * Today this is called by the /admin/templates test send.  It is the single
 * seam a future dispatch change needs — see the report note in the module doc
 * for lib/notifications/dispatch.ts, which is not owned by this feature.
 */
export async function resolveMessageTemplate(
  kind: NotificationKind,
  channel: TemplateChannel,
): Promise<{ name: string; subject: string; body: string } | null> {
  const row = await db.query.messageTemplates.findFirst({
    where: and(
      eq(messageTemplates.kind, kind),
      eq(messageTemplates.channel, channel),
      eq(messageTemplates.isActive, true),
    ),
  });
  if (!row) return null;

  const subject = row.subject ?? "";
  if (!validateTemplate({ kind, subject, body: row.body }).ok) return null;

  return { name: row.name, subject, body: row.body };
}
