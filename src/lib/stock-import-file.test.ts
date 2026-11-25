import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("server-only", () => ({}));

const { MAX_IMPORT_SHEETS, XLS_REFUSAL, columnLetters, isMonthYearFormat, readImportFile, readImportWorkbook } = await import("./stock-import-file");
const { MAX_IMPORT_ROWS } = await import("./stock-import");

/**
 * Lot 6, M9 (RETOUR-LABO-25-11.md §5) — the common reader of the imports of
 * the magasin, on workbooks built here by exceljs (synthetic data only).
 */

async function xlsx(build: (workbook: ExcelJS.Workbook) => void, name = "classeur.xlsx"): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer as ArrayBuffer], name);
}

describe("readImportWorkbook", () => {
  it("reads every sheet, in order, with their names", async () => {
    const file = await xlsx((workbook) => {
      workbook.addWorksheet("Gants nitrile").addRow(["Date", "Libellé"]);
      workbook.addWorksheet("Tubes 15 mL ").addRow(["Date", "Libellé", "Entrée/B50"]);
    });
    const read = await readImportWorkbook(file, { sheets: "all" });
    if ("error" in read) throw new Error(read.error);
    expect(read.sheets.map((sheet) => sheet.name)).toEqual(["Gants nitrile", "Tubes 15 mL "]);
    expect(read.sheets[1].rows[0]).toEqual(["Date", "Libellé", "Entrée/B50"]);
    const first = await readImportWorkbook(file, { sheets: "first" });
    if ("error" in first) throw new Error(first.error);
    expect(first.sheets).toHaveLength(1);
  });

  it("cuts the formatted empty tail and counts only the non-empty rows against the limit", async () => {
    const file = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet("Journal");
      sheet.addRow(["Fournisseurs", "N° Facture"]);
      sheet.addRow(["Fournisseur A", "F-1"]);
      // Formatting only, far below and to the right (the « Journal Achat » case).
      for (let r = 3; r <= MAX_IMPORT_ROWS + 2_000; r += 1) sheet.getCell(r, 1).numFmt = "0.00";
      sheet.getCell(MAX_IMPORT_ROWS + 2_000, 200).numFmt = "0.00";
    });
    const read = await readImportWorkbook(file, { sheets: "all" });
    if ("error" in read) throw new Error(read.error);
    expect(read.sheets[0].rows).toEqual([
      ["Fournisseurs", "N° Facture"],
      ["Fournisseur A", "F-1"],
    ]);
  });

  it("refuses a sheet with too many filled rows, naming it", async () => {
    const file = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet("Trop long");
      for (let r = 1; r <= MAX_IMPORT_ROWS + 11; r += 1) sheet.getCell(r, 1).value = `ligne ${r}`;
    });
    const read = await readImportWorkbook(file, { sheets: "all" });
    expect(read).toEqual({ error: expect.stringContaining("« Trop long »") });
  });

  it("refuses a workbook with too many sheets", async () => {
    const file = await xlsx((workbook) => {
      for (let i = 0; i <= MAX_IMPORT_SHEETS; i += 1) workbook.addWorksheet(`F${i}`).addRow(["x"]);
    });
    expect(await readImportWorkbook(file, { sheets: "all" })).toEqual({ error: expect.stringContaining("Trop de feuilles") });
  });

  it("refuses an .xls with the steps to save it as .xlsx", async () => {
    const read = await readImportWorkbook(new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "Journal Achat.xls"), { sheets: "all" });
    expect(read).toEqual({ error: XLS_REFUSAL });
    expect(XLS_REFUSAL).toContain("Enregistrer sous");
    expect(XLS_REFUSAL).toContain("LibreOffice");
  });

  it("refuses a file over 8 Mo and an unreadable one", async () => {
    expect(await readImportWorkbook(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "gros.xlsx"), { sheets: "all" })).toEqual({
      error: "Fichier trop volumineux (8 Mo maximum).",
    });
    expect(await readImportWorkbook(new File(["pas un classeur"], "faux.xlsx"), { sheets: "all" })).toEqual({
      error: expect.stringContaining("Fichier illisible"),
    });
  });

  it("reads a merged range in its first cell only (the two-row header of the stock sheet)", async () => {
    const file = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet("Article");
      sheet.getCell("A1").value = "Date";
      sheet.getCell("B1").value = "Prix (dh/ht)";
      sheet.mergeCells("A1:A2");
      sheet.mergeCells("B1:C1");
      sheet.getCell("B2").value = "prix unitaire";
      sheet.getCell("C2").value = "prix total";
    });
    const read = await readImportWorkbook(file, { sheets: "all" });
    if ("error" in read) throw new Error(read.error);
    expect(read.sheets[0].rows).toEqual([
      ["Date", "Prix (dh/ht)"],
      [null, "prix unitaire", "prix total"],
    ]);
  });

  it("reads dates as days, marks the month-year ones, gives a formula's cached result and flags one without", async () => {
    const file = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet("Article");
      sheet.getCell("A1").value = new Date(Date.UTC(2026, 2, 17));
      sheet.getCell("A1").numFmt = "mm-dd-yy";
      sheet.getCell("B1").value = new Date(Date.UTC(2028, 6, 1));
      sheet.getCell("B1").numFmt = "mmm-yy";
      sheet.getCell("C1").value = { formula: "16*250", result: 4_000 };
      sheet.getCell("D1").value = { formula: "C1*2" } as ExcelJS.CellFormulaValue;
      sheet.getCell("E1").value = "31700";
    });
    const read = await readImportWorkbook(file, { sheets: "all" });
    if ("error" in read) throw new Error(read.error);
    const [sheet] = read.sheets;
    expect(sheet.rows[0].slice(0, 3)).toEqual(["2026-03-17", "2028-07-01", 4_000]);
    expect(sheet.rows[0][4]).toBe("31700");
    expect([...sheet.monthCells]).toEqual(["0,1"]);
    expect(sheet.blankFormulas).toEqual(["D1"]);
  });

  it("reads a .csv as one sheet named after the file", async () => {
    const read = await readImportWorkbook(new File(["Date;Libellé\n2026-01-02;3/26\n"], "fiche.csv"), { sheets: "all" });
    if ("error" in read) throw new Error(read.error);
    expect(read.sheets).toEqual([expect.objectContaining({ name: "fiche", rows: [["Date", "Libellé"], ["2026-01-02", "3/26"]] })]);
  });
});

describe("readImportFile — the lot 3D contract", () => {
  it("gives the first sheet's rows", async () => {
    const file = await xlsx((workbook) => {
      workbook.addWorksheet("Registre").addRow(["Libellé", "Stock"]);
      workbook.addWorksheet("Autre").addRow(["ignorée"]);
    });
    expect(await readImportFile(file)).toEqual({ rows: [["Libellé", "Stock"]] });
  });
});

describe("helpers", () => {
  it("tells a day-free date format", () => {
    expect(isMonthYearFormat("mmm-yy")).toBe(true);
    expect(isMonthYearFormat("mm/yyyy")).toBe(true);
    expect(isMonthYearFormat("mm-dd-yy")).toBe(false);
    expect(isMonthYearFormat("d-mmm")).toBe(false);
    expect(isMonthYearFormat('[$-40C]mmmm yyyy;"jour"')).toBe(true);
    expect(isMonthYearFormat("General")).toBe(false);
    expect(isMonthYearFormat(undefined)).toBe(false);
  });

  it("names columns", () => {
    expect([1, 26, 27, 52, 53].map(columnLetters)).toEqual(["A", "Z", "AA", "AZ", "BA"]);
  });
});
