import { describe, expect, it } from "vitest";
import { MESSAGE_TEMPLATE_SEEDS } from "@/lib/templates/seeds";
import {
  CHANNEL_SUBJECT_SOFT_MAX,
  NOTIFICATION_KINDS,
  TEMPLATE_CHANNELS,
  variablesForKind,
} from "@/lib/templates/catalogue";

/** `{{token}}` occurrences in a string. */
function tokensIn(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!);
}

describe("ready-made message templates", () => {
  it("covers every (kind, channel) slot exactly once", () => {
    const seen = new Set<string>();
    for (const t of MESSAGE_TEMPLATE_SEEDS) {
      const slot = `${t.kind}:${t.channel}`;
      expect(seen.has(slot), `duplicate seed for ${slot}`).toBe(false);
      seen.add(slot);
    }
    expect(seen.size).toBe(NOTIFICATION_KINDS.length * TEMPLATE_CHANNELS.length);

    for (const kind of NOTIFICATION_KINDS) {
      for (const channel of TEMPLATE_CHANNELS) {
        expect(seen.has(`${kind}:${channel}`), `missing ${kind}:${channel}`).toBe(true);
      }
    }
  });

  it("only uses tokens the catalogue allows for that kind", () => {
    for (const t of MESSAGE_TEMPLATE_SEEDS) {
      const allowed = new Set(variablesForKind(t.kind).map((v) => v.token));
      for (const token of [...tokensIn(t.subject), ...tokensIn(t.body)]) {
        expect(
          allowed.has(token),
          `${t.kind}:${t.channel} uses {{${token}}}, which is not offered for this kind`,
        ).toBe(true);
      }
    }
  });

  it("declares every token it actually uses", () => {
    for (const t of MESSAGE_TEMPLATE_SEEDS) {
      const declared = new Set(t.variables);
      for (const token of [...tokensIn(t.subject), ...tokensIn(t.body)]) {
        expect(
          declared.has(token),
          `${t.kind}:${t.channel} uses {{${token}}} but does not list it in variables`,
        ).toBe(true);
      }
    }
  });

  it("declares only tokens the catalogue offers", () => {
    for (const t of MESSAGE_TEMPLATE_SEEDS) {
      const allowed = new Set(variablesForKind(t.kind).map((v) => v.token));
      for (const token of t.variables) {
        expect(allowed.has(token), `${t.kind}:${t.channel} declares unknown {{${token}}}`).toBe(true);
      }
    }
  });

  it("keeps subjects inside the per-channel soft ceiling once tokens render", () => {
    for (const t of MESSAGE_TEMPLATE_SEEDS) {
      // Tokens expand at send time, so measure the template with each token
      // replaced by a representative value rather than the raw `{{token}}`.
      const samples = new Map(variablesForKind(t.kind).map((v) => [v.token, v.sample]));
      const rendered = t.subject.replace(
        /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
        (_m, token: string) => samples.get(token) ?? "",
      );
      const max = CHANNEL_SUBJECT_SOFT_MAX[t.channel];
      expect(
        rendered.length,
        `${t.kind}:${t.channel} subject renders to ${rendered.length} chars (soft max ${max}): "${rendered}"`,
      ).toBeLessThanOrEqual(max);
    }
  });

  it("never puts a link in a push or inbox body — those channels carry the URL themselves", () => {
    for (const t of MESSAGE_TEMPLATE_SEEDS) {
      if (t.channel === "email") continue;
      expect(
        /\{\{\s*(taskUrl|boardUrl|siteUrl)\s*\}\}/.test(t.body),
        `${t.kind}:${t.channel} body embeds a link token`,
      ).toBe(false);
    }
  });

  it("gives every slot a non-empty name, subject and body", () => {
    for (const t of MESSAGE_TEMPLATE_SEEDS) {
      expect(t.name.trim().length, `${t.kind}:${t.channel}`).toBeGreaterThan(0);
      expect(t.subject.trim().length, `${t.kind}:${t.channel}`).toBeGreaterThan(0);
      expect(t.body.trim().length, `${t.kind}:${t.channel}`).toBeGreaterThan(0);
    }
  });
});
