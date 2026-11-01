import { describe, expect, it } from "vitest";
import { ONSSA_COUNT_BY } from "./lab-proposals";
import { toLabWallTime } from "./lab-time";
import {
  NO_ORIGIN,
  buildOnssaReport,
  isDoneResult,
  isNonConformResult,
  onssaEstablishment,
  onssaFileName,
  onssaGroupOf,
  onssaMonth,
  previousOnssaMonth,
  type OnssaGroupRef,
  type OnssaResultInput,
  type OnssaSampleInput,
} from "./onssa-report";

/**
 * Lot 3E, N3 — the counting rules of the ONSSA monthly report (hypothèses,
 * à confirmer par R-22). Invented clients, sites and bodies.
 */

const LAIT: OnssaGroupRef = { id: "g-lait", name: "Lait test", domain: "ALIMENTAIRE", sortOrder: 1, active: true };
const VIANDE: OnssaGroupRef = { id: "g-viande", name: "Viande test", domain: "ALIMENTAIRE", sortOrder: 0, active: true };
const EAUX: OnssaGroupRef = { id: "g-eaux", name: "Eaux test", domain: "EAU", sortOrder: 2, active: true };
const ARCHIVE: OnssaGroupRef = { id: "g-old", name: "Ancien groupe", domain: "ALIMENTAIRE", sortOrder: 3, active: false };
const GROUPS = [LAIT, VIANDE, EAUX, ARCHIVE];

const result = (over: Partial<OnssaResultInput> = {}): OnssaResultInput => ({
  parameterName: "Salmonella test",
  parameterColumn: "SALMONELLA",
  normCode: null,
  value: "Absence",
  interpretation: "SATISFAISANT",
  conform: true,
  ...over,
});

let counter = 0;
const sample = (over: Partial<OnssaSampleInput> = {}): OnssaSampleInput => ({
  id: `s${(counter += 1)}`,
  reference: `${counter}/26`,
  clientName: "Client Test",
  siteName: null,
  natureLabel: "Aliments",
  familyName: "Fromage test",
  groupId: LAIT.id,
  controleOfficiel: false,
  organismePreleveur: null,
  etablissement: null,
  origine: null,
  results: [result()],
  ...over,
});

describe("the month", () => {
  it("bounds a month on the laboratory's clock", () => {
    const month = onssaMonth("2026-10");
    expect(month).not.toBeNull();
    expect(month!.label).toBe("Octobre 2026");
    expect(toLabWallTime(month!.from)).toBe("2026-10-01T00:00");
    expect(toLabWallTime(month!.until)).toBe("2026-11-01T00:00");
  });

  it("rolls December into the next year", () => {
    const month = onssaMonth("2026-12");
    expect(month!.label).toBe("Décembre 2026");
    expect(toLabWallTime(month!.until)).toBe("2027-01-01T00:00");
  });

  it("refuses what is not a month", () => {
    for (const bad of ["2026-13", "2026-00", "26-10", "2026-1", "", null, undefined, "abcd-ef"]) {
      expect(onssaMonth(bad), String(bad)).toBeNull();
    }
  });

  it("proposes the month before the laboratory's today", () => {
    expect(previousOnssaMonth(new Date("2026-11-01T10:00:00Z"))).toBe("2026-10");
    expect(previousOnssaMonth(new Date("2027-01-15T10:00:00Z"))).toBe("2026-12");
  });

  it("names the file after the month, and counts by reception by default", () => {
    expect(onssaFileName("2026-10")).toBe("Rapport-ONSSA-2026-10.xlsx");
    expect(ONSSA_COUNT_BY).toBe("RECEPTION");
  });
});

describe("the unit rules", () => {
  it("a result is done when it holds a value or a verdict", () => {
    expect(isDoneResult({ value: "10", interpretation: null })).toBe(true);
    expect(isDoneResult({ value: "  ", interpretation: null })).toBe(false);
    expect(isDoneResult({ value: null, interpretation: "NON_SATISFAISANT" })).toBe(true);
    expect(isDoneResult({ value: null, interpretation: null })).toBe(false);
  });

  it("« NC » = Non satisfaisant, or non conforme without a verdict; Acceptable is conforme", () => {
    expect(isNonConformResult({ interpretation: "NON_SATISFAISANT", conform: true })).toBe(true);
    expect(isNonConformResult({ interpretation: "ACCEPTABLE", conform: false })).toBe(false);
    expect(isNonConformResult({ interpretation: "SATISFAISANT", conform: null })).toBe(false);
    expect(isNonConformResult({ interpretation: "INCOMPLET", conform: false })).toBe(false);
    expect(isNonConformResult({ interpretation: null, conform: false })).toBe(true);
    expect(isNonConformResult({ interpretation: null, conform: null })).toBe(false);
  });

  it("the group is the family's, else the nature's", () => {
    expect(onssaGroupOf({ productType: { onssaGroupId: "a" }, nature: { onssaGroupId: "b" } })).toBe("a");
    expect(onssaGroupOf({ productType: { onssaGroupId: null }, nature: { onssaGroupId: "b" } })).toBe("b");
    expect(onssaGroupOf({ productType: null, nature: { onssaGroupId: null } })).toBeNull();
  });

  it("the establishment is the one typed, else the client and its site", () => {
    expect(onssaEstablishment({ etablissement: " Usine test ", clientName: "C", siteName: "S" })).toBe("Usine test");
    expect(onssaEstablishment({ etablissement: null, clientName: "Client Test", siteName: "Site Nord" })).toBe(
      "Client Test — Site Nord"
    );
    expect(onssaEstablishment({ etablissement: "", clientName: "Client Test", siteName: null })).toBe("Client Test");
  });
});

describe("buildOnssaReport", () => {
  it("lists every active group in order, even at zero, and no archived one without counts", () => {
    const report = buildOnssaReport([], GROUPS);
    expect(report.groups.map((block) => block.group.name)).toEqual(["Viande test", "Lait test", "Eaux test"]);
    expect(report.total).toEqual({ realisees: 0, nonConformes: 0 });
    expect(report.declaredSamples).toBe(0);
  });

  it("counts one analysis per parameter with a result, by column, with its NC", () => {
    const report = buildOnssaReport(
      [
        sample({
          results: [
            result(),
            result({ parameterName: "E. coli test", parameterColumn: "ESCHERICHIA_COLI_44", value: "1,2.10³", interpretation: "NON_SATISFAISANT" }),
            // Programmed, never read: not an analysis done.
            result({ parameterName: "Listeria test", parameterColumn: "LISTERIA_MONOCYTOGENES", value: null, interpretation: null }),
          ],
        }),
        sample({ results: [result({ interpretation: "ACCEPTABLE" })] }),
      ],
      GROUPS
    );
    const lait = report.groups.find((block) => block.group.id === LAIT.id)!;
    expect(lait.samples).toBe(2);
    expect(lait.columns.SALMONELLA).toEqual({ realisees: 2, nonConformes: 0 });
    expect(lait.columns.ESCHERICHIA_COLI_44).toEqual({ realisees: 1, nonConformes: 1 });
    expect(lait.columns.LISTERIA_MONOCYTOGENES).toEqual({ realisees: 0, nonConformes: 0 });
    expect(lait.total).toEqual({ realisees: 3, nonConformes: 1 });
    expect(report.columnTotals.SALMONELLA.realisees).toBe(2);
    expect(report.total).toEqual({ realisees: 3, nonConformes: 1 });
  });

  it("splits official control and autocontrôle, by body, establishment and origin", () => {
    const official = {
      controleOfficiel: true,
      organismePreleveur: "DR Test",
      etablissement: null,
      siteName: "Site Nord",
    };
    const report = buildOnssaReport(
      [
        sample({ ...official, origine: "Local" }),
        sample({ ...official, origine: "Local", results: [result(), result({ parameterColumn: "STAPHYLOCOQUES_37" })] }),
        sample({ ...official, organismePreleveur: "Organisme agréé test", origine: "Importé" }),
        sample({ origine: "Local" }),
        sample({ origine: "  " }),
      ],
      GROUPS
    );
    const lait = report.groups.find((block) => block.group.id === LAIT.id)!;
    expect(lait.official).toEqual([
      { organisme: "DR Test", etablissement: "Client Test — Site Nord", origine: "Local", analyses: 3, samples: 2 },
      { organisme: "Organisme agréé test", etablissement: "Client Test — Site Nord", origine: "Importé", analyses: 1, samples: 1 },
    ]);
    expect(lait.self).toEqual([
      { origine: "Local", analyses: 1, samples: 1 },
      { origine: NO_ORIGIN, analyses: 1, samples: 1 },
    ]);
    expect(lait.officialAnalyses).toBe(4);
    expect(lait.selfAnalyses).toBe(2);
    expect(report.officialAnalyses + report.selfAnalyses).toBe(report.total.realisees);
  });

  it("feeds the synthesis: food and water microbiology by group domain, chemistry by column", () => {
    const report = buildOnssaReport(
      [
        sample({ groupId: EAUX.id, results: [result({ parameterColumn: "MOR_22" }), result({ parameterColumn: "MOR_36", conform: false, interpretation: null })] }),
        sample({ results: [result(), result({ parameterName: "Histamine test", parameterColumn: "CHIMIE_ALIMENTAIRE", value: "12" })] }),
        sample({ groupId: VIANDE.id, results: [result({ parameterColumn: "CHIMIE_ALIMENTAIRE", value: "3", interpretation: "NON_SATISFAISANT" })] }),
      ],
      GROUPS
    );
    expect(report.synthesis.EAU).toEqual({ samples: 1, analyses: 2, nonConformes: 1 });
    expect(report.synthesis.ALIMENTAIRE).toEqual({ samples: 1, analyses: 1, nonConformes: 0 });
    // The mixed sample counts in both domains; the chemistry-only one in chemistry only.
    expect(report.synthesis.CHIMIE).toEqual({ samples: 2, analyses: 2, nonConformes: 1 });
    expect(report.declaredSamples).toBe(3);
  });

  it("moves a yeast to the column of the norm its result was read under", () => {
    const report = buildOnssaReport(
      [sample({ results: [result({ parameterName: "Levures", parameterColumn: "LEVURES_25", normCode: "NM ISO 21527-2" })] })],
      GROUPS
    );
    const lait = report.groups.find((block) => block.group.id === LAIT.id)!;
    expect(lait.columns.LEVURES_2.realisees).toBe(1);
    expect(lait.columns.LEVURES_25.realisees).toBe(0);
  });

  it("lists apart what it cannot declare, never drops it silently", () => {
    const report = buildOnssaReport(
      [
        sample({ groupId: null, natureLabel: "Surfaces", familyName: null, results: [result(), result()] }),
        sample({ groupId: null, natureLabel: "Surfaces", familyName: null }),
        sample({ groupId: "deleted-group" }),
        sample({ results: [result({ parameterName: "Germe test", parameterColumn: null }), result()] }),
      ],
      GROUPS
    );
    expect(report.unmapped.samples).toEqual([
      { label: "Surfaces", samples: 2, analyses: 3 },
      { label: "Aliments — Fromage test", samples: 1, analyses: 1 },
    ]);
    expect(report.unmapped.parameters).toEqual([{ name: "Germe test", analyses: 1 }]);
    expect(report.declaredSamples).toBe(1);
    expect(report.total.realisees).toBe(1);
  });

  it("a sample with no declared analysis counts nowhere, not even as a sample", () => {
    const report = buildOnssaReport([sample({ results: [result({ parameterColumn: null })] })], GROUPS);
    expect(report.declaredSamples).toBe(0);
    expect(report.groups.find((block) => block.group.id === LAIT.id)!.samples).toBe(0);
  });

  it("keeps the counts of an archived group a family still names", () => {
    const report = buildOnssaReport([sample({ groupId: ARCHIVE.id })], GROUPS);
    expect(report.groups.map((block) => block.group.name)).toContain("Ancien groupe");
    expect(report.groups.find((block) => block.group.id === ARCHIVE.id)!.total.realisees).toBe(1);
  });
});
