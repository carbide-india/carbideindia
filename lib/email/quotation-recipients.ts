/**
 * Who a quotation goes to — pure address handling, no server imports.
 *
 * Deliberately NOT inside lib/email/send-quotation.ts: that module carries
 * `import "server-only"`, which makes it unloadable from a test (and from any
 * client component). This is the part worth pinning with tests, so it lives
 * where tests can reach it.
 */

/** RFC-ish enough for a form: something@something.tld, no spaces. */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Split a free-text address field into clean addresses.
 * Accepts comma, semicolon, newline or space separated input, because that is
 * what people actually paste into a CC box.
 */
export function parseEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n\r\s]+/)) {
    const v = part.trim().toLowerCase();
    if (!v || !EMAIL_RE.test(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Resolve the recipients for a quotation: the enquiry's contact is To, its CC
 * list is CC, and anything already in To is dropped from CC so nobody is
 * addressed twice (some providers reject a duplicate across the two outright).
 */
export function resolveRecipients(input: {
  contactEmail: string | null | undefined;
  ccEmails: string | null | undefined;
  /** Extra addresses the sender typed in the dialog. */
  extraTo?: string | null;
  extraCc?: string | null;
}): { to: string[]; cc: string[] } {
  const to = [...parseEmails(input.contactEmail), ...parseEmails(input.extraTo)];
  const toSet = new Set(to);
  const cc = [...parseEmails(input.ccEmails), ...parseEmails(input.extraCc)].filter(
    (e) => !toSet.has(e),
  );
  return { to: [...new Set(to)], cc: [...new Set(cc)] };
}
