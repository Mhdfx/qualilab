import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";

vi.mock("server-only", () => ({}));

const {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_CELLS,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_SHEETS,
  MAX_IMPORT_UNCOMPRESSED,
  MAX_SHEET_ROW,
  XLS_REFUSAL,
  columnLetters,
  columnNumber,
  importRequestTooLarge,
  isMonthYearFormat,
  readImportFile,
  readImportWorkbook,
  sanitizeWorksheetXml,
} = await import("./stock-import-file");
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

/**
 * Relecture du lot 6, constat 2 — tiny files that once held hundreds of Mo
 * of memory, now refused (or bounded) before the work they would cause.
 */
describe("readImportWorkbook — limits checked before the work", () => {
  async function withXml(edit: (xml: string) => string, extra?: (zip: JSZip) => void): Promise<File> {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Feuille").getCell("A1").value = "x";
    const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    zip.file("xl/worksheets/sheet1.xml", edit(xml));
    extra?.(zip);
    return new File([await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })], "piege.xlsx");
  }

  it("refuses a filled cell far below the data (A1 + A1048576), naming the sheet", async () => {
    const file = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet("Haute");
      sheet.getCell("A1").value = "x";
      sheet.getCell("A1048576").value = "y";
    });
    const started = Date.now();
    expect(await readImportWorkbook(file, { sheets: "all" })).toEqual({ error: expect.stringMatching(/ligne 1048576 de la feuille « Haute »/) });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("ignores the columns past the limit (a value in column XFD)", async () => {
    const file = await xlsx((workbook) => {
      const sheet = workbook.addWorksheet("Large");
      for (let r = 1; r <= 50; r += 1) {
        sheet.getCell(r, 1).value = `ligne ${r}`;
        sheet.getCell(r, 16_384).value = 1;
      }
    });
    const read = await readImportWorkbook(file, { sheets: "all" });
    if ("error" in read) throw new Error(read.error);
    expect(read.sheets[0].rows).toHaveLength(50);
    expect(Math.max(...read.sheets[0].rows.map((row) => row.length))).toBe(1);
    expect(MAX_IMPORT_COLUMNS).toBe(256);
  });

  it("refuses a huge merged range before exceljs expands it", async () => {
    const file = await withXml((xml) =>
      xml.replace("</sheetData>", '</sheetData><mergeCells count="1"><mergeCell ref="A1:XFD1048576"/></mergeCells>')
    );
    const started = Date.now();
    expect(await readImportWorkbook(file, { sheets: "all" })).toEqual({ error: expect.stringContaining("Plage fusionnée trop grande") });
    expect(Date.now() - started).toBeLessThan(2_000);
    const quoted = await withXml((xml) => xml.replace("</sheetData>", "</sheetData><mergeCells count=\"1\"><mergeCell ref='A1:J20000'/></mergeCells>"));
    expect(await readImportWorkbook(quoted, { sheets: "all" })).toEqual({ error: expect.stringContaining("Plage fusionnée trop grande") });
  });

  it("stops inflating a « zip bomb » at the limit", async () => {
    const file = await withXml(
      (xml) => xml,
      (zip) => zip.file("xl/media/remplissage.bin", new Uint8Array(MAX_IMPORT_UNCOMPRESSED + 1024))
    );
    expect(file.size).toBeLessThan(MAX_IMPORT_BYTES);
    expect(await readImportWorkbook(file, { sheets: "all" })).toEqual({ error: expect.stringContaining("trop volumineux une fois décompressé") });
  });

  it("counts the sheets in the archive, before exceljs reads them", async () => {
    const file = await withXml(
      (xml) => xml,
      (zip) => {
        for (let i = 2; i <= MAX_IMPORT_SHEETS + 1; i += 1) zip.file(`xl/worksheets/sheet${i}.xml`, "<worksheet/>");
      }
    );
    expect(await readImportWorkbook(file, { sheets: "first" })).toEqual({ error: expect.stringContaining("Trop de feuilles") });
  });

  it("refuses an unreadable merged range", async () => {
    const file = await withXml((xml) => xml.replace("</sheetData>", '</sheetData><mergeCells count="1"><mergeCell ref="A:A"/></mergeCells>'));
    expect(await readImportWorkbook(file, { sheets: "all" })).toEqual({ error: expect.stringContaining("Cellules fusionnées illisibles") });
  });

  it("refuses a .csv with too many lines before parsing it", async () => {
    const file = new File(["a\n".repeat(MAX_SHEET_ROW + 1)], "long.csv");
    expect(await readImportWorkbook(file, { sheets: "all" })).toEqual({ error: expect.stringContaining("Trop de lignes dans le fichier") });
  });
});

describe("sanitizeWorksheetXml", () => {
  const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;

  it("drops the formatting-only cells and the rows left empty, keeps the filled ones", () => {
    const budget = { cells: 100 };
    const out = sanitizeWorksheetXml(
      sheet('<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="3"/></row><row r="2" ht="20" customHeight="1"><c r="A2" s="3"/></row><row r="9000" s="2"/>'),
      "Feuille",
      budget
    );
    expect(out).toBe(sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'));
    expect(budget.cells).toBe(98);
  });

  it("spends one budget on cells, rows and merged cells, and refuses past it", () => {
    expect(() => sanitizeWorksheetXml(sheet('<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row>'), "F", { cells: 2 })).toThrow(
      "Trop de cellules"
    );
    expect(() =>
      sanitizeWorksheetXml(`${sheet('<row r="1"><c r="A1"><v>1</v></c></row>')}<mergeCells><mergeCell ref="A1:B3"/></mergeCells>`, "F", { cells: 7 })
    ).toThrow("Trop de cellules");
    expect(MAX_IMPORT_CELLS).toBeGreaterThan(100_000);
  });

  it("refuses a filled row below the limit, the cell's or the row's", () => {
    expect(() => sanitizeWorksheetXml(sheet(`<row r="${MAX_SHEET_ROW + 1}"><c r="A${MAX_SHEET_ROW + 1}"><v>1</v></c></row>`), "Bas", { cells: 10 })).toThrow(
      `ligne ${MAX_SHEET_ROW + 1} de la feuille « Bas »`
    );
    expect(() => sanitizeWorksheetXml(sheet(`<row r="${MAX_SHEET_ROW + 1}"><c><v>1</v></c></row>`), "Bas", { cells: 10 })).toThrow("Bas");
  });

  it("reads the column letters back", () => {
    expect(columnNumber("A")).toBe(1);
    expect(columnNumber("AB")).toBe(28);
    expect(columnNumber("XFD")).toBe(16_384);
  });
});

describe("importRequestTooLarge", () => {
  const request = (length: string | null) => new Request("http://localhost/api", { method: "POST", headers: length ? { "content-length": length } : {} });
  it("tells a body announced too large, before it is read", () => {
    expect(importRequestTooLarge(request(String(MAX_IMPORT_BYTES)))).toBe(false);
    expect(importRequestTooLarge(request(String(MAX_IMPORT_BYTES + 1024 * 1024)))).toBe(true);
    expect(importRequestTooLarge(request(null))).toBe(false);
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
