"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { messageTemplates, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  BODY_HARD_MAX,
  NAME_HARD_MAX,
  NOTIFICATION_KINDS,
  SUBJECT_HARD_MAX,
  TEMPLATE_CHANNELS,
  TEMPLATE_CHANNEL_LABELS,
  KIND_LABELS,
  defaultTemplate,
  extractTokens,
  renderTemplate,
  sampleValuesForKind,
  slotKey,
  validateTemplate,
  variablesForKind,
  type NotificationKind,
  type TemplateChannel,
} from "@/lib/templates/catalogue";
import { sendTemplateTestEmail } from "@/lib/templates/test-send";

/**
 * Write side of /admin/templates.
 *
 * Every action re-validates from scratch: the browser runs the same
 * `validateTemplate()` for live feedback, but nothing it reports is trusted
 * here.  Governance is deactivate-only — there is no delete action; switching
 * a row off restores the built-in react-email / push wording, which is why
 * that is always a safe operation.
 */

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const SlotSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  channel: z.enum(TEMPLATE_CHANNELS),
});

const SaveSchema = SlotSchema.extend({
  name: z.string().trim().min(1, "Give the template a name.").max(NAME_HARD_MAX),
  subject: z.string().max(SUBJECT_HARD_MAX, `Subject is over ${SUBJECT_HARD_MAX} characters.`),
  body: z.string().max(BODY_HARD_MAX, `Body is over ${BODY_HARD_MAX} characters.`),
});

const SetActiveSchema = SlotSchema.extend({ isActive: z.boolean() });

/** Tokens the row declares: what it actually uses, catalogue-filtered. */
function usedVariables(
  kind: NotificationKind,
  subject: string,
  body: string,
): string[] {
  const allowed = new Set(variablesForKind(kind).map((v) => v.token));
  return extractTokens(`${subject}\n${body}`).filter((t) => allowed.has(t));
}

/** Audit trail. Never allowed to fail the mutation it describes. */
async function recordEvent(args: {
  actorId: string;
  kind: NotificationKind;
  channel: TemplateChannel;
  eventType: string;
  fromValue: Record<string, unknown> | null;
  toValue: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "message_template",
      targetId: slotKey(args.kind, args.channel),
      actorId: args.actorId,
      eventType: args.eventType,
      fromValue: args.fromValue,
      toValue: args.toValue,
    });
  } catch (err) {
    console.error("[templates] settings_events write failed", err);
  }
}

async function findSlotRow(kind: NotificationKind, channel: TemplateChannel) {
  return db.query.messageTemplates.findFirst({
    where: and(
      eq(messageTemplates.kind, kind),
      eq(messageTemplates.channel, channel),
    ),
  });
}

/**
 * Create or update the row for a slot.  Saving always leaves the row ACTIVE:
 * an admin who has just written copy expects it to be the configured wording,
 * and "Revert to built-in" is the explicit way back.
 */
export async function saveTemplate(input: {
  kind: string;
  channel: string;
  name: string;
  subject: string;
  body: string;
}): Promise<ActionResult<{ slot: string }>> {
  const me = await requireAdmin();

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, channel, name, subject, body } = parsed.data;

  // Placeholder rules are the real validation: an unknown token would ship a
  // literal "{{cusomterName}}" to a customer.
  const check = validateTemplate({ kind, subject, body });
  if (!check.ok) {
    return { ok: false, error: check.error ?? "Invalid placeholders" };
  }
  if (body.trim().length === 0) {
    return { ok: false, error: "The message body cannot be empty." };
  }
  if (subject.trim().length === 0) {
    return { ok: false, error: "The subject line cannot be empty." };
  }

  const before = await findSlotRow(kind, channel);

  try {
    await db
      .insert(messageTemplates)
      .values({
        kind,
        channel,
        name,
        subject,
        body,
        variables: usedVariables(kind, subject, body),
        isActive: true,
        updatedById: me.id,
      })
      .onConflictDoUpdate({
        target: [messageTemplates.kind, messageTemplates.channel],
        set: {
          name,
          subject,
          body,
          variables: usedVariables(kind, subject, body),
          isActive: true,
          updatedById: me.id,
          updatedAt: new Date(),
        },
      });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordEvent({
    actorId: me.id,
    kind,
    channel,
    eventType: before ? "updated" : "created",
    fromValue: before
      ? { name: before.name, subject: before.subject, body: before.body, isActive: before.isActive }
      : null,
    toValue: { name, subject, body, isActive: true },
  });

  revalidatePath("/admin/templates");
  return { ok: true, slot: slotKey(kind, channel) };
}

/**
 * Switch a slot between the stored copy and the built-in one.  Turning it OFF
 * keeps the row (and the admin's wording) intact — this is the deactivate-only
 * governance rule, and it is why the UI can call the action reversible.
 */
export async function setTemplateActive(input: {
  kind: string;
  channel: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = SetActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, channel, isActive } = parsed.data;

  const before = await findSlotRow(kind, channel);
  if (!before) {
    return {
      ok: false,
      error: "No stored template for this slot yet — save one first.",
    };
  }
  if (before.isActive === isActive) {
    return { ok: false, error: "That template is already in this state." };
  }

  // Re-check before switching ON: a row whose kind lost a variable would
  // otherwise go live with a placeholder that renders literally.
  if (isActive) {
    const check = validateTemplate({
      kind,
      subject: before.subject ?? "",
      body: before.body,
    });
    if (!check.ok) {
      return { ok: false, error: check.error ?? "Fix the placeholders before enabling." };
    }
  }

  try {
    await db
      .update(messageTemplates)
      .set({ isActive, updatedById: me.id, updatedAt: new Date() })
      .where(eq(messageTemplates.id, before.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordEvent({
    actorId: me.id,
    kind,
    channel,
    eventType: isActive ? "enabled" : "disabled",
    fromValue: { isActive: before.isActive },
    toValue: { isActive },
  });

  revalidatePath("/admin/templates");
  return { ok: true };
}

/**
 * Overwrite the stored wording with the version that ships in the codebase.
 * This DISCARDS the admin's edits, so the UI gates it behind a confirm — the
 * previous text survives only in settings_events.
 */
export async function restoreTemplateDefault(input: {
  kind: string;
  channel: string;
}): Promise<ActionResult<{ name: string; subject: string; body: string }>> {
  const me = await requireAdmin();

  const parsed = SlotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, channel } = parsed.data;
  const shipped = defaultTemplate(kind, channel);

  const before = await findSlotRow(kind, channel);

  try {
    await db
      .insert(messageTemplates)
      .values({
        kind,
        channel,
        name: shipped.name,
        subject: shipped.subject,
        body: shipped.body,
        variables: usedVariables(kind, shipped.subject, shipped.body),
        isActive: before?.isActive ?? false,
        updatedById: me.id,
      })
      .onConflictDoUpdate({
        target: [messageTemplates.kind, messageTemplates.channel],
        set: {
          name: shipped.name,
          subject: shipped.subject,
          body: shipped.body,
          variables: usedVariables(kind, shipped.subject, shipped.body),
          updatedById: me.id,
          updatedAt: new Date(),
        },
      });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordEvent({
    actorId: me.id,
    kind,
    channel,
    eventType: "restored_default",
    fromValue: before
      ? { name: before.name, subject: before.subject, body: before.body }
      : null,
    toValue: { name: shipped.name, subject: shipped.subject, body: shipped.body },
  });

  revalidatePath("/admin/templates");
  return { ok: true, ...shipped };
}

const TestSendSchema = SlotSchema.extend({
  /** Unsaved editor content — the admin tests what they are about to save. */
  subject: z.string().max(SUBJECT_HARD_MAX),
  body: z.string().max(BODY_HARD_MAX),
});

/**
 * Renders the given wording with catalogue sample values and emails it to the
 * SIGNED-IN ADMIN and nobody else — the address is read from their own
 * employee row, never from the payload.  Email channel only; push and inbox
 * are previewed in the browser rather than delivered.
 */
export async function sendTemplateTest(input: {
  kind: string;
  channel: string;
  subject: string;
  body: string;
}): Promise<ActionResult<{ sentTo: string; skipped: boolean }>> {
  const me = await requireAdmin();

  const parsed = TestSendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, channel, subject, body } = parsed.data;

  if (channel !== "email") {
    return {
      ok: false,
      error: `Test sends are email-only — ${TEMPLATE_CHANNEL_LABELS[channel]} is preview-only.`,
    };
  }
  if (!me.email) {
    return { ok: false, error: "Your employee record has no email address." };
  }

  const check = validateTemplate({ kind, subject, body });
  if (!check.ok) {
    return { ok: false, error: check.error ?? "Fix the placeholders before testing." };
  }

  const samples = sampleValuesForKind(kind);
  const result = await sendTemplateTestEmail({
    to: me.email,
    subject: renderTemplate(subject, samples),
    body: renderTemplate(body, samples),
    contextLine: `Template test — ${KIND_LABELS[kind]} · Email. Sample data, no real task.`,
  });

  if (!result.ok) return { ok: false, error: result.error };

  await recordEvent({
    actorId: me.id,
    kind,
    channel,
    eventType: "test_sent",
    fromValue: null,
    toValue: { to: me.email, skipped: result.skipped },
  });

  return { ok: true, sentTo: me.email, skipped: result.skipped };
}
