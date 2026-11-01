import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_SENDER_SETTINGS, addressOf, isNoReply, parseSenderSettings, senderHeaders } from "./email-sender";

const company = { name: "Labo Démo", email: "contact@labo.test" };

describe("senderHeaders (L4 — « Nous n'utilisons pas d'adresse no-reply ! »)", () => {
  it("sends from the mailbox set in /admin/entreprise, the laboratory's name beside it", () => {
    expect(
      senderHeaders({ settings: { ...EMPTY_SENDER_SETTINGS, emailSenderAddress: "rapports@labo.test" }, envFrom: "Autre <x@y.test>", company })
    ).toEqual({ from: "Labo Démo <rapports@labo.test>", replyTo: "contact@labo.test" });
  });

  it("falls back on EMAIL_FROM, then on the identity's own address — never a no-reply", () => {
    expect(senderHeaders({ settings: EMPTY_SENDER_SETTINGS, envFrom: "Qualilab <labo@labo.test>", company })).toEqual({
      from: "Qualilab <labo@labo.test>",
      replyTo: "contact@labo.test",
    });
    expect(senderHeaders({ settings: EMPTY_SENDER_SETTINGS, envFrom: "", company })).toEqual({ from: "Labo Démo <contact@labo.test>", replyTo: null });
    expect(senderHeaders({ settings: EMPTY_SENDER_SETTINGS, envFrom: undefined, company }).from).not.toMatch(/resend\.dev|no-?reply/i);
  });

  it("passes over an EMAIL_FROM still set to a no-reply, for the identity's mailbox", () => {
    expect(senderHeaders({ settings: EMPTY_SENDER_SETTINGS, envFrom: "Qualilab <no-reply@labo.test>", company })).toEqual({
      from: "Labo Démo <contact@labo.test>",
      replyTo: null,
    });
    expect(senderHeaders({ settings: EMPTY_SENDER_SETTINGS, envFrom: "noreply@labo.test", company }).from).toBe("Labo Démo <contact@labo.test>");
  });

  it("never builds « Nom <> » when the identity has no e-mail", () => {
    const blank = { name: "Labo Démo", email: "  " };
    expect(senderHeaders({ settings: EMPTY_SENDER_SETTINGS, envFrom: "Qualilab <labo@labo.test>", company: blank }).from).toBe("Qualilab <labo@labo.test>");
    // Only a no-reply configured: it is still an address — better than none.
    expect(senderHeaders({ settings: EMPTY_SENDER_SETTINGS, envFrom: "no-reply@labo.test", company: blank }).from).toBe("no-reply@labo.test");
    const none = senderHeaders({ settings: EMPTY_SENDER_SETTINGS, envFrom: null, company: blank }).from;
    expect(none).not.toMatch(/<\s*>/);
    expect(none).toMatch(/<[^>\s]+@[^>\s]+>$/);
  });

  it("answers to the Reply-To set, else the identity's e-mail when it differs from the sender", () => {
    const settings = { emailSenderAddress: "rapports@labo.test", emailSenderName: "Qualilab — Rapports", emailReplyTo: "qualite@labo.test" };
    expect(senderHeaders({ settings, envFrom: null, company })).toEqual({ from: "Qualilab — Rapports <rapports@labo.test>", replyTo: "qualite@labo.test" });
    expect(senderHeaders({ settings: { ...settings, emailReplyTo: "RAPPORTS@labo.test" }, envFrom: null, company }).replyTo).toBeNull();
  });

  it("quotes a display name holding a special character", () => {
    expect(senderHeaders({ settings: { ...EMPTY_SENDER_SETTINGS, emailSenderAddress: "a@labo.test", emailSenderName: "Labo, S.A.R.L" }, envFrom: null, company }).from).toBe(
      '"Labo, S.A.R.L" <a@labo.test>'
    );
  });
});

describe("parseSenderSettings", () => {
  it("reads the three fields, blank as cleared", () => {
    expect(parseSenderSettings({ emailSenderAddress: " labo@labo.test ", emailSenderName: "", emailReplyTo: null })).toEqual({
      ok: true,
      value: { emailSenderAddress: "labo@labo.test", emailSenderName: null, emailReplyTo: null },
    });
  });

  it("refuses a no-reply address and anything that is not one", () => {
    expect(parseSenderSettings({ emailSenderAddress: "no-reply@labo.test" })).toEqual({
      ok: false,
      error: "L'adresse d'expédition doit être une vraie boîte du laboratoire, pas une adresse « no-reply ».",
    });
    expect(parseSenderSettings({ emailReplyTo: "noreply@labo.test" }).ok).toBe(false);
    expect(parseSenderSettings({ emailSenderAddress: "labo" }).ok).toBe(false);
    expect(parseSenderSettings({ emailSenderName: 3 }).ok).toBe(false);
  });

  it("knows a no-reply when it sees one", () => {
    expect(isNoReply("No_Reply@x.test")).toBe(true);
    expect(isNoReply("ne-pas-repondre@x.test")).toBe(true);
    expect(isNoReply("reply@x.test")).toBe(false);
    expect(addressOf("Labo <a@b.test>")).toBe("a@b.test");
  });
});

describe("the send uses it", () => {
  it("hands From and Reply-To to the provider from senderHeaders, without the provider's test sender", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/email.ts"), "utf8");
    expect(source).toMatch(/senderHeaders\(/);
    expect(source).toMatch(/reply_to:/);
    expect(source).not.toMatch(/onboarding@resend\.dev/);
  });
});
