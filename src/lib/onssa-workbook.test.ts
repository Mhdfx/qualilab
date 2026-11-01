import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ONSSA_COLUMNS } from "./onssa-canevas";
import { buildOnssaReport, type OnssaGroupRef, type OnssaSampleInput } from "./onssa-report";
import { buildOnssaWorkbook, columnLetter, type OnssaWorkbookMeta } from "./onssa-workbook";

/**
 * Lot 3E, N3 — the Excel in the layout of the canevas extract of 28/10:
 * the headers at the same cells, the counts, the formulas (with their
 * results cached) and the « Notes ». Read back through ExcelJS, as the
 * laboratory's Excel would open it.
 */

const LAIT: OnssaGroupRef = { id: "g-lait", name: "Lait test", domain: "ALIMENTAIRE", sortOrder: 0, active: true };
const EAUX: OnssaGroupRef = { id: "g-eaux", name: "Eaux test", domain: "EAU", sortOrder: 1, active: true };

const base: Omit<OnssaSampleInput, "id" | "results"> = {
  reference: "1/26",
  clientName: "Client Test",
  siteName: null,
  natureLabel: "Aliments",
  familyName: "Fromage test",
  groupId: LAIT.id,
  controleOfficiel: false,
  organismePreleveur: null,
  etablissement: null,
  origine: "Local",
};
const ok = {
  normCode: null,
  value: "Absence",
  interpretation: "SATISFAISANT" as const,
  informalInterpretation: null,
  conform: true,
};

const report = buildOnssaReport(
  [
    {
      ...base,
      id: "a",
      controleOfficiel: true,
      organismePreleveur: "DR Test",
      results: [
        { ...ok, parameterName: "Salmonella", parameterColumn: "SALMONELLA" },
        { ...ok, parameterName: "E. coli", parameterColumn: "ESCHERICHIA_COLI_44", interpretation: "NON_SATISFAISANT" },
      ],
    },
    { ...base, id: "b", results: [{ ...ok, parameterName: "Histamine", parameterColumn: "CHIMIE_ALIMENTAIRE", value: "5" }] },
    { ...base, id: "c", groupId: EAUX.id, results: [{ ...ok, parameterName: "MOR 22", parameterColumn: "MOR_22" }] },
    { ...base, id: "d", groupId: null, natureLabel: "Surfaces", familyName: null, results: [{ ...ok, parameterName: "Flore", parameterColumn: "MICRO_ORGANISMES_30" }] },
  ],
  [LAIT, EAUX]
);
const meta: OnssaWorkbookMeta = {
  monthLabel: "Octobre 2026",
  labName: "Laboratoire Test",
  generatedAt: "01/11/2026 à 09:30",
  countBasis: "date de réception",
  pendingSamples: 2,
};

async function roundTrip() {
  const buffer = await buildOnssaWorkbook(report, meta).xlsx.writeBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ArrayBuffer);
  return workbook;
}

const value = (sheet: ExcelJS.Worksheet, address: string) => sheet.getCell(address).value;
const formula = (sheet: ExcelJS.Worksheet, address: string) => sheet.getCell(address).value as ExcelJS.CellFormulaValue;

describe("columnLetter", () => {
  it("names Excel's columns", () => {
    expect([1, 26, 27, 28, 52].map(columnLetter)).toEqual(["A", "Z", "AA", "AB", "AZ"]);
  });
});

describe("the ONSSA workbook", () => {
  it("has the canevas' three sheets and the notes", async () => {
    const workbook = await roundTrip();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Feuil1", "Feuil2", "Feuil3", "Notes"]);
    expect(value(workbook.getWorksheet("Feuil1")!, "A1")).toBe("Rapport mensuel d'activité ONSSA — Octobre 2026");
  });

  it("Feuil1: the headers of rows 5–7, then official and self rows per group, and the totals", async () => {
    const sheet = (await roundTrip()).getWorksheet("Feuil1")!;
    expect(value(sheet, "A5")).toBe("Groupe de produits");
    expect(value(sheet, "B5")).toBe("Nombre d'analyse");
    expect(value(sheet, "B6")).toBe("Contrôle Officiel");
    expect(value(sheet, "E6")).toBe("Autocontrôle");
    expect(value(sheet, "B7")).toBe("DR ONSSA/Organisme préleveur agréé");
    expect(value(sheet, "E7")).toBe("Origine");
    expect(value(sheet, "F5")).toBe("total");
    // Lait: one official row, one self row (merged group name); Eaux: one self row.
    expect(value(sheet, "A8")).toBe("Lait test");
    expect([value(sheet, "B8"), value(sheet, "C8"), value(sheet, "D8"), value(sheet, "F8")]).toEqual([
      "DR Test",
      "Client Test",
      "Local",
      2,
    ]);
    expect([value(sheet, "E9"), value(sheet, "F9")]).toEqual(["Local", 1]);
    expect(value(sheet, "A10")).toBe("Eaux test");
    expect(value(sheet, "F10")).toBe(1);
    expect(value(sheet, "A11")).toBe("dont contrôle officiel");
    expect(value(sheet, "F11")).toBe(2);
    expect(value(sheet, "F12")).toBe(2);
    expect(formula(sheet, "F13")).toMatchObject({ formula: "SUM(F8:F10)", result: 4 });
  });

  it("Feuil2: the 23 germs and their methods at C6:Y7, chemistry Z, total AA, two rows per group", async () => {
    const sheet = (await roundTrip()).getWorksheet("Feuil2")!;
    expect(value(sheet, "A6")).toBe("Types de produits");
    expect(value(sheet, "B6")).toBe("Nombres d'analyses");
    expect(value(sheet, "C6")).toBe("Bacillus cereus");
    expect(value(sheet, "C7")).toBe("NM ISO 7932 2021");
    expect(value(sheet, "Y6")).toBe("Clostridia");
    expect(value(sheet, "Z6")).toBe("chimie alimentaires");
    expect(value(sheet, "AA6")).toBe("Total");
    ONSSA_COLUMNS.forEach((column, i) => expect(value(sheet, `${columnLetter(3 + i)}6`)).toBe(column.header));

    const salmonella = columnLetter(3 + ONSSA_COLUMNS.findIndex((c) => c.key === "SALMONELLA"));
    const coli = columnLetter(3 + ONSSA_COLUMNS.findIndex((c) => c.key === "ESCHERICHIA_COLI_44"));
    expect([value(sheet, "A8"), value(sheet, "B8"), value(sheet, "B9")]).toEqual(["Lait test", "Réalisées", "NC"]);
    expect(value(sheet, `${salmonella}8`)).toBe(1);
    expect(value(sheet, `${coli}8`)).toBe(1);
    expect(value(sheet, `${coli}9`)).toBe(1);
    expect(value(sheet, "Z8")).toBe(1);
    expect(formula(sheet, "AA8")).toMatchObject({ formula: "SUM(C8:Z8)", result: 3 });
    expect(formula(sheet, "AA9")).toMatchObject({ result: 1 });
    expect(value(sheet, "A10")).toBe("Eaux test");
    // Totals: rows 12–13, SUMIF over the label column.
    expect(value(sheet, "A12")).toBe("Total");
    expect(formula(sheet, "AA12")).toMatchObject({ formula: 'SUMIF($B$8:$B$11,"Réalisées",AA8:AA11)', result: 4 });
    expect(formula(sheet, "AA13")).toMatchObject({ result: 1 });
  });

  it("Feuil3: samples and analyses per domain, conformes as formulas", async () => {
    const sheet = (await roundTrip()).getWorksheet("Feuil3")!;
    expect([value(sheet, "C6"), value(sheet, "D6"), value(sheet, "E6"), value(sheet, "F6")]).toEqual([
      "Microbiologie alimentaire",
      "Microbilogie des eaux",
      "Chimie alimentaire",
      "Totaux",
    ]);
    expect([value(sheet, "C8"), value(sheet, "D8"), value(sheet, "E8")]).toEqual([1, 1, 1]);
    expect([value(sheet, "C9"), value(sheet, "D9"), value(sheet, "E9")]).toEqual([2, 1, 1]);
    expect(formula(sheet, "F9")).toMatchObject({ formula: "C9+D9+E9", result: 4 });
    expect(value(sheet, "B11")).toBe("RESULTATS");
    expect(formula(sheet, "C13")).toMatchObject({ formula: "C9-C14", result: 1 });
    expect(value(sheet, "C14")).toBe(1);
    expect(formula(sheet, "F15")).toMatchObject({ formula: "SUM(F13:F14)", result: 4 });
  });

  it("Notes: the rules, the pending samples and what was left out", async () => {
    const sheet = (await roundTrip()).getWorksheet("Notes")!;
    const texts: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => texts.push(String(cell.value))));
    const all = texts.join("\n");
    expect(all).toContain("R-22");
    expect(all).toContain("date de réception");
    expect(all).toContain("Échantillons sans groupe de produits (non déclarés)");
    expect(all).toContain("Surfaces");
    expect(texts).toContain("2");
    expect(all).toContain("pas encore validés");
  });

  it("Notes: no pending line when the month is counted by validation date", async () => {
    const workbook = buildOnssaWorkbook(report, { ...meta, countBasis: "date de validation administrative", pendingSamples: null });
    const buffer = await workbook.xlsx.writeBuffer();
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(buffer as ArrayBuffer);
    const texts: string[] = [];
    read.getWorksheet("Notes")!.eachRow((row) => row.eachCell((cell) => texts.push(String(cell.value))));
    const all = texts.join("\n");
    expect(all).toContain("date de validation administrative");
    expect(all).not.toContain("pas encore validés");
    expect(all).toContain("Échantillons déclarés");
  });

  it("writes an empty month without a formula over an empty range", async () => {
    const empty = buildOnssaWorkbook(buildOnssaReport([], []), meta);
    const sheet = empty.getWorksheet("Feuil1")!;
    expect(value(sheet, "A8")).toBe("dont contrôle officiel");
    expect(value(sheet, "F10")).toBe(0);
    await expect(empty.xlsx.writeBuffer()).resolves.toBeTruthy();
  });
});
