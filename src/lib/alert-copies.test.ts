import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alertCopyRecipients, parseAlertCopy, type AlertCopy } from "./alert-copies";

const copy = (email: string, extra: Partial<AlertCopy> = {}): AlertCopy => ({ email, allClients: true, active: true, clientIds: [], ...extra });

describe("alertCopyRecipients (L5, Q93)", () => {
  it("keeps the identity's e-mail in copy, as before, when no address is recorded", () => {
    expect(alertCopyRecipients({ copies: [], clientId: "c1", base: ["labo@exemple.test"], to: ["client@exemple.test"] })).toEqual(["labo@exemple.test"]);
    expect(alertCopyRecipients({ copies: [], clientId: "c1", base: ["  "], to: [] })).toEqual([]);
  });

  it("adds every « tous les clients » address and those that chose this client", () => {
    const copies = [
      copy("direction@labo.test"),
      copy("qualite@labo.test", { allClients: false, clientIds: ["c1"] }),
      copy("autre@labo.test", { allClients: false, clientIds: ["c2"] }),
      copy("ancienne@labo.test", { allClients: null }),
    ];
    expect(alertCopyRecipients({ copies, clientId: "c1", base: ["labo@labo.test"], to: ["client@exemple.test"] })).toEqual([
      "labo@labo.test",
      "direction@labo.test",
      "qualite@labo.test",
      "ancienne@labo.test",
    ]);
    expect(alertCopyRecipients({ copies, clientId: "c2", base: [], to: [] })).toEqual(["direction@labo.test", "autre@labo.test", "ancienne@labo.test"]);
  });

  it("leaves out an inactive address, a duplicate, and one already among the recipients", () => {
    const copies = [copy("Direction@Labo.test"), copy("direction@labo.test"), copy("off@labo.test", { active: false }), copy("client@exemple.test")];
    expect(alertCopyRecipients({ copies, clientId: "c1", base: ["direction@labo.test"], to: ["CLIENT@exemple.test"] })).toEqual(["direction@labo.test"]);
  });
});

describe("parseAlertCopy", () => {
  it("reads one address for every client or for the clients chosen", () => {
    expect(parseAlertCopy({ email: " qualite@labo.test ", label: "  Qualité ", allClients: true, clientIds: ["c1"] })).toEqual({
      ok: true,
      value: { email: "qualite@labo.test", label: "Qualité", allClients: true, active: true, clientIds: [] },
    });
    expect(parseAlertCopy({ email: "q@labo.test", allClients: false, clientIds: ["c1", "c1", "c2"], active: false })).toEqual({
      ok: true,
      value: { email: "q@labo.test", label: null, allClients: false, active: false, clientIds: ["c1", "c2"] },
    });
  });

  it("refuses a wrong address, a missing choice, « clients choisis » without a client", () => {
    expect(parseAlertCopy({ email: "pas une adresse", allClients: true })).toEqual({ ok: false, error: "Adresse e-mail invalide." });
    expect(parseAlertCopy({ email: "", allClients: true })).toEqual({ ok: false, error: "Indiquez l'adresse e-mail." });
    expect(parseAlertCopy({ email: "q@labo.test" }).ok).toBe(false);
    expect(parseAlertCopy({ email: "q@labo.test", allClients: false, clientIds: [] })).toEqual({
      ok: false,
      error: "Choisissez au moins un client, ou « Tous les clients ».",
    });
    expect(parseAlertCopy({ email: "q@labo.test", allClients: false, clientIds: [3] }).ok).toBe(false);
    expect(parseAlertCopy(null).ok).toBe(false);
  });
});

describe("the dispatch copies them on every alert", () => {
  it("builds the alert's copy with alertCopyRecipients", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/report-dispatch.ts"), "utf8");
    expect(source).toMatch(/loadAlertCopies\(sample\.clientId\)/);
    expect(source).toMatch(/const cc = alertCopyRecipients\(\{ copies, clientId: sample\.clientId, base: \[company\.email\], to \}\)/);
  });
});
