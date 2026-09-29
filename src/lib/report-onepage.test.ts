import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReportHtml, REPORT_PDF_MARGIN, type ReportData } from "./report-html";

/**
 * « Toujours une page par échantillon » (RETOUR-LABO-29-09.md, slice C): the
 * heaviest real case — every germ of the largest product type of the
 * criteria workbook (37), nine repetitions each — must print on one page.
 * Needs a local Chrome/Edge, like the PDF routes; skipped without one.
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

function heaviest(): ReportData {
  const results: ReportData["results"] = GERMS.map((name, g) => {
    const absence = g % 6 === 0;
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
      units: Array.from({ length: 9 }, (_, i) =>
        absence
          ? { display: "Absence", value: null, detected: false }
          : { display: "4,2.10²", value: 420 + i, detected: null }
      ),
    };
  });
  return {
    number: "RA-2026-9999", controlCode: "09999/26", serialNumber: "0999/26",
    client: { name: "Client de démonstration SARL", address: "Zone industrielle, lot 12", ice: "001234567000045" },
    produit: "Produit de démonstration", numeroLot: "LOT-2026-09", lieu: "Chambre froide n°2",
    type: "ALIMENTAIRE", sampledAt: new Date(), receivedAt: new Date(), preleveur: "Préleveur Un",
    technicianName: "Technicien Un", validatorName: "Validateur Un", approverName: "Admin", validatedAt: new Date(),
    conclusion: "L'échantillon est satisfaisant au regard des critères de la réglementation en vigueur.",
    interpretation: "SATISFAISANT",
    regulation: "Critères microbiologiques applicables aux denrées alimentaires (texte de démonstration).",
    productType: "Type de démonstration", unitCount: 9, results,
  };
}

const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe.skipIf(!hasBrowser)("the report prints on one page", () => {
  it("37 germs × 9 repetitions", async () => {
    const { renderPdf } = await import("./pdf");
    const pdf = await renderPdf(buildReportHtml(heaviest()), { margin: REPORT_PDF_MARGIN });
    expect(pages(pdf)).toBe(1);
  }, 60_000);
});
