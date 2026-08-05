import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_KINDS,
  TEMPLATE_CHANNELS,
  defaultTemplate,
  extractTokens,
  isNotificationKind,
  isTemplateChannel,
  renderTemplate,
  sampleValuesForKind,
  slotKey,
  validateTemplate,
  variablesForKind,
} from "@/lib/templates/catalogue";

describe("extractTokens", () => {
  it("returns distinct tokens in first-appearance order", () => {
    expect(
      extractTokens("Hi {{recipientName}}, {{actorName}} pinged {{recipientName}}"),
    ).toEqual(["recipientName", "actorName"]);
  });

  it("tolerates padding inside the braces", () => {
    expect(extractTokens("{{  taskTitle  }}")).toEqual(["taskTitle"]);
  });

  it("ignores single braces and expressions", () => {
    expect(extractTokens("{taskTitle} {{a.b}} {{1bad}}")).toEqual([]);
  });
});

describe("validateTemplate", () => {
  it("accepts a template that only uses catalogue tokens", () => {
    const res = validateTemplate({
      kind: "task_assigned",
      subject: "New task: {{taskTitle}}",
      body: "Hi {{recipientName}}, due {{dueDate}}. {{taskUrl}}",
    });
    expect(res.ok).toBe(true);
    expect(res.unknownTokens).toEqual([]);
    expect(res.usedTokens).toContain("dueDate");
  });

  it("rejects a token that is not in the catalogue", () => {
    const res = validateTemplate({
      kind: "approved",
      subject: "ok",
      body: "Hello {{cusomterName}}",
    });
    expect(res.ok).toBe(false);
    expect(res.unknownTokens).toEqual(["cusomterName"]);
    expect(res.error).toContain("{{cusomterName}}");
  });

  it("rejects a token that belongs to a different kind", () => {
    // `dueDate` is only offered on task_assigned / task_initiated.
    const res = validateTemplate({
      kind: "cancelled",
      subject: "x",
      body: "{{dueDate}}",
    });
    expect(res.ok).toBe(false);
    expect(res.unknownTokens).toEqual(["dueDate"]);
  });

  it("rejects task tokens on the digest, which has no single task", () => {
    const res = validateTemplate({
      kind: "overdue_digest",
      subject: "x",
      body: "{{taskUrl}}",
    });
    expect(res.ok).toBe(false);
  });

  it("flags an unclosed placeholder", () => {
    const res = validateTemplate({
      kind: "approved",
      subject: "x",
      body: "Hi {{recipientName}, welcome",
    });
    expect(res.ok).toBe(false);
    expect(res.malformedCount).toBe(1);
    expect(res.error).toContain("malformed");
  });

  it("treats an empty template as valid — emptiness is a separate rule", () => {
    expect(validateTemplate({ kind: "approved", subject: "", body: "" }).ok).toBe(
      true,
    );
  });
});

describe("renderTemplate", () => {
  it("substitutes known tokens and leaves unknown ones visible", () => {
    expect(
      renderTemplate("Hi {{recipientName}} / {{nope}}", { recipientName: "Alok" }),
    ).toBe("Hi Alok / {{nope}}");
  });

  it("substitutes every occurrence", () => {
    expect(renderTemplate("{{a}}-{{a}}", { a: "x" })).toBe("x-x");
  });
});

describe("shipped defaults", () => {
  it("every kind × channel default validates against its own catalogue", () => {
    for (const kind of NOTIFICATION_KINDS) {
      for (const channel of TEMPLATE_CHANNELS) {
        const d = defaultTemplate(kind, channel);
        const res = validateTemplate({ kind, subject: d.subject, body: d.body });
        expect(res.error, `${kind}/${channel}`).toBeNull();
        expect(d.name.length).toBeGreaterThan(0);
        expect(d.body.trim().length).toBeGreaterThan(0);
        expect(d.subject.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every shipped default renders with no leftover placeholder", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const samples = sampleValuesForKind(kind);
      for (const channel of TEMPLATE_CHANNELS) {
        const d = defaultTemplate(kind, channel);
        const out = renderTemplate(`${d.subject}\n${d.body}`, samples);
        expect(out, `${kind}/${channel}`).not.toContain("{{");
      }
    }
  });
});

describe("catalogue shape", () => {
  it("gives every kind a non-empty, duplicate-free variable list", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const vars = variablesForKind(kind);
      expect(vars.length, kind).toBeGreaterThan(0);
      const tokens = vars.map((v) => v.token);
      expect(new Set(tokens).size, kind).toBe(tokens.length);
      for (const v of vars) expect(v.sample.length, `${kind}/${v.token}`).toBeGreaterThan(0);
    }
  });

  it("narrows hostile query-string values", () => {
    expect(isNotificationKind("task_assigned")).toBe(true);
    expect(isNotificationKind("drop table")).toBe(false);
    expect(isTemplateChannel("web_push")).toBe(true);
    expect(isTemplateChannel("sms")).toBe(false);
  });

  it("builds a stable slot key", () => {
    expect(slotKey("commented", "inbox")).toBe("commented:inbox");
  });
});
