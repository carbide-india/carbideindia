import { describe, expect, it } from "vitest";
import { parseEmails, resolveRecipients } from "@/lib/email/quotation-recipients";

/**
 * Who a quotation actually goes to.
 *
 * This is the one place in the app where a bug puts mail in front of a customer,
 * so the parsing and de-duplication are pinned rather than trusted. The CC field
 * is free text a salesperson pastes into, which is why the separators are
 * generous and the validation is not.
 */

describe("parseEmails", () => {
  it("accepts the separators people actually paste", () => {
    expect(parseEmails("a@x.com, b@x.com; c@x.com\nd@x.com e@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
      "e@x.com",
    ]);
  });

  it("lower-cases and de-duplicates", () => {
    expect(parseEmails("A@X.com, a@x.COM")).toEqual(["a@x.com"]);
  });

  it("drops anything that is not an address", () => {
    // A half-typed address must never reach Resend — the whole send fails on a
    // malformed recipient, so one typo would block a good quote.
    expect(parseEmails("notanemail, @x.com, a@, a@x, ok@x.com")).toEqual(["ok@x.com"]);
  });

  it("is empty for empty input", () => {
    expect(parseEmails(null)).toEqual([]);
    expect(parseEmails(undefined)).toEqual([]);
    expect(parseEmails("   ")).toEqual([]);
  });
});

describe("resolveRecipients", () => {
  it("puts the enquiry contact in To and its list in CC", () => {
    expect(
      resolveRecipients({ contactEmail: "buyer@acme.com", ccEmails: "boss@acme.com" }),
    ).toEqual({ to: ["buyer@acme.com"], cc: ["boss@acme.com"] });
  });

  it("never addresses the same person twice", () => {
    // Someone in both boxes would otherwise get two copies, and some providers
    // reject a duplicate across To and CC outright.
    expect(
      resolveRecipients({ contactEmail: "buyer@acme.com", ccEmails: "buyer@acme.com, x@acme.com" }),
    ).toEqual({ to: ["buyer@acme.com"], cc: ["x@acme.com"] });
  });

  it("merges what the sender typed in the dialog", () => {
    expect(
      resolveRecipients({
        contactEmail: "buyer@acme.com",
        ccEmails: null,
        extraTo: "second@acme.com",
        extraCc: "watch@carbideindia.com",
      }),
    ).toEqual({
      to: ["buyer@acme.com", "second@acme.com"],
      cc: ["watch@carbideindia.com"],
    });
  });

  it("a typed To beats the same address in CC", () => {
    expect(
      resolveRecipients({
        contactEmail: null,
        ccEmails: "buyer@acme.com",
        extraTo: "buyer@acme.com",
      }),
    ).toEqual({ to: ["buyer@acme.com"], cc: [] });
  });

  it("returns an empty To when the enquiry has no contact — the send is refused", () => {
    expect(resolveRecipients({ contactEmail: null, ccEmails: "cc@acme.com" })).toEqual({
      to: [],
      cc: ["cc@acme.com"],
    });
  });

  it("ignores junk in the stored fields", () => {
    expect(
      resolveRecipients({ contactEmail: "  BUYER@Acme.com ", ccEmails: "n/a, -, x@y.co" }),
    ).toEqual({ to: ["buyer@acme.com"], cc: ["x@y.co"] });
  });
});
