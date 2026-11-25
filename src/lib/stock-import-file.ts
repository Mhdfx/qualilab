import "server-only";
import ExcelJS from "exceljs";
import { parseCsv } from "./csv";
import { MAX_IMPORT_ROWS, type SheetCell, type SheetRow } from "./stock-import";

/**
 * Reads the workbook of an import of the magasin into rows (lot 3D, M8;
 * lot 6, M9 — RETOUR-LABO-25-11.md §5): an .xlsx (its first sheet, or every
 * sheet) or a .csv (one sheet).
 *
 * - **Limits**: 8 Mo, at most `MAX_IMPORT_SHEETS` sheets, and
 *   `MAX_IMPORT_ROWS` (+ 10 for the headers) **non-empty** rows per sheet —
 *   a sheet whose formatting runs thousands of rows past its data (the
 *   laboratory's « Journal Achat » once saved as .xlsx) is read, its empty
 *   tail cut, rows and columns.
 * - **Cells are data**: a merged range reads in its first cell only; a
 *   formula gives its cached result, never evaluated;
 *   a formula without a cached result (or an error value) reads empty and is
 *   reported (`blankFormulas`). A date reads « AAAA-MM-JJ »; a date shown
 *   as « mois-année » (a number format without a day) is also listed in
 *   `monthCells`, so an expiry « avr.-28 » reads as April 2028, not the 1st.
 * - **.xls** (Excel 97–2003) is refused with the steps to save it as .xlsx:
 *   no dependency reads it safely (decision of 25/11, §2.4).
 */

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_SHEETS = 100;

export const XLS_REFUSAL =
  "Ancien format .xls (Excel 97–2003) : ouvrez le fichier dans Excel → Fichier → Enregistrer sous → « Classeur Excel (.xlsx) » " +
  "(ou LibreOffice → Fichier → Enregistrer sous → « Excel 2007-365 (.xlsx) »), puis choisissez le fichier .xlsx.";

export type ImportSheet = {
  name: string;
  rows: SheetRow[];
  /** « ligne,colonne » (0-based) of the date cells shown as month-year. */
  monthCells: Set<string>;
  /** A1 addresses of the formulas without a cached result (or in error). */
  blankFormulas: string[];
};

export type ImportWorkbook = { sheets: ImportSheet[] };

const isBlank = (value: SheetCell) => value === null || String(value).trim() === "";

/** A day-free date format (« mmm-yy », « mm/yyyy »): quoted text and [..] sections ignored. */
export function isMonthYearFormat(numFmt: string | undefined): boolean {
  if (!numFmt) return false;
  const tokens = numFmt.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").toLowerCase();
  return /y/.test(tokens) && /m/.test(tokens) && !/d/.test(tokens);
}

/** Column number (1-based) → its letters: 1 → A, 28 → AB. */
export function columnLetters(column: number): string {
  let letters = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

type Read = { value: SheetCell; blankFormula: boolean };

function readValue(value: ExcelJS.CellValue): Read {
  if (value === null || value === undefined) return { value: null, blankFormula: false };
  if (typeof value === "number") return { value: Number.isFinite(value) ? value : null, blankFormula: false };
  if (typeof value === "string") return { value, blankFormula: false };
  if (typeof value === "boolean") return { value: value ? "oui" : "non", blankFormula: false };
  if (value instanceof Date) return { value: Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10), blankFormula: false };
  if (typeof value === "object") {
    if ("richText" in value) return { value: value.richText.map((part) => part.text).join(""), blankFormula: false };
    if ("formula" in value || "sharedFormula" in value) {
      const result = (value as { result?: ExcelJS.CellValue }).result;
      if (result === undefined || result === null || (typeof result === "object" && "error" in (result as object))) {
        return { value: null, blankFormula: true };
      }
      return readValue(result);
    }
    if ("error" in value) return { value: null, blankFormula: true };
    if ("text" in value) return { value: String(value.text), blankFormula: false };
  }
  return { value: String(value), blankFormula: false };
}

/** Trailing empty cells of each row, then trailing empty rows, cut. */
function trimmed(rows: SheetRow[]): SheetRow[] {
  const out = Array.from(rows, (row) => {
    const copy = [...(row ?? [])];
    while (copy.length > 0 && isBlank(copy[copy.length - 1])) copy.pop();
    return copy;
  });
  while (out.length > 0 && out[out.length - 1].length === 0) out.pop();
  return out;
}

function sheetOf(worksheet: ExcelJS.Worksheet): ImportSheet {
  const rows: SheetRow[] = [];
  const monthCells = new Set<string>();
  const blankFormulas: string[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: SheetRow = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      // A merged range holds its value in its first cell only (exceljs repeats it in the others).
      if (cell.type === ExcelJS.ValueType.Merge) return;
      const read = readValue(cell.value);
      if (read.blankFormula) blankFormulas.push(`${columnLetters(colNumber)}${rowNumber}`);
      values[colNumber - 1] = read.value;
      if (cell.value instanceof Date && isMonthYearFormat(cell.numFmt)) monthCells.add(`${rowNumber - 1},${colNumber - 1}`);
    });
    rows[rowNumber - 1] = Array.from(values, (value) => value ?? null);
  });
  return { name: worksheet.name, rows: trimmed(rows), monthCells, blankFormulas };
}

const nonEmptyRows = (rows: SheetRow[]) => rows.filter((row) => row.some((value) => !isBlank(value))).length;

/**
 * The workbook's sheets — the first one only, or all of them — under the
 * limits above; a refusal is a sentence for the screen.
 */
export async function readImportWorkbook(
  file: File,
  options: { sheets: "first" | "all" }
): Promise<ImportWorkbook | { error: string }> {
  if (file.size > MAX_IMPORT_BYTES) return { error: "Fichier trop volumineux (8 Mo maximum)." };
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) return { error: XLS_REFUSAL };
  let sheets: ImportSheet[];
  try {
    if (name.endsWith(".csv")) {
      sheets = [{ name: file.name.replace(/\.csv$/i, ""), rows: trimmed(parseCsv(await file.text())), monthCells: new Set(), blankFormulas: [] }];
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      if (workbook.worksheets.length > MAX_IMPORT_SHEETS) {
        return { error: `Trop de feuilles (${workbook.worksheets.length}) — ${MAX_IMPORT_SHEETS} maximum par classeur.` };
      }
      const chosen = options.sheets === "first" ? workbook.worksheets.slice(0, 1) : workbook.worksheets;
      sheets = chosen.map(sheetOf);
    }
  } catch {
    return { error: "Fichier illisible — un classeur .xlsx (ou un .csv) est attendu." };
  }
  for (const sheet of sheets) {
    const count = nonEmptyRows(sheet.rows);
    if (count > MAX_IMPORT_ROWS + 10) {
      return { error: `Trop de lignes remplies dans la feuille « ${sheet.name.trim()} » (${count}) — ${MAX_IMPORT_ROWS} maximum par feuille.` };
    }
  }
  return { sheets };
}

/** The first sheet's rows (the lot 3D contract: the register, the suppliers). */
export async function readImportFile(file: File): Promise<{ rows: SheetRow[] } | { error: string }> {
  const read = await readImportWorkbook(file, { sheets: "first" });
  if ("error" in read) return read;
  return { rows: read.sheets[0]?.rows ?? [] };
}
