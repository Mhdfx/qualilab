import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  UNINTERPRETED_LABEL,
  buildConclusion,
  buildReportHtml,
  isUninterpreted,
  reportDataFromJson,
  reportDataToJson,
  uninterpretedSentence,
  type ReportData,
} from "./report-html";
import { NO_CRITERION_NO_INTERPRETATION } from "./lab-proposals";

/**
 * J3 (28/10, 2.11 : « si on n'a pas de critère, nous ne faisons pas
 * d'interprétation »): a line with neither criterion nor limit carries no
 * verdict, and the report says « Sans interprétation » — in the annex's
 * criteria and in the conclusion. The versions frozen before keep their
 * rendering (`uninterpreted` absent).
 */

const row = (patch: Partial<ReportData["results"][number]> = {}): ReportData["results"][number] => ({
  parameter: "Levures",
  value: "Présence",
  unit: "UFC/couteau",
  threshold: null,
  conform: null,
  note: null,
  interpretation: null,
  norm: "NM ISO 21527",
  criterion: null,
  units: [],
  ...patch,
});

const data: ReportData = {
  number: "RAP-2026-00042",
  controlCode: "00012/26",
  serialNumber: "0042/26",
  client: { name: "Client test", address: null, ice: null },
  produit: "Couteau",
  lineKind: "SURFACE",
  numeroLot: null,
  lieu: "Cuisine",
  type: "AMBIANCE",
  sampledAt: new Date("2026-10-30T08:00:00Z"),
  receivedAt: new Date("2026-10-30T10:00:00Z"),
  preleveur: "Préleveur",
  technicianName: "Tech",
  validatorName: "Valid",
  approverName: "Direction",
  validatedAt: new Date("2026-10-31T10:00:00Z"),
  conclusion: "Conclusion.",
  interpretation: null,
  regulation: null,
  unitCount: 1,
  results: [row({ uninterpreted: true })],
};

function annexOf(html: string) {
  return html.slice(html.indexOf('<section class="sheet annex">'));
}

describe("the annex says « Sans interprétation » for a line nothing judged", () => {
  it("is on (the switch of lab-proposals.ts, as the spec proposes)", () => {
    expect(NO_CRITERION_NO_INTERPRETATION).toBe(true);
  });

  it("prints it in place of « Non spécifié »", () => {
    const annex = annexOf(buildReportHtml(data));
    expect(annex).toContain(`<td class="crit" colspan="2">${UNINTERPRETED_LABEL}</td>`);
    expect(annex).not.toContain("Non spécifié");
  });

  it("a version frozen before lot 3B (no flag) prints exactly as before", () => {
    const before = { ...data, results: [row()] };
    const annex = annexOf(buildReportHtml(before));
    expect(annex).toContain('<td class="crit" colspan="2">Non spécifié</td>');
    expect(annex).not.toContain(UNINTERPRETED_LABEL);
  });

  it("survives the frozen version's JSON round trip", () => {
    const back = reportDataFromJson(reportDataToJson(data));
    expect(back?.results[0].uninterpreted).toBe(true);
    expect(buildReportHtml(back!)).toBe(buildReportHtml(data));
  });
});

describe("isUninterpreted — which line the report says « sans interprétation »", () => {
  const line = { criterion: null, conform: null, interpretation: null, informalInterpretation: null, value: "Présence" };

  it("a line without criterion, limit nor verdict", () => {
    expect(isUninterpreted(line)).toBe(true);
  });

  it("never a judged line, a line with a criterion, an empty line — nor with the switch off", () => {
    expect(isUninterpreted({ ...line, conform: true })).toBe(false);
    expect(isUninterpreted({ ...line, conform: false })).toBe(false);
    expect(isUninterpreted({ ...line, interpretation: "SATISFAISANT" })).toBe(false);
    expect(isUninterpreted({ ...line, informalInterpretation: "ACCEPTABLE" })).toBe(false);
    expect(isUninterpreted({ ...line, criterion: { n: 1, c: null, mKind: "UNSPECIFIED", m: null, bigM: null } })).toBe(false);
    expect(isUninterpreted({ ...line, value: null })).toBe(false);
    expect(isUninterpreted(line, false)).toBe(false);
  });

  it("a malformed frozen criterion reads as none (`storedPlan`)", () => {
    expect(isUninterpreted({ ...line, criterion: { mKind: "?" } })).toBe(true);
  });
});

describe("the conclusion names the parameters left without interpretation", () => {
  it("one parameter, several, each once", () => {
    expect(uninterpretedSentence([])).toBe("");
    expect(uninterpretedSentence(["Levures"])).toBe(
      "Résultat communiqué sans interprétation (aucun critère n'est spécifié pour ce paramètre) : Levures."
    );
    expect(uninterpretedSentence(["Levures", "Moisissures", "Levures", "Flore totale"])).toBe(
      "Résultats communiqués sans interprétation (aucun critère n'est spécifié pour ces paramètres) : Levures, Moisissures et Flore totale."
    );
  });

  it("never writes « de » before a name that would need an elision", () => {
    for (const names of [["E. coli"], ["Entérobactéries", "Anaérobies sulfito-réducteurs"]]) {
      const sentence = uninterpretedSentence(names);
      expect(sentence).not.toMatch(/\bde [AEIOUYÉÈÊaeiouyéèêh]/);
      expect(sentence).toContain(names[names.length - 1]);
    }
  });

  it("never says « conforme pour l'ensemble des paramètres » above a line not interpreted", () => {
    const results = [{ conform: true, parameter: "Flore totale" }, { conform: null, parameter: "Levures" }];
    expect(buildConclusion(results)).toContain("pour l'ensemble des paramètres recherchés");
    expect(buildConclusion(results, { partial: true })).toBe(
      "L'échantillon analysé est conforme aux critères microbiologiques de référence pour les paramètres interprétés."
    );
    // A non-conform line is still named, partial or not.
    expect(buildConclusion([{ conform: false, parameter: "E. coli" }], { partial: true })).toContain("NON CONFORME");
  });

  it("the report's fields build it that way (read from the source: the module imports the database)", () => {
    const source = readFileSync(new URL("./report-dispatch.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(source).toContain("sample.results.filter(carriesNoJudgement).map((r) => printed(r.parameter))");
    // K4: the conclusion names a parameter as its table does (no « (SA) » once a status is saved).
    expect(source).toContain("const printed = conclusionParameterName;");
    expect(source).toContain("{ partial: uninterpreted.length > 0 }");
    expect(source).toContain("[scale.sentence, legacySentence, uninterpretedSentence(uninterpreted)]");
    expect(source).toContain("[historical, uninterpretedSentence(uninterpreted)]");
    // The flag is written only when true: a judged line keeps its frozen data key for key.
    expect(source).toContain("...(isUninterpreted(result) ? { uninterpreted: true } : {}),");
  });
});
