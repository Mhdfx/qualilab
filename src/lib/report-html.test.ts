import { describe, expect, it } from "vitest";
import {
  buildReportHtml,
  germFingerprints,
  germsToRealert,
  reportDataFromJson,
  reportDataToJson,
  withSilentCorrection,
  type AlertReading,
  type ReportData,
} from "./report-html";

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

  it("prints the client's site under the client when the série has one (V5)", () => {
    const html = buildReportHtml({ ...base, client: { name: "Client Démo", address: null, ice: null }, siteName: "Restaurant Test" });
    expect(html).toContain('<span class="k">Raison sociale</span><span class="v">Client Démo</span>');
    expect(html).toContain('<span class="k">Site</span><span class="v">Restaurant Test</span>');
    expect(buildReportHtml(base)).not.toContain('<span class="k">Site</span>');
    expect(buildReportHtml({ ...base, siteName: null })).not.toContain('<span class="k">Site</span>');
  });

  it("names the designation of a surface « Désignation », the product of a food « Produit »", () => {
    expect(buildReportHtml(base)).toContain('<span class="k">Produit</span><span class="v">Thon</span>');
    const surface = buildReportHtml({
      ...base,
      type: "AMBIANCE",
      lineKind: "SURFACE",
      produit: "Planche verte — surface nettoyée",
    });
    expect(surface).toContain('<span class="k">Désignation</span><span class="v">Planche verte — surface nettoyée</span>');
    expect(surface).not.toContain('<span class="k">Produit</span>');
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

  it("prints « Rapport amendé — annule et remplace … » and the reason at the top", () => {
    const html = buildReportHtml(amended);
    expect(html).toContain("<b>Rapport amendé</b> — annule et remplace le rapport RAP-2026-00001 du");
    expect(html).toMatch(/Motif de l(&#39;|&#x27;|')amendement : Erreur de transcription du N° de lot/);
    expect(html).toContain("Rapport d'analyse amendé —");
    expect(html).toContain("N° <b>RAP-2026-00001-A1</b>");
    expect(html.indexOf('<div class="amended">')).toBeGreaterThan(html.indexOf("<h1>"));
    expect(html.indexOf('<div class="amended">')).toBeLessThan(html.indexOf('<div class="grid">'));
  });

  it("prints no amendment block on an original report", () => {
    for (const data of [base, { ...base, amendment: null }]) {
      const html = buildReportHtml(data);
      expect(html).not.toContain('<div class="amended">');
      expect(html).not.toContain("Rapport amendé");
    }
  });

  it("marks a duplicate « DUPLICATA — édité le … » at the head and the foot", () => {
    const html = buildReportHtml(base, undefined, { duplicataAt: new Date("2026-10-08T09:00:00Z") });
    expect(count(html, "DUPLICATA — édité le")).toBe(2);
    expect(html).toContain('<span class="mark duplicata">');
    expect(html).toContain('<span class="dup">');
    expect(buildReportHtml(base)).not.toContain("DUPLICATA");
  });

  it("marks a superseded version, and a reconstructed one", () => {
    const html = buildReportHtml(base, undefined, { supersededBy: "RAP-2026-00001-A1", reconstructed: true });
    expect(html).toContain('<span class="mark superseded">Version remplacée par RAP-2026-00001-A1</span>');
    expect(html).toContain('<span class="mark superseded">Version reconstituée</span>');
    expect(buildReportHtml(base, undefined, { supersededBy: "RAP-2026-00001-A2" })).not.toContain("reconstituée");
  });

  it("escapes the reason", () => {
    const html = buildReportHtml({ ...amended, amendment: { ...amended.amendment!, note: "<script>" } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("frozen versions — ReportData to JSON and back", () => {
  it("gives back the same data, dates included", () => {
    const amended: ReportData = {
      ...base,
      amendment: { previousNumber: "RAP-2026-00001", previousIssuedAt: new Date("2026-10-07T10:00:00Z"), note: null },
    };
    const stored = JSON.parse(JSON.stringify(reportDataToJson(amended)));
    const back = reportDataFromJson(stored);
    expect(back).toEqual(amended);
    expect(back?.sampledAt).toBeInstanceOf(Date);
    expect(back?.amendment?.previousIssuedAt).toBeInstanceOf(Date);
    // …so it prints exactly as it was issued.
    const at = { duplicataAt: new Date("2026-10-08T09:00:00Z") };
    expect(buildReportHtml(back!, undefined, at).replace(/Édité le <b>[^<]*<\/b>/, "")).toBe(
      buildReportHtml(amended, undefined, at).replace(/Édité le <b>[^<]*<\/b>/, "")
    );
  });

  it("keeps the missing dates and amendment empty", () => {
    const back = reportDataFromJson(reportDataToJson({ ...base, receivedAt: null, validatedAt: null }));
    expect(back?.receivedAt).toBeNull();
    expect(back?.validatedAt).toBeNull();
    expect(back?.amendment).toBeNull();
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
