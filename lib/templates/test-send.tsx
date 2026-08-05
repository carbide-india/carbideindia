import "server-only";
import { Text } from "@react-email/components";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { EmailLayout } from "@/emails/_layout";

/**
 * "Send test to myself" for /admin/templates.
 *
 * Deliberately narrow: the caller resolves the recipient from the signed-in
 * admin's own employee row, so this can never address a third party.  The
 * body is the ALREADY-RENDERED template text (placeholders substituted with
 * catalogue sample values) — this module does no templating of its own.
 *
 * It wraps that text in `emails/_layout.tsx`, the same branded shell every
 * production notification uses, so the admin sees the real thing rather than
 * a plain-text approximation.
 *
 * Note: lib/email/resend.ts exports only purpose-built senders
 * (sendInviteEmail / sendNotificationEmail / sendDigestEmail) and no generic
 * one, so the Resend client is constructed here against the identical env
 * contract — RESEND_API_KEY absent means "no email configured", never a throw
 * that looks like a template problem.
 */

let cached: Resend | null = null;

function getResend(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

const FROM =
  process.env.RESEND_FROM_EMAIL || "Carbide India WMS <onboarding@resend.dev>";

export type TestSendResult =
  | { ok: true; skipped: false }
  /** Resend is not configured in this environment — nothing was attempted. */
  | { ok: true; skipped: true }
  | { ok: false; error: string };

export async function sendTemplateTestEmail(args: {
  to: string;
  /** Rendered subject, without the [TEST] marker — added here. */
  subject: string;
  /** Rendered body. Blank lines separate paragraphs. */
  body: string;
  /** Shown above the body so a stray test in an inbox is self-explaining. */
  contextLine: string;
}): Promise<TestSendResult> {
  const resend = getResend();
  if (!resend) return { ok: true, skipped: true };

  const paragraphs = args.body
    .split(/\n{2,}/)
    .map((p) => p.trimEnd())
    .filter((p) => p.length > 0);

  const element = (
    <EmailLayout preview={args.subject}>
      <Text
        style={{
          margin: "0 0 20px",
          padding: "8px 12px",
          borderRadius: 8,
          backgroundColor: "#EEF2FF",
          color: "#3F3F94",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {args.contextLine}
      </Text>
      {paragraphs.map((p, i) => (
        <Text
          key={i}
          style={{
            margin: "0 0 14px",
            fontSize: 15,
            lineHeight: 1.6,
            color: "#0F172A",
            whiteSpace: "pre-wrap",
          }}
        >
          {p}
        </Text>
      ))}
    </EmailLayout>
  );

  let html: string;
  try {
    html = await render(element);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not render the template",
    };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: `[TEST] ${args.subject}`.slice(0, 200),
      html,
      text: `${args.contextLine}\n\n${args.body}`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, skipped: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Resend rejected the test send",
    };
  }
}
