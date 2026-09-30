import { describe, expect, it } from "vitest";
import { buildReportHtml, type ReportData } from "./report-html";

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

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("buildReportHtml — the laboratory's model", () => {
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

  it("never prints the product type — an internal family (Q34)", () => {
    const html = buildReportHtml(base);
    expect(html).not.toContain("Type de produit");
  });

  it("prints the regulation and an X under the verdict", () => {
    const html = buildReportHtml(base);
    expect(html).toContain("Réglementation en vigueur");
    expect(html).toContain("Critères microbiologiques des denrées alimentaires");
    expect(html).toMatch(/<td class="x mid">X<\/td>/);
    expect(count(html, ">X<")).toBe(1);
  });

  it("prints one column per repetition, the method, m | M with n and c beneath", () => {
    const html = buildReportHtml(base);
    for (const r of ["R1", "R2", "R3", "R4", "R5"]) expect(html).toContain(`<th class="rep">${r}</th>`);
    expect(html).toContain("NM ISO 4833-1 (2013)");
    expect(html).toContain("n = 5 · c = 2");
    // A unit above M is red, one between m and M amber.
    expect(html).toContain('<td class="rep no">2.10<sup>3</sup></td>');
    expect(html).toContain('<td class="rep mid">2.10<sup>2</sup></td>');
  });

  it("reads an absence test « Non détecté » and a germ without criterion « Non spécifié »", () => {
    const html = buildReportHtml(base);
    expect(count(html, "Non détecté")).toBe(5);
    expect(html).toContain(">Absence<span class=\"plan\">n = 5</span>");
    expect(html).toContain("Non spécifié");
  });

  it("leaves the verdict columns blank when there is no official verdict", () => {
    const html = buildReportHtml({ ...base, interpretation: null });
    expect(html).toContain("Réglementation en vigueur");
    expect(count(html, ">X<")).toBe(0);
  });

  it("continues the repetitions in a second band beyond ten", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ display: String(i + 1), value: i + 1, detected: null }));
    const html = buildReportHtml({
      ...base,
      unitCount: 12,
      results: [{ ...base.results[0], units: twelve, criterion: { n: 12, c: 2, mKind: "VALUE", m: 100, bigM: 1000 } }],
    });
    expect(count(html, '<table class="results">')).toBe(2);
    expect(html).toContain('<th class="rep">R11</th>');
    expect(html).toContain("Paramètres (suite)");
  });

  it("keeps the single-value layout for a sample read without repetitions", () => {
    const html = buildReportHtml({
      ...base,
      interpretation: null,
      unitCount: 1,
      results: [{ ...base.results[2], units: [], value: "1,2.10²", conform: false, threshold: "< 10 ufc/g" }],
    });
    expect(html).not.toContain("Réglementation en vigueur");
    expect(html).toContain('<th rowspan="2" class="rep">Résultat</th>');
    expect(html).toContain('<td class="rep no">1,2.10<sup>2</sup></td>');
    expect(html).toContain("&lt; 10 ufc/g");
  });
});
