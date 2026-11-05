import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALERT_COPY_MESSAGES,
  alertCopyRecipients,
  copiesKind,
  internalCopyRecipients,
  parseAlertCopy,
  reportCopyRecipients,
  type AlertCopy,
} from "./alert-copies";

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
      value: { email: "qualite@labo.test", label: "Qualité", allClients: true, active: true, clientIds: [], forAlerts: true, forReports: false },
    });
    expect(parseAlertCopy({ email: "q@labo.test", allClients: false, clientIds: ["c1", "c1", "c2"], active: false })).toEqual({
      ok: true,
      value: { email: "q@labo.test", label: null, allClients: false, active: false, clientIds: ["c1", "c2"], forAlerts: true, forReports: false },
    });
  });

  it("L6 — reads what the address receives: the alerts, the reports or both; a page opened before L6 means the alerts only", () => {
    const both = parseAlertCopy({ email: "q@labo.test", allClients: true, forAlerts: true, forReports: true });
    expect(both.ok && both.value).toMatchObject({ forAlerts: true, forReports: true });
    const reports = parseAlertCopy({ email: "q@labo.test", allClients: true, forAlerts: false, forReports: true });
    expect(reports.ok && reports.value).toMatchObject({ forAlerts: false, forReports: true });
    const before = parseAlertCopy({ email: "q@labo.test", allClients: true });
    expect(before.ok && before.value).toMatchObject({ forAlerts: true, forReports: false });
    expect(parseAlertCopy({ email: "q@labo.test", allClients: true, forAlerts: false, forReports: false })).toEqual({
      ok: false,
      error: ALERT_COPY_MESSAGES.kind,
    });
    expect(parseAlertCopy({ email: "q@labo.test", allClients: true, forReports: "oui" })).toEqual({ ok: false, error: "Requête invalide." });
    expect(parseAlertCopy({ email: "q@labo.test", allClients: true, forAlerts: null })).toEqual({ ok: false, error: "Requête invalide." });
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

describe("L6 — the internal copies extended to the reports (RETOUR-LABO-04-11.md, R-16)", () => {
  it("reads an address of L5 (both flags null or absent) as the alerts only", () => {
    expect(copiesKind({}, "alerts")).toBe(true);
    expect(copiesKind({}, "reports")).toBe(false);
    expect(copiesKind({ forAlerts: null, forReports: null }, "alerts")).toBe(true);
    expect(copiesKind({ forAlerts: null, forReports: null }, "reports")).toBe(false);
    expect(copiesKind({ forAlerts: false, forReports: true }, "alerts")).toBe(false);
    expect(copiesKind({ forAlerts: false, forReports: true }, "reports")).toBe(true);
  });

  const copies = [
    copy("direction@labo.test", { forAlerts: true, forReports: true }),
    copy("qualite@labo.test", { forAlerts: false, forReports: true, allClients: false, clientIds: ["c1"] }),
    copy("alertes@labo.test"),
    copy("off@labo.test", { forReports: true, active: false }),
  ];

  it("copies a report to the addresses ticked « Rapports » — every client or the clients chosen — without the identity's e-mail", () => {
    expect(reportCopyRecipients({ copies, clientId: "c1", to: ["client@exemple.test"] })).toEqual(["direction@labo.test", "qualite@labo.test"]);
    expect(reportCopyRecipients({ copies, clientId: "c2", to: ["client@exemple.test"] })).toEqual(["direction@labo.test"]);
    expect(reportCopyRecipients({ copies: [], clientId: "c1", to: ["client@exemple.test"] })).toEqual([]);
  });

  it("never copies a report twice, nor to one of the client's own addresses", () => {
    const twice = [copy("Direction@Labo.test", { forReports: true }), copy("direction@labo.test", { forReports: true }), copy("client@exemple.test", { forReports: true })];
    expect(reportCopyRecipients({ copies: twice, clientId: "c1", to: ["CLIENT@exemple.test"] })).toEqual(["Direction@Labo.test"]);
  });

  it("leaves the alerts as they were: an address ticked « Rapports » only is no longer on them", () => {
    expect(alertCopyRecipients({ copies, clientId: "c1", base: ["labo@labo.test"], to: [] })).toEqual([
      "labo@labo.test",
      "direction@labo.test",
      "alertes@labo.test",
    ]);
    expect(internalCopyRecipients({ copies, clientId: "c1", base: [], to: [], kind: "reports" })).toEqual(reportCopyRecipients({ copies, clientId: "c1", to: [] }));
  });

  it("the two addresses of the laboratory: every client, both kinds — on every alert and every report", () => {
    const lab = [copy("adresse1@labo.test", { forAlerts: true, forReports: true }), copy("adresse2@labo.test", { forAlerts: true, forReports: true })];
    for (const clientId of ["c1", "c2"]) {
      expect(reportCopyRecipients({ copies: lab, clientId, to: ["client@exemple.test"] })).toEqual(["adresse1@labo.test", "adresse2@labo.test"]);
      expect(alertCopyRecipients({ copies: lab, clientId, base: [], to: ["client@exemple.test"] })).toEqual(["adresse1@labo.test", "adresse2@labo.test"]);
    }
  });
});

describe("the dispatch copies them on every alert and every report", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/report-dispatch.ts"), "utf8");

  it("builds the alert's copy with alertCopyRecipients", () => {
    expect(source).toMatch(/loadAlertCopies\(sample\.clientId\)/);
    expect(source).toMatch(/const cc = alertCopyRecipients\(\{ copies, clientId: sample\.clientId, base: \[company\.email\], to \}\)/);
  });

  it("L6 — copies the report on its first send and on every resend (one path), and journals the copy", () => {
    const send = source.slice(source.indexOf("async function sendReportNow"), source.indexOf("async function alertsAlreadySent"));
    expect(send).toMatch(/const cc = reportCopyRecipients\(\{ copies: await loadAlertCopies\(sample\.clientId\), clientId: sample\.clientId, to \}\)/);
    expect(send).toMatch(/sendEmail\(\{\s*to,\s*\.\.\.\(cc\.length > 0 \? \{ cc \} : \{\}\),[\s\S]*?type: "RAPPORT"/);
    expect(send).toMatch(/action: "REPORT_SENT"[\s\S]*?\.\.\.\(cc\.length > 0 \? \{ cc \} : \{\}\)/);
    // The first send and « Renvoyer au client » are the same function: no second path forgets the copy.
    expect(source.match(/type: "RAPPORT"/g)).toHaveLength(1);
  });

  it("the routes and the screen write both flags, and the migration is additive", () => {
    const create = readFileSync(join(process.cwd(), "src/app/api/admin/alert-copies/route.ts"), "utf8");
    const update = readFileSync(join(process.cwd(), "src/app/api/admin/alert-copies/[id]/route.ts"), "utf8");
    for (const route of [create, update]) {
      expect(route).toMatch(/forAlerts: value\.forAlerts,\s*forReports: value\.forReports,/);
    }
    const screen = readFileSync(join(process.cwd(), "src/components/admin/AlertCopiesManager.tsx"), "utf8");
    expect(screen).toContain("Copies internes (alertes et rapports)");
    const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261105020001_lot4b_copies_internes_rapports/migration.sql"), "utf8");
    expect(sql).toMatch(/ADD COLUMN `forAlerts` BOOLEAN NULL DEFAULT true,\s*ADD COLUMN `forReports` BOOLEAN NULL DEFAULT false;/);
    expect(sql).not.toMatch(/DROP|UPDATE|DELETE/i);
  });
});
