import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REPORT_DENSITIES,
  REPORT_LAYOUT_ALIGNED,
  pdfPageCount,
  printReport,
  reportDensity,
  type ReportData,
  type ReportMarks,
} from "./report-html";
import { COMPANY, type CompanyInfo } from "./company";
import type { DocumentRef } from "./document-types";

/**
 * The template PG06/EN03 (version M) prints a report on two pages: page 1,
 * the report, and page 2, « -ANNEXE- Interprétation des résultats ». The
 * annex starts on a page of its own, so a PDF of exactly two pages proves
 * that page 1 and the annex each hold on one page — under the cartouche and
 * above the legend, the « N.B » block and the legal footer, which repeat on
 * every page.
 *
 * Printed as the routes print it (`printReport`: `reportDensity`'s guess,
 * then a denser type while the PDF runs over two pages). The heaviest real
 * case — every germ of the largest product type of the criteria workbook
 * (37), nine repetitions each — then the same with an amendment whose reason
 * has the longest length accepted and the marks of a duplicate of a
 * superseded version, twelve repetitions (two bands), 37 germs read once,
 * and the reports in between — 8 to 18 germs, the sizes at which the lighter
 * types run out (a guess that missed them printed 3 or 4 pages), with a
 * client name of the longest length stored. Needs a local Chrome/Edge, like
 * the PDF routes; skipped without one.
 */

const BROWSERS = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
  String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
].filter(Boolean) as string[];
const hasBrowser = BROWSERS.some((path) => existsSync(path));

// The germs of the heaviest type, as the catalogue names them (generic
// microbiology names — no client data), and methods as the workbook writes them.
const GERMS = [
  "Bacillus cereus", "Bactéries lactiques", "Bactéries sulfito-réductrices à 46°C", "Clostridium perfringens",
  "Coliformes thermotolérants à 44°C", "Coliformes totaux", "Enterobacteries", "E. coli", "Levures", "Listeria",
  "Micro-organismes à 30°C", "Moisissures", "Salmonelles", "Vibrio Parahaemolyticus", "TVO", "Bacille gram négatif",
  "TSA plat count", "SDA plat count", "Entérocoques intestinaux à 36°C", "Vibrio Parahaemolyticus (SA)",
  "Pseudomonas Aeruginosa", "Bacillus cereus (SA)", "Germes aérobies mésophiles totaux", "Flore aérobie mésophile",
  "Shigella (SN)", "Clostridium botulinum (SN)", "Recherche Shigella", "Staphylocoques à coagulase positive à 37°C",
  "Enterobacteriaceae", "Escherichia Coli O157:H7", "Hepatitis A virus", "Norovirus GI GII", "Recherche Listeria spp",
  "Campylobacter spp", "Halophiles", "Recherche de Clostridium Botulinum (Type A,B,E,F) RT-PCR",
  "Détection des Entérotoxines Staphylococciques",
];

const METHODS = ["NM ISO 4833-1:2013", "NM ISO 16649-2:2007", "RT-PCR", "NM ISO 6579-1:2021", "pharmacopée européenne 2012"];

function results(germs: number, repetitions: number): ReportData["results"] {
  return GERMS.slice(0, germs).map((name, g) => {
    const absence = g % 6 === 0;
    // A few uncountable plates: « Indénombrable » wraps in its R column.
    const uncountable = (i: number) => !absence && i === 2 && g % 9 === 4;
    return {
      parameter: name,
      value: absence ? "Absence" : "4,2.10²",
      unit: absence ? "/25g" : "ufc/g",
      threshold: null,
      conform: true,
      note: null,
      interpretation: "SATISFAISANT",
      norm: METHODS[g % METHODS.length],
      criterion: absence
        ? { n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null }
        : { n: 5, c: 1, mKind: g % 3 === 0 ? "UNSPECIFIED" : "VALUE", m: 100, bigM: 1000 },
      units: Array.from({ length: repetitions }, (_, i) =>
        absence
          ? { display: "Absence", value: null, detected: false }
          : uncountable(i)
            ? { display: "Indénombrable", value: null, detected: true }
            : { display: "4,2.10²", value: 420 + i, detected: null }
      ),
    };
  });
}

function heaviest(): ReportData {
  return {
    number: "RAP-2026-99999", controlCode: "09999/26", serialNumber: "0999/26",
    client: { name: "Client de démonstration agroalimentaire SARL", address: "Zone industrielle Sud, lot 12, Casablanca", ice: null },
    // The site row of a chain's restaurant (V5) must not push the page over.
    siteName: "Restaurant Test",
    produit: "Produit de démonstration", lineKind: "ALIMENT", numeroLot: "LOT-2026-09", lieu: "Chambre froide n°2",
    type: "ALIMENTAIRE", sampledAt: new Date("2026-10-12T08:30:00Z"), receivedAt: new Date("2026-10-12T11:05:00Z"),
    preleveur: "Préleveur Un", technicianName: "Technicien Un", validatorName: "Validateur Un", approverName: "Direction Une",
    validatedAt: new Date("2026-10-14T09:00:00Z"),
    conclusion: "L'échantillon est satisfaisant au regard des critères de la réglementation en vigueur.",
    interpretation: "SATISFAISANT",
    regulation:
      "Critères microbiologiques applicables aux denrées alimentaires (texte de démonstration, assez long pour tenir sur deux lignes de l'annexe et mesurer la hauteur de la ligne de réglementation).",
    unitCount: 9, results: results(37, 9),
    sampledByLab: true, samplingTimeDeclared: null, airMethod: null,
    productionDate: new Date(Date.UTC(2026, 9, 10)), expiryDate: new Date(Date.UTC(2026, 9, 20)),
    productTemperature: 3.5, receptionTemperature: 4.2, receptionTemperatureSource: "ECHANTILLON", coolerTemperature: 2.8,
    analysisFrom: new Date("2026-10-12T13:00:00Z"), analysisTo: new Date("2026-10-14T08:00:00Z"), issuedAt: new Date("2026-10-14T10:00:00Z"),
  };
}

/** Every line of the legal footer filled — test values only, never the laboratory's. */
const company: CompanyInfo = {
  ...COMPANY,
  name: "Laboratoire de démonstration S.A.R.L",
  address: "12 rue de l'Exemple (Ex rue Test), Quartier Démo 20000",
  city: "Casablanca, Maroc",
  phone: "05 00 00 00 00/01",
  fax: "05 00 00 00 09",
  email: "contact@exemple.invalid",
  website: "www.exemple.invalid",
  rc: "RC-TEST",
  fiscalId: "IF-TEST",
  patente: "PATENTE-TEST",
  cnss: "CNSS-TEST",
};

const reference: DocumentRef = {
  docType: "RAPPORT",
  reference: "PG06/EN03",
  version: "M",
  createdOn: new Date(Date.UTC(2006, 0, 5)),
  updatedOn: new Date(Date.UTC(2023, 11, 18)),
};

const pages = (pdf: Buffer) => pdfPageCount(pdf);

/** The density of each print, as `printReport` chose it (the last one rendered). */
let printedDensity: string | undefined;

async function print(data: ReportData, marks: ReportMarks = {}) {
  const { renderPdf } = await import("./pdf");
  return printReport({ data, company, reference, logoDataUri: null, marks }, (parts) => {
    printedDensity = /<body class="([^"]*)">/.exec(parts.html)?.[1];
    return renderPdf(parts.html, { header: parts.header, footer: parts.footer, margin: parts.margin });
  });
}

/** A client name of the longest length the column holds (VARCHAR 191) — test words only. */
const LONGEST_CLIENT = "Société de démonstration pour la distribution et la restauration collective des produits alimentaires et des boissons, entrepôts frigorifiques et cuisine centrale du site test".padEnd(191, " x").slice(0, 191);

describe.skipIf(!hasBrowser)("page 1 and the annex each print on one page", () => {
  it("37 germs × 9 repetitions", async () => {
    expect(pages(await print(heaviest()))).toBe(2);
  }, 60_000);

  it("…amended with the longest reason, as the duplicate of a superseded version", async () => {
    const data: ReportData = {
      ...heaviest(),
      number: "RAP-2026-99999-A1",
      amendment: {
        previousNumber: "RAP-2026-99999",
        previousIssuedAt: new Date("2026-10-13T10:00:00Z"),
        // AMENDMENT_NOTE_MAX (report-dispatch.ts): 500 characters.
        note: "Correction du numéro de lot et de la date de production transmis par le client. ".repeat(7).slice(0, 500),
      },
    };
    const marks = { duplicataAt: new Date("2026-10-15T09:00:00Z"), supersededBy: "RAP-2026-99999-A2" };
    expect(pages(await print(data, marks))).toBe(2);
  }, 60_000);

  it("twelve repetitions: a second band of R columns", async () => {
    const data: ReportData = {
      ...heaviest(),
      unitCount: 12,
      results: results(10, 12),
      amendment: { previousNumber: "RAP-2026-99999", previousIssuedAt: new Date("2026-10-13T10:00:00Z"), note: "Motif." },
    };
    expect(pages(await print(data))).toBe(2);
  }, 60_000);

  it("37 germs read once", async () => {
    const data: ReportData = { ...heaviest(), unitCount: 1, results: results(37, 0).map((row) => ({ ...row, units: [] })) };
    expect(pages(await print(data))).toBe(2);
  }, 60_000);

  // The sizes at which the lighter types run out — the guess alone printed
  // 3 or 4 pages for some of them (review of 13/10).
  for (const [germs, repetitions, duplicata] of [
    [8, 5, false], [10, 5, false], [11, 5, true], [12, 1, true], [14, 1, false], [16, 8, false], [18, 5, false],
  ] as const) {
    it(`${germs} germs × ${repetitions} repetition(s)${duplicata ? ", duplicata" : ""}`, async () => {
      const data: ReportData = {
        ...heaviest(),
        unitCount: repetitions,
        results: repetitions === 1 ? results(germs, 0).map((row) => ({ ...row, units: [] })) : results(germs, repetitions),
      };
      expect(pages(await print(data, duplicata ? { duplicataAt: new Date("2026-10-15T09:00:00Z") } : {}))).toBe(2);
    }, 60_000);
  }

  it("a client name of 191 characters on 11 germs × 5 repetitions", async () => {
    const data: ReportData = { ...heaviest(), client: { ...heaviest().client, name: LONGEST_CLIENT }, unitCount: 5, results: results(11, 5) };
    expect(pages(await print(data))).toBe(2);
  }, 60_000);

  it("keeps the lightest type when it holds: a short report is not shrunk", async () => {
    const data: ReportData = { ...heaviest(), unitCount: 5, results: results(4, 5) };
    expect(reportDensity(data)).toBe(REPORT_DENSITIES[0]);
    expect(pages(await print(data))).toBe(2);
    expect(printedDensity).toBe("");
  }, 60_000);

  // The aligned layout (lot 1b): « N/A », the denomination, the arrival, one date.
  it("the aligned layout: 37 germs × 9 repetitions, a denomination of the longest length", async () => {
    const data: ReportData = {
      ...heaviest(),
      layout: REPORT_LAYOUT_ALIGNED,
      // `User.documentName` holds 191 characters — test words only.
      preleveur: "Technicien de QUALILAB 'J.-P.NOMDETEST' — préleveur du laboratoire de démonstration ".repeat(3).slice(0, 191),
      arrivedAt: new Date("2026-10-12T10:40:00Z"),
    };
    expect(pages(await print(data))).toBe(2);
  }, 60_000);

  it("the aligned layout, every field of the block empty (« N/A »), amended, as a duplicata", async () => {
    const data: ReportData = {
      ...heaviest(),
      layout: REPORT_LAYOUT_ALIGNED,
      preleveur: "Technicien de QUALILAB 'P.TEST'",
      unitCount: 5,
      results: results(11, 5),
      numeroLot: null, productionDate: null, expiryDate: null, productTemperature: null, receptionTemperature: null,
      coolerTemperature: null, arrivedAt: null, receivedAt: null, controlCode: null,
      number: "RAP-2026-99999-A1",
      amendment: { previousNumber: "RAP-2026-99999", previousIssuedAt: new Date("2026-10-13T10:00:00Z"), note: "Motif." },
    };
    expect(pages(await print(data, { duplicataAt: new Date("2026-10-15T09:00:00Z") }))).toBe(2);
  }, 60_000);

  it("an air sample sampled by the client, nothing to interpret", async () => {
    const data: ReportData = {
      ...heaviest(),
      lineKind: "AIR", type: "AMBIANCE", airMethod: "BOITE_EXPOSEE_30MIN", sampledByLab: false, samplingTimeDeclared: false,
      interpretation: null, regulation: null, unitCount: 1,
      results: results(3, 0).map((row) => ({ ...row, units: [], criterion: null, interpretation: null })),
    };
    expect(pages(await print(data))).toBe(2);
  }, 60_000);
});
