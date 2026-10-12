import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPANY, type CompanyInfo } from "@/lib/company";
import { alertEmail, destructionEmail, reportEmail, signature, type ReportEmailInput } from "./templates";

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

describe("reportEmail — an amended report (AMENDEMENT.md §2.3)", () => {
  const amendment = {
    previousNumber: "RAP-2026-00001",
    previousIssuedAt: new Date("2026-10-07T10:00:00Z"),
    note: "Erreur de transcription du N° de lot",
  };

  it("reads « Rapport amendé … » in the subject, site included", () => {
    expect(reportEmail({ ...base, reportNumber: "RAP-2026-00001-A1", amendment }).subject).toBe(
      `Rapport amendé RAP-2026-00001-A1 — ${COMPANY.name}`
    );
    expect(reportEmail({ ...base, reportNumber: "RAP-2026-00001-A1", siteName: "Restaurant Test", amendment }).subject).toBe(
      `Rapport amendé RAP-2026-00001-A1 — Client Démo — Restaurant Test — ${COMPANY.name}`
    );
  });

  it("says which report it cancels and replaces, and why", () => {
    const { html } = reportEmail({ ...base, reportNumber: "RAP-2026-00001-A1", amendment });
    expect(html).toContain("rapport d'analyse amendé <b>RAP-2026-00001-A1</b>");
    expect(html).toContain("annule et remplace le rapport RAP-2026-00001 du");
    expect(html).toContain("Motif de l'amendement : Erreur de transcription du N° de lot");
  });

  it("escapes the reason", () => {
    const { html } = reportEmail({ ...base, amendment: { ...amendment, note: "<b>lot</b>" } });
    expect(html).toContain("&lt;b&gt;lot&lt;/b&gt;");
  });

  it("leaves an original report as it was", () => {
    for (const value of [undefined, null]) {
      const { subject, html } = reportEmail({ ...base, amendment: value });
      expect(subject).toBe(`Rapport d'analyse RA-2026-0001 — ${COMPANY.name}`);
      expect(html).not.toContain("amendé");
    }
  });
});

/** The identity saved on /admin/entreprise — a fixture, never the real laboratory's contacts. */
const saved: CompanyInfo = {
  ...COMPANY,
  name: "Laboratoire Test & Fils",
  phone: "+212 5 22 11 22 33",
  email: "contact@labo-test.example",
  address: "12 rue de l'Essai",
  city: "Rabat, Maroc",
};

describe("the e-mails sign with the identity of /admin/entreprise", () => {
  it("prints the given name, phone, e-mail and address, never the placeholders", () => {
    const block = signature(saved);
    expect(block).toContain("Laboratoire Test &amp; Fils");
    expect(block).toContain("Tél. +212 5 22 11 22 33");
    expect(block).toContain('href="mailto:contact@labo-test.example"');
    expect(block).toContain("12 rue de l'Essai · Rabat, Maroc");
    expect(block).not.toContain(COMPANY.phone);
    expect(block).not.toContain(COMPANY.email);
  });

  it("escapes every field: they are typed by an administrator", () => {
    const block = signature({
      ...saved,
      name: "<script>alert(1)</script>",
      phone: "05 <b>22</b>",
      email: 'x"onmouseover="alert(1)@labo.example',
      address: "Rue <i>A</i>",
      city: "Ville & Co",
    });
    expect(block).not.toContain("<script>");
    expect(block).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(block).toContain("05 &lt;b&gt;22&lt;/b&gt;");
    // The address cannot break out of the mailto attribute.
    expect(block).toContain('href="mailto:x&quot;onmouseover=&quot;alert(1)@labo.example"');
    expect(block).not.toContain('onmouseover="');
    expect(block).toContain("Rue &lt;i&gt;A&lt;/i&gt; · Ville &amp; Co");
  });

  it("leaves out a field left empty rather than printing a bare label", () => {
    const block = signature({ ...saved, phone: "  ", email: "", city: "" });
    expect(block).not.toContain("Tél.");
    expect(block).not.toContain("mailto:");
    expect(block).toContain("12 rue de l'Essai");
    expect(block).not.toContain(" · ");
  });

  it("signs the report e-mail and names the laboratory in its subject", () => {
    const { subject, html } = reportEmail(base, saved);
    expect(subject).toBe("Rapport d'analyse RA-2026-0001 — Laboratoire Test & Fils");
    expect(html).toContain("Laboratoire Test &amp; Fils");
    expect(html).toContain("contact@labo-test.example");
    expect(html).not.toContain(COMPANY.email);
  });

  it("signs the contamination alert", () => {
    const { html } = alertEmail(
      "Listeria",
      [{ produit: "Salade", site: "Cuisine", receivedAt: null, numeroLot: null, germe: "Listeria", resultat: "Présence", limite: "Absence", unit: null }],
      saved
    );
    expect(html).toContain("Tél. +212 5 22 11 22 33");
    expect(html).not.toContain(COMPANY.phone);
  });

  it("signs the notice of a line destroyed at reception, and names the laboratory in its subject", () => {
    const { subject, html } = destructionEmail(
      {
        serialNumber: "12/26",
        sampledAt: new Date("2026-10-07T08:00:00Z"),
        receivedAt: null,
        lines: [{ controlCode: "101/26", designation: "Salade", numeroLot: null, lieu: "Cuisine", motif: "Emballage non conforme" }],
      },
      saved
    );
    expect(subject).toBe("Échantillon non analysé — dossier 12/26 — Laboratoire Test & Fils");
    expect(html).toContain("contact@labo-test.example");
  });

  it("drops the subject's suffix when no name is saved", () => {
    expect(reportEmail(base, { ...saved, name: " " }).subject).toBe("Rapport d'analyse RA-2026-0001");
  });

  it("is fed by getCompany() in every sender, never by the placeholder default", () => {
    /** The text of each call of `fn(` in a file, up to its matching parenthesis. */
    const calls = (relative: string, fn: string) => {
      const text = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
      const found: string[] = [];
      for (let start = text.indexOf(`${fn}(`); start >= 0; start = text.indexOf(`${fn}(`, start + 1)) {
        if (/[\w.]/.test(text[start - 1] ?? "")) continue;
        let depth = 0;
        let end = start + fn.length;
        for (; end < text.length; end += 1) {
          if (text[end] === "(") depth += 1;
          if (text[end] === ")" && --depth === 0) break;
        }
        found.push(text.slice(start, end + 1));
      }
      return { text, found };
    };
    const dispatch = "../report-dispatch.ts";
    const destruction = "../destruction-notice.ts";
    for (const [file, fn] of [
      [dispatch, "reportEmail"],
      [dispatch, "alertEmail"],
      [destruction, "destructionEmail"],
    ] as const) {
      const { text, found } = calls(file, fn);
      expect(found.length, `${file} ${fn}`).toBe(1);
      expect(found[0], `${file} ${fn}`).toMatch(/,\s*company\s*\)$/);
      expect(text, file).toMatch(/await getCompany\(\)|getCompany\(\)\]\)/);
    }
  });
});
