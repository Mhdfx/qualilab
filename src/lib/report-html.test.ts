import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REPORT_DENSITIES,
  REPORT_LAYOUT_ALIGNED,
  REPORT_PDF_MARGIN,
  REPORT_PDF_MARGIN_MARKED,
  buildReportHtml,
  frozenVersionInForce,
  germFingerprints,
  germsToRealert,
  pdfPageCount,
  printedReceptionAt,
  printReport,
  reportCartouche,
  reportDataFromJson,
  reportDataToJson,
  reportDensity,
  reportFooterTemplate,
  reportPdfMargin,
  reportPdfParts,
  resultColumns,
  withSilentCorrection,
  type AlertReading,
  type ReportData,
} from "./report-html";
import { pageCss } from "./cartouche-html";
import { COMPANY, type CompanyInfo } from "./company";
import type { DocumentRef } from "./document-types";
import { REPORT_LEGEND, REPORT_NB } from "./report-template";

const base: ReportData = {
  number: "RA-2026-0001",
  controlCode: "00012/26",
  serialNumber: "0042/26",
  client: { name: "Client test", address: null, ice: null },
  produit: "Thon",
  numeroLot: "L1",
  lieu: "Chambre froide",
  type: "ALIMENTAIRE",
  sampledAt: new Date("2026-09-20T08:00:00Z"),
  receivedAt: new Date("2026-09-20T10:00:00Z"),
  preleveur: "Préleveur",
  technicianName: "Tech",
  validatorName: "Valid",
  approverName: "Admin",
  validatedAt: new Date("2026-09-21T10:00:00Z"),
  conclusion: "Conclusion.",
  interpretation: "ACCEPTABLE",
  regulation: "Critères microbiologiques des denrées alimentaires",
  unitCount: 5,
  results: [
    {
      parameter: "Flore totale",
      value: "2.10²",
      unit: "ufc/g",
      threshold: "m = 1.10² · M = 1.10³ ufc/g · c = 2",
      conform: true,
      note: null,
      interpretation: "ACCEPTABLE",
      norm: "NM ISO 4833-1 (2013)",
      criterion: { n: 5, c: 2, mKind: "VALUE", m: 100, bigM: 1000 },
      units: [
        { display: "50", value: 50, detected: null },
        { display: "2.10²", value: 200, detected: null },
        { display: "< 10", value: 0, detected: null },
        { display: "90", value: 90, detected: null },
        { display: "2.10³", value: 2000, detected: null },
      ],
    },
    {
      parameter: "Salmonella",
      value: "Absence",
      unit: "/25 g",
      threshold: "Absence /25 g",
      conform: true,
      note: null,
      interpretation: "SATISFAISANT",
      norm: "NM ISO 6579-1",
      criterion: { n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null },
      units: Array.from({ length: 5 }, () => ({ display: "Absence", value: null, detected: false })),
    },
    {
      parameter: "Levures",
      value: "< 10",
      unit: "ufc/g",
      threshold: null,
      conform: null,
      note: null,
      interpretation: null,
      norm: null,
      criterion: null,
      units: Array.from({ length: 5 }, () => ({ display: "< 10", value: 0, detected: null })),
    },
  ],
};

/** Every field of the template PG06/EN03 filled. */
const full: ReportData = {
  ...base,
  client: { name: "Client Démo", address: "Zone industrielle, lot 12", ice: null },
  siteName: "Restaurant Test",
  sampledByLab: true,
  samplingTimeDeclared: null,
  airMethod: null,
  productionDate: new Date(Date.UTC(2026, 8, 18)),
  expiryDate: new Date(Date.UTC(2026, 8, 28)),
  productTemperature: 3.5,
  receptionTemperature: 4.2,
  receptionTemperatureSource: "ECHANTILLON",
  coolerTemperature: 2.8,
  analysisFrom: new Date("2026-09-20T13:00:00Z"),
  analysisTo: new Date("2026-09-22T09:00:00Z"),
  issuedAt: new Date("2026-09-23T10:00:00Z"),
};

/** The same, issued with the aligned layout (lot 1b): the arrival and the denomination. */
const aligned: ReportData = {
  ...full,
  layout: REPORT_LAYOUT_ALIGNED,
  preleveur: "Technicien de QUALILAB 'P.TEST'",
  arrivedAt: new Date("2026-09-20T09:15:00Z"),
  // The single « Date d'analyse »: the bench's take (`analysisStart`).
  analysisFrom: new Date("2026-09-21T07:30:00Z"),
};

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The visible text, tags dropped, as a text extractor reads the printed page. */
function textOf(html: string) {
  return html
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<br>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2060;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The two sheets of the page: page 1 and the annex. */
function sheets(html: string) {
  const annex = html.indexOf('<section class="sheet annex">');
  return { page1: html.slice(0, annex), annex: html.slice(annex) };
}

describe("buildReportHtml — the template PG06/EN03 version M, page 1", () => {
  it("prints the template's labels in its order", () => {
    const text = textOf(sheets(buildReportHtml(full)).page1);
    const labels = [
      "RAPPORT D'ANALYSES RA-2026-0001",
      "N° de série : 0042/26",
      "Client Client Démo",
      "Produit (IC) : Thon",
      "Prélèvement et réception",
      "Données fournies par le client (IC)",
      "Date et heure du Prélèvement : 20/09/2026 à 08h00",
      "Lot : L1",
      "Date et heure de réception : 20/09/2026 à 10h00",
      "Préleveur : Préleveur",
      "Dates Prod : 18/09/2026",
      "Référence prélèvement PG04/EN01 & PG04/IT03",
      "Moyen de prélèvement : —",
      "Dates Exp : 28/09/2026",
      "Site de prélèvement : Client Démo — Restaurant Test",
      "Information sur l'échantillon",
      "Lieu du prélèvement : Chambre froide",
      "Température du produit : Au prélèvement : 3,5 °C à la réception : 4,2 °C",
      "Lieu d'exécution : Laboratoire permanent Casablanca",
      "Température glacière à la réception : 2,8 °C",
      "Date d'analyse : du 20/09/2026 au 22/09/2026",
      "Date d'édition de rapport : 23/09/2026",
      "N° de contrôle : 00012/26",
      "Paramètres Méthode Unité Résultats R1 R2 R3 R4 R5",
      "Responsable Technique Valid",
      "Direction Admin",
    ];
    let from = 0;
    for (const label of labels) {
      const at = text.indexOf(label, from);
      expect(at, label).toBeGreaterThanOrEqual(from);
      from = at + label.length;
    }
  });

  it("frames the client: name, site and address, no ICE", () => {
    const html = buildReportHtml(full);
    expect(html).toContain('<div class="client-label">Client</div>');
    expect(html).toContain('<div class="client-name">Client Démo</div>');
    expect(html).toContain('<div class="client-line">Site : Restaurant Test</div>');
    expect(html).toContain('<div class="client-line">Zone industrielle, lot 12</div>');
    expect(buildReportHtml(base)).not.toContain("Site :");
    expect(buildReportHtml({ ...full, client: { ...full.client, ice: "001234567000045" } })).not.toContain("001234567000045");
  });

  it("signs with the technical validator and whoever signed the administrative validation — never a fixed name", () => {
    const html = buildReportHtml({ ...full, validatorName: "Validatrice Une", approverName: "Suppléant Deux" });
    expect(html).toContain('<div>Responsable Technique</div><div class="name">Validatrice Une</div>');
    expect(html).toContain('<div>Direction</div><div class="name">Suppléant Deux</div>');
    const unsigned = buildReportHtml({ ...full, validatorName: null, approverName: null });
    expect(unsigned).toContain('<div>Direction</div><div class="name">—</div>');
    // The template has no line for the analyst.
    expect(html).not.toContain(">Tech<");
  });

  it("reads the sampling time « Non déclarée » on a deposit that did not declare it (C1)", () => {
    const html = buildReportHtml({ ...full, samplingTimeDeclared: false });
    expect(textOf(html)).toContain("Date et heure du Prélèvement : Non déclarée");
    expect(textOf(html)).not.toContain("20/09/2026 à 08h00");
  });

  it("prints the plate's duration in « Moyen de prélèvement » (16/10, Q50)", () => {
    const air = { ...full, lineKind: "AIR" as const, type: "AMBIANCE" as const, produit: "Salle" };
    expect(textOf(buildReportHtml({ ...air, airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: 45 }))).toContain(
      "Moyen de prélèvement : Boîte exposée 45 min"
    );
    // A version frozen before the duration existed (no field) reads the 30 min its method carried.
    expect(textOf(buildReportHtml({ ...air, airMethod: "BOITE_EXPOSEE_30MIN" }))).toContain(
      "Moyen de prélèvement : Boîte exposée 30 min"
    );
  });

  it("prints the air instruction and its means for an air sample", () => {
    const text = textOf(buildReportHtml({ ...full, lineKind: "AIR", type: "AMBIANCE", airMethod: "BIOCOLLECTEUR", produit: "Salle" }));
    expect(text).toContain("Référence prélèvement PG04/EN01 & PG04/IT03 Prélèvement de l'air : PG06/IT55 Moyen de prélèvement : Biocollecteur");
    expect(text).toContain("Désignation (IC) : Salle");
    expect(textOf(buildReportHtml(full))).not.toContain("PG06/IT55");
  });

  it("does not claim the laboratory's sampling procedures for a sample it did not take", () => {
    const text = textOf(buildReportHtml({ ...full, sampledByLab: false, preleveur: "Le client" }));
    expect(text).toContain("Référence prélèvement : N/A (prélèvement non effectué par le laboratoire)");
    expect(text).not.toContain("PG04/EN01");
    expect(text).toContain("Préleveur : Le client");
  });

  it("keeps a reading taken on the cooler for the cooler, and marks a witness bottle", () => {
    const cooler = textOf(buildReportHtml({ ...full, receptionTemperatureSource: "GLACIERE", coolerTemperature: null }));
    expect(cooler).toContain("à la réception : —");
    expect(cooler).toContain("Température glacière à la réception : 4,2 °C");
    const witness = textOf(buildReportHtml({ ...full, receptionTemperatureSource: "FLACON_TEMOIN" }));
    expect(witness).toContain("à la réception : 4,2 °C (flacon témoin)");
  });

  it("prints a version frozen before the template: its new fields read « — »", () => {
    const text = textOf(buildReportHtml(base));
    for (const label of ["Dates Prod : —", "Dates Exp : —", "Date d'analyse : —", "Date d'édition de rapport : —", "Température glacière à la réception : —"]) {
      expect(text).toContain(label);
    }
    // Who sampled is not known: the laboratory's procedures are not claimed (it may be a deposit).
    expect(text).toContain("Référence prélèvement : — Moyen de prélèvement : —");
    expect(text).not.toContain("PG04/EN01");
  });

  it("escapes every value it prints", () => {
    const html = buildReportHtml({ ...full, client: { name: "<b>X</b>", address: "<i>", ice: null }, lieu: "<script>", numeroLot: "a&b" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>X</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a&amp;b");
  });
});

describe("buildReportHtml — the aligned layout (lot 1b, RETOUR-LABO-16-10.md D5)", () => {
  it("prints page 1's block as the laboratory's own report: labels, « JJ/MM/AAAA HH:MM », one analysis date, the arrival", () => {
    const text = textOf(sheets(buildReportHtml(aligned)).page1);
    const labels = [
      "Produit (IC) : Thon",
      "Date et heure du Prélèvement : 20/09/2026 08:00",
      "Lot : L1",
      // The arrival typed on the série, not the reception screen's 10:00.
      "Date et heure de réception : 20/09/2026 09:15",
      "Préleveur : Technicien de QUALILAB 'P.TEST'",
      "Date Prod : 18/09/2026",
      "Référence prélèvement PG04/EN01 & PG04/IT03",
      "Moyen de prélèvement : N/A",
      "Date Exp : 28/09/2026",
      "Site de prélèvement : Client Démo — Restaurant Test",
      "Lieu de prélèvement : Chambre froide",
      "Température du produit : Au prélèvement : 3,5 °C à la réception : 4,2 °C",
      "Température glacière à la réception : 2,8 °C",
      "Date d'analyse : 21/09/2026",
      "Date d'édition de rapport : 23/09/2026",
      "N° de contrôle : 00012/26",
    ];
    let from = 0;
    for (const label of labels) {
      const at = text.indexOf(label, from);
      expect(at, label).toBeGreaterThanOrEqual(from);
      from = at + label.length;
    }
    for (const old of ["Dates Prod", "Dates Exp", "Lieu du prélèvement", " à 08h00", "du 21/09/2026", "20/09/2026 10:00"]) {
      expect(text, old).not.toContain(old);
    }
  });

  it("prints the annex's sampling table the same way", () => {
    const text = textOf(sheets(buildReportHtml(aligned)).annex);
    expect(text).toContain(
      "Prélèvement et réception Date et heure du Prélèvement : 20/09/2026 08:00 Date et heure de réception : 20/09/2026 09:15 Préleveur : Technicien de QUALILAB 'P.TEST' Site de prélèvement : Client Démo — Restaurant Test"
    );
  });

  it("prints « N/A » for every empty field of the block — never « — »", () => {
    const empty: ReportData = {
      ...aligned,
      produit: null,
      numeroLot: null,
      lieu: "",
      controlCode: null,
      receivedAt: null,
      arrivedAt: null,
      productionDate: null,
      expiryDate: null,
      productTemperature: null,
      receptionTemperature: null,
      coolerTemperature: null,
      analysisFrom: null,
      issuedAt: null,
    };
    const { page1, annex } = sheets(buildReportHtml(empty));
    const text = textOf(page1);
    for (const label of [
      "Produit (IC) : N/A",
      "Date et heure de réception : N/A",
      "Lot : N/A",
      "Date Prod : N/A",
      "Moyen de prélèvement : N/A",
      "Date Exp : N/A",
      "Lieu de prélèvement : N/A",
      "Au prélèvement : N/A",
      "à la réception : N/A",
      "Température glacière à la réception : N/A",
      "Date d'analyse : N/A",
      "Date d'édition de rapport : N/A",
      "N° de contrôle : N/A",
    ]) {
      expect(text, label).toContain(label);
    }
    // No empty value of the block prints « — » (the site's separator is not one).
    const start = page1.indexOf('<table class="info">');
    expect(page1.slice(start, page1.indexOf("</table>", start))).not.toMatch(/: (<b>)?—/);
    expect(textOf(annex)).toContain("Date et heure de réception : N/A");
    // A préleveur is never empty in practice: « N/A » all the same.
    expect(textOf(buildReportHtml({ ...empty, preleveur: "" }))).toContain("Préleveur : N/A");
  });

  it("keeps the words that are not empty fields: an undeclared time, a sample the laboratory did not take, the air means", () => {
    expect(textOf(buildReportHtml({ ...aligned, samplingTimeDeclared: false }))).toContain("Date et heure du Prélèvement : Non déclarée");
    const client = textOf(buildReportHtml({ ...aligned, sampledByLab: false, preleveur: "Le client" }));
    expect(client).toContain("Référence prélèvement : N/A (prélèvement non effectué par le laboratoire) Moyen de prélèvement : N/A");
    expect(client).toContain("Préleveur : Le client");
    const air = { ...aligned, lineKind: "AIR" as const, type: "AMBIANCE" as const, produit: "Salle" };
    expect(textOf(buildReportHtml({ ...air, airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: 45 }))).toContain(
      "Moyen de prélèvement : Boîte exposée 45 min"
    );
    expect(textOf(buildReportHtml({ ...air, airMethod: null }))).toContain("Moyen de prélèvement : N/A");
  });

  it("falls back to the reception screen's instant when no arrival was typed", () => {
    expect(textOf(buildReportHtml({ ...aligned, arrivedAt: null }))).toContain("Date et heure de réception : 20/09/2026 10:00");
  });

  it("prints a version without the marker as on 13/10, word for word — an arrival stored or not", () => {
    const old = { ...full, arrivedAt: new Date("2026-09-20T09:15:00Z") };
    const text = textOf(buildReportHtml(old));
    for (const label of [
      "Date et heure du Prélèvement : 20/09/2026 à 08h00",
      "Date et heure de réception : 20/09/2026 à 10h00",
      "Dates Prod : 18/09/2026",
      "Moyen de prélèvement : —",
      "Dates Exp : 28/09/2026",
      "Lieu du prélèvement : Chambre froide",
      "Date d'analyse : du 20/09/2026 au 22/09/2026",
    ]) {
      expect(text, label).toContain(label);
    }
    expect(text).not.toContain("N/A");
    expect(buildReportHtml(old)).toBe(buildReportHtml(full));
  });

  it("reads the reception the report prints, for the e-mail too", () => {
    expect(printedReceptionAt(aligned)).toEqual(new Date("2026-09-20T09:15:00Z"));
    expect(printedReceptionAt({ ...aligned, arrivedAt: null })).toEqual(full.receivedAt);
    // Without the marker: the reception screen's instant, an arrival stored or not.
    expect(printedReceptionAt({ ...full, arrivedAt: new Date("2026-09-20T09:15:00Z") })).toEqual(full.receivedAt);
  });

  it("weighs a long denomination in the density's guess, on the aligned layout only", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ ...base.results[0], parameter: `Germe ${i}`, units: [], criterion: null }));
    const short = { ...aligned, results: rows, unitCount: 1 };
    const long = { ...short, preleveur: "Technicien de QUALILAB ".repeat(8) };
    expect(reportDensity(short)).toBe("");
    expect(reportDensity(long)).not.toBe("");
    expect(reportDensity({ ...long, layout: undefined })).toBe("");
  });
});

describe("buildReportHtml — the results of page 1", () => {
  it("colours a unit tolerated above a single limit amber, not red (Q31)", () => {
    const html = buildReportHtml({
      ...base,
      results: [{
        ...base.results[0],
        interpretation: "ACCEPTABLE",
        criterion: { n: 5, c: 1, mKind: "VALUE", m: 100, bigM: 100 },
        units: [{ display: "150", value: 150, detected: null }, ...Array.from({ length: 4 }, () => ({ display: "< 10", value: 0, detected: null }))],
      }],
    });
    expect(html).toContain('<td class="rep mid">150</td>');
  });

  it("prints an uncountable plate and « > x » as typed, red when over the limit", () => {
    const html = buildReportHtml({
      ...base,
      interpretation: "NON_SATISFAISANT",
      results: [{
        ...base.results[0],
        value: "Indénombrable",
        interpretation: "NON_SATISFAISANT",
        units: [
          { display: "Indénombrable", value: null, detected: true },
          { display: "> 1000", value: 1000, detected: null },
          ...Array.from({ length: 3 }, () => ({ display: "< 10", value: 0, detected: null })),
        ],
      }],
    });
    // As typed, with a soft hyphen so it wraps inside its R column.
    expect(html).toContain('<td class="rep word no">Indénom­brable</td>');
    expect(html).toContain("td.rep.word { font-size: .9em; overflow-wrap: anywhere; }");
    expect(html).not.toContain("Détecté");
    // « > 1000 » reaches M = 1000: above it.
    expect(html).toContain('<td class="rep no">&gt; 1000</td>');
  });

  it("lets every uncountable spelling wrap in its R column, letters as typed", () => {
    const html = buildReportHtml({
      ...base,
      interpretation: "NON_SATISFAISANT",
      results: [{
        ...base.results[0],
        value: "TNTC",
        interpretation: "NON_SATISFAISANT",
        units: ["indenombrable", "INCOMPTABLE", "TNTC", "T.N.T.C.", "< 10"].map((display) =>
          display === "< 10" ? { display, value: 0, detected: null } : { display, value: null, detected: true }
        ),
      }],
    });
    expect(html).toContain('<td class="rep word no">indenom­brable</td>');
    expect(html).toContain('<td class="rep word no">INCOMP­TABLE</td>');
    expect(html).toContain('<td class="rep word no">TNTC</td>');
    expect(html).toContain('<td class="rep word no">T.N.T.C.</td>');
    expect(html).toContain('<td class="rep ">&lt; 10</td>');
  });

  it("never prints the famille de produits — internal to the laboratory (Q34), under its old name or its new one (Q120)", () => {
    const html = buildReportHtml(base);
    expect(html).not.toContain("Type de produit");
    expect(html).not.toMatch(/famille de produits/i);
  });

  it("prints one column per repetition under « Résultats », with the method", () => {
    const { page1 } = sheets(buildReportHtml(base));
    expect(page1).toContain('<th colspan="5" class="rep">Résultats</th>');
    for (const r of ["R1", "R2", "R3", "R4", "R5"]) expect(page1).toContain(`<th class="rep">${r}</th>`);
    expect(page1).toContain("NM ISO 4833-1 (2013)");
    // A unit above M is red, one between m and M amber.
    expect(page1).toContain('<td class="rep no">2.10<sup>3</sup></td>');
    expect(page1).toContain('<td class="rep mid">2.10<sup>2</sup></td>');
    // The criteria are the annex's, not page 1's.
    expect(page1).not.toContain("Critères");
  });

  it("reads an absence test « Non détecté »", () => {
    expect(count(sheets(buildReportHtml(base)).page1, "Non détecté")).toBe(5);
  });

  it("continues the repetitions in a second band beyond ten, its R columns as wide as the first's", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ display: String(i + 1), value: i + 1, detected: null }));
    const html = buildReportHtml({
      ...base,
      unitCount: 12,
      results: [{ ...base.results[0], units: twelve, criterion: { n: 12, c: 2, mKind: "VALUE", m: 100, bigM: 1000 } }],
    });
    expect(count(html, '<table class="results">')).toBe(2);
    expect(html).toContain('<th class="rep">R11</th>');
    expect(html).toContain("Paramètres (suite)");
    const rep = resultColumns(10).rep;
    expect(html).toContain(`<col style="width:${Math.round((100 - rep * 2) * 100) / 100}%"><col style="width:${rep}%"><col style="width:${rep}%">`);
  });

  it("keeps the template's single « Résultats » column for a sample read once", () => {
    const html = buildReportHtml({
      ...base,
      interpretation: null,
      unitCount: 1,
      results: [{ ...base.results[2], units: [], value: "1,2.10²", conform: false, threshold: "< 10 ufc/g" }],
    });
    expect(html).toContain('<th class="rep">Résultats</th>');
    expect(html).toContain('<col style="width:43%"><col style="width:18%"><col style="width:9%"><col style="width:30%">');
    expect(html).toContain('<td class="rep no">1,2.10<sup>2</sup></td>');
    // The catalogue limit stands in the annex's criteria.
    expect(sheets(html).annex).toContain('<td class="crit" colspan="2">&lt; 10 ufc/g</td>');
  });
});

describe("resultColumns — the widths of page 1's results", () => {
  it("adds up to the page's width whatever the number of repetitions", () => {
    for (let n = 0; n <= 10; n += 1) {
      const w = resultColumns(n);
      const total = w.param + w.method + w.unit + w.rep * Math.max(1, n);
      expect(total, `n = ${n}`).toBeGreaterThan(99.9);
      expect(total, `n = ${n}`).toBeLessThan(100.1);
      expect(w.param, `n = ${n}`).toBeGreaterThan(w.method);
    }
  });

  it("gives the repetitions at most 55 % of the width", () => {
    expect(resultColumns(9).rep * 9).toBeLessThanOrEqual(55.01);
    expect(resultColumns(10).rep * 10).toBeLessThanOrEqual(55.01);
    expect(resultColumns(1).rep).toBe(17);
  });
});

describe("buildReportHtml — the annex « Interprétation des résultats »", () => {
  it("prints the annex's labels in its order, on a page of its own", () => {
    const html = buildReportHtml(full);
    expect(html).toContain(".sheet + .sheet { break-before: page; page-break-before: always; }");
    // « -ANNEXE- » never ends its line on a bare hyphen (a text extractor would join it to the next).
    expect(html).toContain('<div class="annex-title">-ANNEXE-&#x2060;<br>Interprétation des résultats</div>');
    const text = textOf(sheets(html).annex);
    const labels = [
      "-ANNEXE- Interprétation des résultats",
      "N° de série : 0042/26",
      "Rapport d'analyses RA-2026-0001",
      "Client Client Démo",
      "Prélèvement et réception",
      "Date et heure du Prélèvement : 20/09/2026 à 08h00",
      "Date et heure de réception : 20/09/2026 à 10h00",
      "Préleveur : Préleveur",
      "Site de prélèvement : Client Démo — Restaurant Test",
      "(Nombre d'analyse/échantillon = 5)",
      "Produit (IC) N° de contrôle Satisfaisant Acceptable Non satisfaisant",
      "Thon 00012/26",
      "Réglementation en vigueur : Critères microbiologiques des denrées alimentaires",
      "Paramètres Méthode Unité Critères m M",
      "Flore totale NM ISO 4833-1 (2013) ufc/g 1.10 2 1.10 3 n = 5 · c = 2",
      "Salmonella NM ISO 6579-1 /25 g Absence n = 5",
      "Levures — ufc/g Non spécifié",
      "Conclusion : Conclusion.",
    ];
    let from = 0;
    for (const label of labels) {
      const at = text.indexOf(label, from);
      expect(at, label).toBeGreaterThanOrEqual(from);
      from = at + label.length;
    }
  });

  it("ticks the verdict under its column — the template's two, « Acceptable » only for an acceptable sample", () => {
    const acceptable = sheets(buildReportHtml(base)).annex;
    expect(acceptable).toMatch(/<td class="x mid">X<\/td>/);
    expect(count(acceptable, ">X<")).toBe(1);
    expect(acceptable).toContain("<th>Acceptable</th>");

    const satisfying = sheets(buildReportHtml({ ...base, interpretation: "SATISFAISANT" })).annex;
    expect(satisfying).toMatch(/<td class="x ok">X<\/td><td class="x no"><\/td>/);
    expect(satisfying).not.toContain("Acceptable");

    const failing = sheets(buildReportHtml({ ...base, interpretation: "NON_SATISFAISANT" })).annex;
    expect(failing).toMatch(/<td class="x ok"><\/td><td class="x no">X<\/td>/);
  });

  it("ticks nothing when there is no official verdict", () => {
    const html = buildReportHtml({ ...base, interpretation: null });
    expect(html).toContain("Réglementation en vigueur");
    expect(count(html, ">X<")).toBe(0);
  });

  it("reads « (Nombre d'analyse/échantillon = 1) » for a sample read once", () => {
    const html = buildReportHtml({ ...base, unitCount: 1, results: [{ ...base.results[2], units: [] }] });
    expect(html).toContain("(Nombre d'analyse/échantillon = 1)");
  });

  it("prints the conclusion in red when the sample is non satisfaisant or a result non conforme", () => {
    expect(buildReportHtml({ ...base, interpretation: "NON_SATISFAISANT" })).toContain('<span class="alert">Conclusion.</span>');
    expect(buildReportHtml({ ...base, results: [{ ...base.results[0], conform: false }] })).toContain('<span class="alert">');
    expect(buildReportHtml(base)).not.toContain('<span class="alert">');
  });
});

describe("buildReportHtml — amendment and duplicate (AMENDEMENT.md)", () => {
  const amended: ReportData = {
    ...base,
    number: "RAP-2026-00001-A1",
    amendment: {
      previousNumber: "RAP-2026-00001",
      previousIssuedAt: new Date("2026-10-07T10:00:00Z"),
      note: "Erreur de transcription du N° de lot",
    },
  };

  it("prints « Rapport amendé — annule et remplace … », the reason, and « (VC) » after the number", () => {
    const html = buildReportHtml(amended);
    expect(html).toContain("<b>Rapport amendé</b> — annule et remplace le rapport RAP-2026-00001 du");
    expect(html).toMatch(/Motif de l(&#39;|&#x27;|')amendement : Erreur de transcription du N° de lot/);
    expect(html).toContain(`<h1>RAPPORT D'ANALYSES <b>RAP-2026-00001-A1</b> <span class="vc">(VC)</span></h1>`);
    expect(html.indexOf('<div class="amended">')).toBeGreaterThan(html.indexOf("<h1>"));
    expect(html.indexOf('<div class="amended">')).toBeLessThan(html.indexOf('<div class="idrow">'));
  });

  it("prints no amendment block on an original report", () => {
    for (const data of [base, { ...base, amendment: null }]) {
      const html = buildReportHtml(data);
      expect(html).not.toContain('<div class="amended">');
      expect(html).not.toContain("Rapport amendé");
      expect(html).not.toContain("(VC)");
    }
  });

  it("marks a duplicate « DUPLICATA — édité le … » at the head of page 1 and the foot of every page", () => {
    const marks = { duplicataAt: new Date("2026-10-08T09:00:00Z") };
    const html = buildReportHtml(base, marks);
    expect(count(html, "DUPLICATA — édité le")).toBe(1);
    expect(html).toContain('<span class="mark duplicata">');
    expect(count(reportFooterTemplate(COMPANY, marks), "DUPLICATA — édité le")).toBe(1);
    expect(buildReportHtml(base)).not.toContain("DUPLICATA");
    expect(reportFooterTemplate(COMPANY)).not.toContain("DUPLICATA");
  });

  it("marks a superseded version, and a reconstructed one", () => {
    const marks = { supersededBy: "RAP-2026-00001-A1", reconstructed: true };
    const html = buildReportHtml(base, marks);
    expect(html).toContain('<span class="mark superseded">Version remplacée par RAP-2026-00001-A1</span>');
    expect(html).toContain('<span class="mark superseded">Version reconstituée</span>');
    expect(reportFooterTemplate(COMPANY, marks)).toContain("Version remplacée par RAP-2026-00001-A1");
    expect(buildReportHtml(base, { supersededBy: "RAP-2026-00001-A2" })).not.toContain("reconstituée");
  });

  it("escapes the reason", () => {
    const html = buildReportHtml({ ...amended, amendment: { ...amended.amendment!, note: "<script>" } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("the page box, the cartouche and the footer", () => {
  const reference: DocumentRef = {
    docType: "RAPPORT",
    reference: "PG06/EN03",
    version: "M",
    createdOn: new Date(Date.UTC(2006, 0, 5)),
    updatedOn: new Date(Date.UTC(2023, 11, 18)),
  };

  it("declares in @page the very margins handed to page.pdf(), taller at the foot with a print's marks", () => {
    const plain = reportPdfParts({ data: base, company: COMPANY, reference, logoDataUri: null });
    expect(plain.margin).toBe(REPORT_PDF_MARGIN);
    expect(plain.html).toContain(pageCss(REPORT_PDF_MARGIN));
    const marks = { duplicataAt: new Date("2026-10-08T09:00:00Z") };
    const dup = reportPdfParts({ data: base, company: COMPANY, reference, logoDataUri: null, marks });
    expect(dup.margin).toBe(REPORT_PDF_MARGIN_MARKED);
    expect(dup.html).toContain(pageCss(REPORT_PDF_MARGIN_MARKED));
    expect(dup.html).not.toContain(pageCss(REPORT_PDF_MARGIN));
    expect(reportPdfMargin({ supersededBy: "X" })).toBe(REPORT_PDF_MARGIN_MARKED);
    expect(parseFloat(REPORT_PDF_MARGIN_MARKED.bottom)).toBeGreaterThan(parseFloat(REPORT_PDF_MARGIN.bottom));
    // Only the foot changes: the cartouche's top and the forms' sides.
    expect({ ...REPORT_PDF_MARGIN_MARKED, bottom: "" }).toEqual({ ...REPORT_PDF_MARGIN, bottom: "" });
    expect(REPORT_PDF_MARGIN.top).toBe("34mm");
  });

  it("grows the foot by a line for each line a long identity field wraps to — in @page and page.pdf() alike", () => {
    // « Adresse : » + 300 characters: two lines more than the template's one.
    const long: CompanyInfo = { ...COMPANY, address: "Rue ".repeat(75), city: "Ville" };
    const parts = reportPdfParts({ data: base, company: long, reference, logoDataUri: null });
    expect(parseFloat(parts.margin.bottom)).toBeCloseTo(parseFloat(REPORT_PDF_MARGIN.bottom) + 2 * 2.8, 5);
    expect(parts.html).toContain(pageCss(parts.margin));
    expect(reportPdfMargin({ duplicataAt: new Date() }, long).bottom).toBe(`${parseFloat(REPORT_PDF_MARGIN_MARKED.bottom) + 5.6}mm`);
  });

  it("heads every page with the template's cartouche, in black, from the RAPPORT row", () => {
    const header = reportCartouche(reference, null);
    expect(header).toContain(">Rapport d'essai</td>");
    expect(header).toContain("Réf : PG06/EN03");
    expect(header).toContain("Version M<br>Page <span class=\"pageNumber\"></span> sur <span class=\"totalPages\"></span>");
    expect(header).toContain(">Date de création<br>05/01/2006</td>");
    expect(header).toContain(">Dernière mise à jour<br>18/12/2023</td>");
    expect(header).toContain("border:1px solid #000000");
    expect(header).not.toContain("#1e3a8a");
  });

  it("prints the legend and the « N.B » block word for word on every page", () => {
    const footer = reportFooterTemplate(COMPANY);
    expect(footer).not.toContain("<style");
    for (const line of REPORT_LEGEND) expect(footer).toContain(line.replace(/'/g, "'"));
    const text = textOf(footer);
    for (const line of REPORT_NB) expect(text).toContain(`${line.lead ?? ""}${line.text}`.replace(/\s+/g, " ").trim());
    expect(footer).toContain("<b>N.B</b> : les résultats ne se rapportent qu'aux objets soumis à l'essai et tel qu'ils ont été reçu.");
    expect(footer).toContain("<b>Les résultats ne tiennent pas compte des incertitudes. Elles sont disponibles sur demande.</b>");
    expect(footer).toContain("Le <b>laboratoire est exonéré");
  });

  it("builds the legal footer from /admin/entreprise, leaving out what is empty", () => {
    const company: CompanyInfo = {
      ...COMPANY,
      name: "Labo Démo S.A.R.L",
      address: "1 rue Test",
      city: "Ville",
      phone: "05 00",
      email: "x@test.invalid",
      website: "www.test.invalid",
      rc: "RC-TEST",
      fiscalId: "IF-TEST",
      patente: "PAT-TEST",
      cnss: "CNSS-TEST",
      fax: "05 01",
    };
    const text = textOf(reportFooterTemplate(company));
    expect(text).toContain("Labo Démo S.A.R.L Adresse : 1 rue Test, Ville Tel : 05 00 Fax : 05 01 E-mail : x@test.invalid www.test.invalid IF : IF-TEST - RC : RC-TEST - Patente : PAT-TEST - CNSS : CNSS-TEST");
    const partial = textOf(reportFooterTemplate({ ...company, fiscalId: null, patente: "  ", cnss: null, fax: null }));
    expect(partial).toContain("Tel : 05 00 E-mail : x@test.invalid");
    expect(partial).not.toContain("Fax");
    expect(partial).toContain("RC : RC-TEST");
    expect(partial).not.toMatch(/IF :|Patente|CNSS/);
    expect(reportFooterTemplate({ ...company, name: "<b>" })).toContain("&lt;b&gt;");
  });
});

describe("reportDensity — page 1 and the annex hold on one page each", () => {
  const rows = (n: number, units = 5) =>
    Array.from({ length: n }, (_, i) => ({
      ...base.results[0],
      parameter: `Germe ${i}`,
      units: Array.from({ length: units }, () => ({ display: "10", value: 10, detected: null })),
    }));

  it("steps down as the rows, the repetitions and the amendment grow", () => {
    expect(reportDensity({ ...base, results: rows(3) })).toBe("");
    // Few germs hold at the lightest type, even on nine repetitions (measured 13/10).
    expect(reportDensity({ ...base, results: rows(5, 9), unitCount: 9 })).toBe("");
    expect(reportDensity({ ...base, results: rows(9, 9), unitCount: 9 })).toBe("compact");
    expect(reportDensity({ ...base, results: rows(14) })).toBe("dense");
    expect(reportDensity({ ...base, results: rows(20) })).toBe("dense");
    expect(reportDensity({ ...base, results: rows(37, 9), unitCount: 9 })).toBe("dense xdense");
    const amendment = { previousNumber: "RAP-1", previousIssuedAt: new Date(), note: "x".repeat(500) };
    expect(reportDensity({ ...base, results: rows(20), amendment })).toBe("dense");
    expect(reportDensity({ ...base, results: rows(34), amendment })).toBe("dense xdense");
  });

  it("weighs the annex too: a row printing its plan beneath m | M takes two lines at the lighter types", () => {
    // Ten germs with a plan: twenty annex lines — the lightest type holds them, a mark's taller foot does not.
    expect(reportDensity({ ...base, results: rows(10, 1), unitCount: 1 })).toBe("");
    expect(reportDensity({ ...base, results: rows(10, 1), unitCount: 1 }, { duplicataAt: new Date() })).toBe("compact");
    // …the same germs without a criterion print one line each.
    const plain = rows(11, 1).map((row) => ({ ...row, criterion: null }));
    expect(reportDensity({ ...base, results: plain, unitCount: 1 })).toBe("");
    expect(reportDensity({ ...base, results: rows(11, 1), unitCount: 1 })).toBe("compact");
  });

  it("counts the lines a long client name, site or product wraps to", () => {
    const short = { ...base, results: rows(6, 1), unitCount: 1 };
    expect(reportDensity(short)).toBe("");
    const long = { ...short, client: { ...short.client, name: "Société de démonstration ".repeat(7) }, siteName: "Site de démonstration ".repeat(3) };
    expect(reportDensity(long)).not.toBe("");
  });
});

describe("printReport — page 1 and the annex on one page each, measured on the PDF", () => {
  const reference: DocumentRef = { docType: "RAPPORT", reference: "PG06/EN03", version: "M", createdOn: null, updatedOn: null };
  /** A PDF of `n` pages as Chromium writes its page objects. */
  const fakePdf = (n: number) =>
    Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Pages /Count ${n} >>\n${Array.from({ length: n }, (_, i) => `${i + 2} 0 obj << /Type /Page >>`).join("\n")}`, "latin1");
  const density = (html: string) => /<body class="([^"]*)">/.exec(html)?.[1];

  it("counts the page objects of a PDF, not the page tree", () => {
    expect(pdfPageCount(fakePdf(2))).toBe(2);
    expect(pdfPageCount(fakePdf(4))).toBe(4);
    expect(pdfPageCount(Buffer.from("not a pdf"))).toBeNull();
  });

  it("prints once when the guess holds", async () => {
    const printed: (string | undefined)[] = [];
    const pdf = await printReport({ data: base, company: COMPANY, reference, logoDataUri: null }, async (parts) => {
      printed.push(density(parts.html));
      return fakePdf(2);
    });
    expect(pdfPageCount(pdf)).toBe(2);
    expect(printed).toEqual([reportDensity(base)]);
  });

  it("steps the type down while the PDF runs over two pages, with the same margins in @page and page.pdf()", async () => {
    const printed: (string | undefined)[] = [];
    await printReport({ data: base, company: COMPANY, reference, logoDataUri: null, marks: { duplicataAt: new Date() } }, async (parts) => {
      printed.push(density(parts.html));
      expect(parts.html).toContain(pageCss(parts.margin));
      return fakePdf(printed.length < 3 ? 3 : 2);
    });
    expect(printed).toEqual(["", "compact", "dense"]);
  });

  it("stops at the densest type: a report that still does not hold prints on more pages, never in a loop", async () => {
    const printed: (string | undefined)[] = [];
    const pdf = await printReport({ data: base, company: COMPANY, reference, logoDataUri: null }, async (parts) => {
      printed.push(density(parts.html));
      return fakePdf(3);
    });
    expect(printed).toEqual([...REPORT_DENSITIES]);
    expect(pdfPageCount(pdf)).toBe(3);
  });

  it("returns an unreadable PDF as it is, without printing it again", async () => {
    let calls = 0;
    await printReport({ data: base, company: COMPANY, reference, logoDataUri: null }, async () => {
      calls += 1;
      return Buffer.from("unreadable");
    });
    expect(calls).toBe(1);
  });
});

describe("frozen versions — ReportData to JSON and back", () => {
  it("gives back the same data, dates included", () => {
    const amended: ReportData = {
      ...full,
      amendment: { previousNumber: "RAP-2026-00001", previousIssuedAt: new Date("2026-10-07T10:00:00Z"), note: null },
    };
    const stored = JSON.parse(JSON.stringify(reportDataToJson(amended)));
    const back = reportDataFromJson(stored);
    expect(back).toEqual(amended);
    expect(back?.sampledAt).toBeInstanceOf(Date);
    expect(back?.amendment?.previousIssuedAt).toBeInstanceOf(Date);
    for (const key of ["productionDate", "expiryDate", "analysisFrom", "analysisTo", "issuedAt"] as const) {
      expect(back?.[key], key).toBeInstanceOf(Date);
    }
    // …so it prints exactly as it was issued.
    const at = { duplicataAt: new Date("2026-10-08T09:00:00Z") };
    expect(buildReportHtml(back!, at)).toBe(buildReportHtml(amended, at));
  });

  it("keeps the aligned layout's marker and arrival through the freeze", () => {
    const back = reportDataFromJson(JSON.parse(JSON.stringify(reportDataToJson(aligned))));
    expect(back).toEqual({ ...aligned, amendment: null });
    expect(back?.layout).toBe(REPORT_LAYOUT_ALIGNED);
    expect(back?.arrivedAt).toBeInstanceOf(Date);
    expect(buildReportHtml(back!)).toBe(buildReportHtml(aligned));
    // A version frozen before lot 1b carries neither.
    const old = reportDataFromJson(reportDataToJson(full));
    expect(old).not.toHaveProperty("layout");
    expect(old).not.toHaveProperty("arrivedAt");
  });

  it("keeps the missing dates and amendment empty", () => {
    const back = reportDataFromJson(reportDataToJson({ ...base, receivedAt: null, validatedAt: null }));
    expect(back?.receivedAt).toBeNull();
    expect(back?.validatedAt).toBeNull();
    expect(back?.amendment).toBeNull();
  });

  it("leaves absent the template's fields of a version frozen before them", () => {
    const back = reportDataFromJson(reportDataToJson(base));
    expect(back).not.toHaveProperty("issuedAt");
    expect(back).not.toHaveProperty("productionDate");
    expect(reportDataFromJson({ ...reportDataToJson(base), issuedAt: null })?.issuedAt).toBeNull();
  });

  it("refuses what is not a report", () => {
    expect(reportDataFromJson(null)).toBeNull();
    expect(reportDataFromJson([])).toBeNull();
    expect(reportDataFromJson({ number: "RAP-1" })).toBeNull();
    expect(reportDataFromJson({ ...reportDataToJson(base), sampledAt: "pas une date" })).toBeNull();
  });
});

describe("contamination alerts on an amended report — only what changed", () => {
  const listeria: AlertReading = {
    parameter: "Listeria",
    value: "Présence",
    unit: "/25 g",
    threshold: "Absence /25 g",
    conform: false,
    interpretation: "NON_SATISFAISANT",
  };
  const ecoli: AlertReading = {
    parameter: "E. coli",
    value: "2.10³",
    unit: "ufc/g",
    threshold: "m = 10 · M = 10² ufc/g",
    conform: false,
    interpretation: "NON_SATISFAISANT",
  };

  it("does not alert again for the same results already alerted with the version replaced", () => {
    expect(germsToRealert({ current: [listeria], alerted: [], replaced: [listeria, { ...ecoli, conform: true }] })).toEqual([]);
  });

  it("does not alert again a result whose alert is already recorded", () => {
    const fingerprint = germFingerprints([listeria]).get("Listeria")!;
    expect(germsToRealert({ current: [listeria], alerted: [{ germ: "Listeria", fingerprint }], replaced: null })).toEqual([]);
  });

  it("alerts a changed value, a changed verdict or a new germ", () => {
    expect(germsToRealert({ current: [{ ...ecoli, value: "5.10³" }], alerted: [], replaced: [ecoli] })).toEqual(["E. coli"]);
    expect(
      germsToRealert({ current: [ecoli], alerted: [], replaced: [{ ...ecoli, conform: true, interpretation: "ACCEPTABLE" }] })
    ).toEqual(["E. coli"]);
    expect(germsToRealert({ current: [listeria, ecoli], alerted: [], replaced: [listeria] })).toEqual(["E. coli"]);
  });

  it("alerts everything when nothing was sent for the version replaced", () => {
    expect(germsToRealert({ current: [listeria, ecoli], alerted: [], replaced: null })).toEqual(["Listeria", "E. coli"]);
  });

  it("ignores surrounding spaces, not the result, and never mixes germs", () => {
    expect(germsToRealert({ current: [{ ...listeria, value: " Présence " }], alerted: [], replaced: [listeria] })).toEqual([]);
    const listeriaPrint = germFingerprints([listeria]).get("Listeria")!;
    expect(
      germsToRealert({ current: [ecoli], alerted: [{ germ: "Listeria", fingerprint: listeriaPrint }], replaced: null })
    ).toEqual(["E. coli"]);
  });
});

describe("the administrator's silent correction on a frozen version", () => {
  it("prints the conclusion standing on the report, the rest as frozen", () => {
    const corrected = withSilentCorrection(base, "Conclusion corrigée par l'administrateur.");
    expect(corrected).not.toBe(base);
    expect(corrected.conclusion).toBe("Conclusion corrigée par l'administrateur.");
    expect({ ...corrected, conclusion: base.conclusion }).toEqual(base);
    expect(buildReportHtml(withSilentCorrection(base, "Conclusion corrigée."))).toContain("Conclusion corrigée.");
  });

  it("returns the very same data when nothing was corrected, so a caller knows nothing to rewrite", () => {
    expect(withSilentCorrection(base, base.conclusion)).toBe(base);
    expect(withSilentCorrection(base, null)).toBe(base);
    expect(withSilentCorrection(base, undefined)).toBe(base);
  });

  it("survives the freeze: a refreshed version reads back with the correction", () => {
    const corrected = withSilentCorrection(base, "Nouvelle conclusion.");
    expect(reportDataFromJson(JSON.parse(JSON.stringify(reportDataToJson(corrected))))?.conclusion).toBe("Nouvelle conclusion.");
  });
});

describe("frozenVersionInForce — the current version rendered first from its frozen version (lot 1b, D-03)", () => {
  const issued = { conclusion: aligned.conclusion, amendmentPending: false };

  it("prints the version frozen at its issue, the aligned layout included", () => {
    expect(frozenVersionInForce(aligned, issued)).toBe(aligned);
    // A version frozen between 13/10 and lot 1b: as frozen, with the 13/10 layout.
    expect(frozenVersionInForce(full, { conclusion: full.conclusion, amendmentPending: false })).toBe(full);
  });

  it("always applies the administrator's silent correction (« Modifier la conclusion »)", () => {
    const printed = frozenVersionInForce(aligned, { conclusion: "Conclusion corrigée par l'administrateur.", amendmentPending: false });
    expect(printed?.conclusion).toBe("Conclusion corrigée par l'administrateur.");
    expect({ ...printed, conclusion: aligned.conclusion }).toEqual(aligned);
    expect(textOf(buildReportHtml(printed!))).toContain("Conclusion : Conclusion corrigée par l'administrateur.");
    // …also during an amendment, as before.
    expect(frozenVersionInForce(full, { conclusion: "Corrigée.", amendmentPending: true })?.conclusion).toBe("Corrigée.");
  });

  it("renders live (null) a report never frozen, and a version frozen before the template of 13/10", () => {
    expect(frozenVersionInForce(null, issued)).toBeNull();
    // `base` carries none of the template's fields: it has printed live until now.
    expect(frozenVersionInForce(base, { conclusion: base.conclusion, amendmentPending: false })).toBeNull();
  });

  it("keeps the frozen version in force while an amendment is in progress, whatever its age", () => {
    expect(frozenVersionInForce(base, { conclusion: base.conclusion, amendmentPending: true })).toBe(base);
    expect(frozenVersionInForce(null, { conclusion: null, amendmentPending: true })).toBeNull();
  });

  it("is the path of every print of the current version (`loadReportData`), the live data only after it", () => {
    // Read from the source: report-dispatch.ts imports the database client.
    // Line ends normalised: a Windows checkout (core.autocrlf) holds CRLF.
    const source = readFileSync(new URL("./report-dispatch.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const fn = (name: string) => {
      const start = source.indexOf(name);
      expect(start, name).toBeGreaterThan(0);
      return source.slice(start, source.indexOf("\n}\n", start));
    };
    const load = fn("export async function loadReportData(");
    expect(load).toContain("loadReportVersion(report.id, report.version)");
    expect(load).toContain("return frozenVersionInForce(frozen?.data ?? null, report) ?? liveReportData(sampleId, report);");
    // The versions issued — and only they — carry the aligned layout.
    expect(fn("export async function createReportFor(")).toContain("layout: REPORT_LAYOUT_ALIGNED");
    expect(fn("export async function amendReportFor(")).toContain("layout: REPORT_LAYOUT_ALIGNED");
    expect(fn("async function liveReportData(")).not.toContain("REPORT_LAYOUT_ALIGNED");
    // The reconstruction at « Rouvrir pour amendement » freezes what printed: the live data.
    expect(fn("export async function reopenForAmendment(")).not.toContain("REPORT_LAYOUT_ALIGNED");
    // The e-mail's « Date de réception » is the attached report's (the arrival since lot 1b).
    expect(fn("async function sendReportNow(")).toContain("receivedAt: printedReceptionAt(data),");
  });
});
