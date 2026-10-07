import { describe, expect, it } from "vitest";
import { COMPANY } from "@/lib/company";
import { alertEmail, reportEmail, type ReportEmailInput } from "./templates";

const base: ReportEmailInput = {
  clientName: "Client Démo",
  reportNumber: "RA-2026-0001",
  serialNumber: "12/26",
  controlCode: "101/26",
  sampledAt: new Date("2026-10-07T08:00:00Z"),
  receivedAt: new Date("2026-10-07T10:00:00Z"),
  analyse: "Microbiologie des aliments",
  produit: "Salade composée",
  numeroLot: "L-77",
  lieu: "Cuisine",
  conclusion: "Satisfaisant",
  alert: false,
  indicative: false,
};

describe("reportEmail — the client's site (RETOUR-LABO-06-10.md §5, V5)", () => {
  it("names « Client — Site » in the subject and the summary table", () => {
    const { subject, html } = reportEmail({ ...base, siteName: "Restaurant Test" });
    expect(subject).toBe(`Rapport d'analyse RA-2026-0001 — Client Démo — Restaurant Test — ${COMPANY.name}`);
    expect(html).toContain(">Site</td>");
    expect(html).toContain("Client Démo — Restaurant Test");
  });

  it("keeps the subject and the table unchanged without a site", () => {
    for (const siteName of [undefined, null, "  "]) {
      const { subject, html } = reportEmail({ ...base, siteName });
      expect(subject).toBe(`Rapport d'analyse RA-2026-0001 — ${COMPANY.name}`);
      expect(html).not.toContain(">Site</td>");
    }
  });

  it("escapes the site in the body", () => {
    const { html } = reportEmail({ ...base, siteName: "<Site>" });
    expect(html).toContain("Client Démo — &lt;Site&gt;");
  });

  it("names the designation of a surface « Désignation », a food « Produit »", () => {
    expect(reportEmail(base).html).toContain(">Produit</td>");
    const { html } = reportEmail({ ...base, lineKind: "SURFACE", produit: "Planche verte — surface nettoyée" });
    expect(html).toContain(">Désignation</td>");
    expect(html).toContain("Planche verte — surface nettoyée");
    expect(html).not.toContain(">Produit</td>");
  });
});

describe("alertEmail", () => {
  it("prints the site of each product as given", () => {
    const { subject, html } = alertEmail("Listeria", [
      {
        produit: "Salade composée",
        site: "Restaurant Test — Cuisine",
        receivedAt: null,
        numeroLot: null,
        germe: "Listeria",
        resultat: "Présence",
        limite: "Absence",
        unit: "/25 g",
      },
    ]);
    expect(subject).toBe("Alerte de contamination par Listeria");
    expect(html).toContain("Restaurant Test — Cuisine");
  });
});
