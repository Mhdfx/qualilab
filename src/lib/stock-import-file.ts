import "server-only";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { parseCsv } from "./csv";
import { MAX_IMPORT_ROWS, type SheetCell, type SheetRow } from "./stock-import";

/**
 * Reads the workbook of an import of the magasin into rows (lot 3D, M8;
 * lot 6, M9 — RETOUR-LABO-25-11.md §5): an .xlsx (its first sheet, or every
 * sheet) or a .csv (one sheet).
 *
 * - **Limits, checked before the work they bound** (relecture du lot 6,
 *   constat 2 — a 12 Ko file once held 540 Mo of memory): 8 Mo on disk; the
 *   archive opened first (`inspectXlsx`), its content inflated under
 *   `MAX_IMPORT_UNCOMPRESSED` (a « zip bomb » stops there), at most
 *   `MAX_IMPORT_SHEETS` sheets, no filled cell below row `MAX_SHEET_ROW`, no
 *   merged range over `MAX_MERGE_CELLS` cells, and `MAX_IMPORT_CELLS` filled
 *   or merged cells in the whole workbook. The cells holding formatting only
 *   (the « Journal Achat » saved as .xlsx: more than a million of them under
 *   its rows) are dropped before exceljs reads the sheet. Then, while a sheet
 *   is read: `MAX_IMPORT_ROWS` (+ 10 for the headers) **non-empty** rows,
 *   columns past `MAX_IMPORT_COLUMNS` ignored.
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
/** The archive's content once inflated (the real « Journal Achat » saved as .xlsx: under half of it). */
export const MAX_IMPORT_UNCOMPRESSED = 64 * 1024 * 1024;
/** Files inside the archive (a workbook of 100 sheets holds a few hundred). */
export const MAX_IMPORT_ENTRIES = 2_000;
/** No filled cell below this row (a sheet of the magasin holds a few hundred rows). */
export const MAX_SHEET_ROW = 20_000;
/** Columns read; a cell further right is ignored. */
export const MAX_IMPORT_COLUMNS = 256;
/** Filled cells, rows, shared strings and the cells of the merged ranges, in the whole workbook. */
export const MAX_IMPORT_CELLS = 250_000;
/** Cells of one merged range. */
export const MAX_MERGE_CELLS = 100_000;
/** A request carrying the file: the file plus the form's few fields. */
export const MAX_IMPORT_REQUEST_BYTES = MAX_IMPORT_BYTES + 256 * 1024;

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

/** Column letters → its number (1-based): A → 1, AB → 28. */
export function columnNumber(letters: string): number {
  let n = 0;
  for (const char of letters.toUpperCase()) n = n * 26 + (char.charCodeAt(0) - 64);
  return n;
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

const nonEmptyRows = (rows: SheetRow[]) => rows.filter((row) => row.some((value) => !isBlank(value))).length;

/** A refusal met while reading (its message is a sentence for the screen). */
class ImportRefusal extends Error {}

const tooManyRows = (sheet: string, count: number) =>
  new ImportRefusal(`Trop de lignes remplies dans la feuille « ${sheet.trim()} » (${count}) — ${MAX_IMPORT_ROWS} maximum par feuille.`);

const tooFarDown = (sheet: string, row: number) =>
  new ImportRefusal(`Cellule remplie à la ligne ${row} de la feuille « ${sheet.trim()} » — ${MAX_SHEET_ROW} lignes au plus par feuille.`);

const tooBig = () =>
  new ImportRefusal(
    `Classeur trop volumineux une fois décompressé (${MAX_IMPORT_UNCOMPRESSED / 1024 / 1024} Mo maximum) — enregistrez seulement les feuilles utiles.`
  );

const tooManyCells = () => new ImportRefusal(`Trop de cellules remplies ou fusionnées dans le classeur (${MAX_IMPORT_CELLS} maximum).`);

function sheetOf(worksheet: ExcelJS.Worksheet): ImportSheet {
  const rows: SheetRow[] = [];
  const monthCells = new Set<string>();
  const blankFormulas: string[] = [];
  let filled = 0;
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // Checked before the row is stored: the array of rows grows to its number.
    if (rowNumber > MAX_SHEET_ROW) throw tooFarDown(worksheet.name, rowNumber);
    const values: SheetRow = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber > MAX_IMPORT_COLUMNS) return;
      // A merged range holds its value in its first cell only (exceljs repeats it in the others).
      if (cell.type === ExcelJS.ValueType.Merge) return;
      const read = readValue(cell.value);
      if (read.blankFormula) blankFormulas.push(`${columnLetters(colNumber)}${rowNumber}`);
      values[colNumber - 1] = read.value;
      if (cell.value instanceof Date && isMonthYearFormat(cell.numFmt)) monthCells.add(`${rowNumber - 1},${colNumber - 1}`);
    });
    const cells = Array.from(values, (value) => value ?? null);
    if (cells.some((value) => !isBlank(value))) {
      filled += 1;
      if (filled > MAX_IMPORT_ROWS + 10) throw tooManyRows(worksheet.name, filled);
    }
    rows[rowNumber - 1] = cells;
  });
  return { name: worksheet.name, rows: trimmed(rows), monthCells, blankFormulas };
}

// ————— The archive, opened before exceljs reads it —————

/** The paths exceljs reads as worksheets (its own test, not anchored). */
const WORKSHEET_PATH = /xl\/worksheets\/sheet(\d+)[.]xml/;
const SHARED_STRINGS_PATH = /xl\/sharedStrings[.]xml/;
const CELL_ADDRESS = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

/** An attribute of one XML start tag, either quote. */
function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`).exec(tag);
  return match ? match[2] : null;
}

/** Inflates one file of the archive, stopping as soon as the budget is spent. */
function inflate(entry: JSZip.JSZipObject, budget: { left: number }): Promise<Buffer> {
  // JSZip's own stream (documented, missing from its typings): paused, it inflates no further.
  const stream = (entry as unknown as { internalStream(type: "nodebuffer"): JSZip.JSZipStreamHelper<Buffer> }).internalStream("nodebuffer");
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let stopped = false;
    const stop = (error: unknown) => {
      if (stopped) return;
      stopped = true;
      stream.pause();
      reject(error);
    };
    stream
      .on("data", (chunk: Buffer) => {
        if (stopped) return;
        size += chunk.length;
        budget.left -= chunk.length;
        if (budget.left < 0) return stop(tooBig());
        chunks.push(chunk);
      })
      .on("error", (error: Error) => stop(error))
      .on("end", () => {
        if (!stopped) resolve(Buffer.concat(chunks, size));
      })
      .resume();
  });
}

/**
 * A worksheet's XML without its formatting-only cells (`<c r="…" s="…"/>`),
 * its cells right of `MAX_IMPORT_COLUMNS` and the rows left empty, checked
 * against the limits; `budget.cells` is spent on what exceljs will build
 * from it: its cells, its rows and every cell of its merged ranges.
 */
export function sanitizeWorksheetXml(xml: string, name: string, budget: { cells: number }): string {
  const spend = (cells: number) => {
    budget.cells -= cells;
    if (budget.cells < 0) throw tooManyCells();
  };
  const out = xml
    .replace(/<c\b(?=[^>]*\sr\s*=\s*")[^>]*\/>/g, "")
    .replace(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, (cell) => {
      const address = CELL_ADDRESS.exec(attribute(/^<c\b[^>]*>/.exec(cell)?.[0] ?? "", "r") ?? "");
      if (address && columnNumber(address[1]) > MAX_IMPORT_COLUMNS) return "";
      if (address && Number(address[2]) > MAX_SHEET_ROW) throw tooFarDown(name, Number(address[2]));
      spend(1);
      return cell;
    })
    .replace(/<row\b(?=[^>]*\sr\s*=\s*")[^>]*\/>/g, "")
    .replace(/<row\b(?=[^>]*\sr\s*=\s*")[^>]*>\s*<\/row>/g, "");
  for (const tag of out.matchAll(/<row\b[^>]*>/g)) {
    spend(1);
    const row = Number(attribute(tag[0], "r") ?? "0");
    if (row > MAX_SHEET_ROW) throw tooFarDown(name, row);
  }
  for (const tag of out.matchAll(/<mergeCell\b[^>]*>/g)) {
    const corners = (attribute(tag[0], "ref") ?? "").split(":").map((part) => CELL_ADDRESS.exec(part.trim()));
    if (corners.length > 2 || corners.some((corner) => !corner)) {
      throw new ImportRefusal(`Cellules fusionnées illisibles dans la feuille « ${name.trim()} ».`);
    }
    const [a, b = a] = corners as RegExpExecArray[];
    const rows = Math.abs(Number(b[2]) - Number(a[2])) + 1;
    const columns = Math.abs(columnNumber(b[1]) - columnNumber(a[1])) + 1;
    if (rows * columns > MAX_MERGE_CELLS || Math.max(Number(a[2]), Number(b[2])) > MAX_SHEET_ROW) {
      throw new ImportRefusal(`Plage fusionnée trop grande dans la feuille « ${name.trim()} » (${rows} lignes × ${columns} colonnes).`);
    }
    spend(rows * columns);
  }
  return out;
}

const XML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** The sheets' names by their file (workbook.xml → its relations), for the messages only. */
function sheetNames(files: Map<string, Uint8Array>, decoder: TextDecoder): Map<string, string> {
  const names = new Map<string, string>();
  const workbook = files.get("xl/workbook.xml");
  const rels = files.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return names;
  const targets = new Map<string, string>();
  for (const tag of decoder.decode(rels).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attribute(tag[0], "Id");
    const target = attribute(tag[0], "Target");
    if (id && target) targets.set(id, `xl/${target.replace(/^\/?(xl\/)?/, "")}`);
  }
  for (const tag of decoder.decode(workbook).matchAll(/<sheet\b[^>]*>/g)) {
    const name = attribute(tag[0], "name");
    const id = attribute(tag[0], "r:id");
    const target = id ? targets.get(id) : undefined;
    if (name && target) names.set(target, name.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]));
  }
  return names;
}

/**
 * Opens the .xlsx archive and gives it back ready for exceljs: every file
 * inflated under `MAX_IMPORT_UNCOMPRESSED`, the worksheets checked and
 * stripped of their formatting-only cells (`sanitizeWorksheetXml`), stored
 * uncompressed — exceljs then reads a bounded archive. Throws an
 * `ImportRefusal` (or JSZip's error for a file that is no archive).
 */
export async function inspectXlsx(data: ArrayBuffer | Uint8Array): Promise<Buffer> {
  const zip = await JSZip.loadAsync(data);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_IMPORT_ENTRIES) throw new ImportRefusal("Classeur illisible : trop de fichiers dans l'archive.");
  const worksheets = entries.filter((entry) => WORKSHEET_PATH.test(entry.name));
  if (worksheets.length > MAX_IMPORT_SHEETS) {
    throw new ImportRefusal(`Trop de feuilles (${worksheets.length}) — ${MAX_IMPORT_SHEETS} maximum par classeur.`);
  }
  const budget = { left: MAX_IMPORT_UNCOMPRESSED };
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) files.set(entry.name, await inflate(entry, budget));

  const decoder = new TextDecoder("utf-8");
  const names = sheetNames(files, decoder);
  const cells = { cells: MAX_IMPORT_CELLS };
  const out = new JSZip();
  for (const entry of entries) {
    const content = files.get(entry.name) as Uint8Array;
    const path = entry.name.replace(/^\//, "");
    if (WORKSHEET_PATH.test(path)) {
      out.file(entry.name, sanitizeWorksheetXml(decoder.decode(content), names.get(path) ?? path, cells));
    } else {
      if (SHARED_STRINGS_PATH.test(path)) {
        cells.cells -= (decoder.decode(content).match(/<si\b/g) ?? []).length;
        if (cells.cells < 0) throw tooManyCells();
      }
      out.file(entry.name, content);
    }
    files.delete(entry.name);
  }
  return out.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

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
      const sheetName = file.name.replace(/\.csv$/i, "");
      const content = await file.text();
      const lines = (content.match(/\n/g) ?? []).length;
      if (lines > MAX_SHEET_ROW) throw new ImportRefusal(`Trop de lignes dans le fichier (${lines}) — ${MAX_SHEET_ROW} au plus.`);
      const rows = parseCsv(content).map((row) => row.slice(0, MAX_IMPORT_COLUMNS));
      const count = nonEmptyRows(rows);
      if (count > MAX_IMPORT_ROWS + 10) throw tooManyRows(sheetName, count);
      sheets = [{ name: sheetName, rows: trimmed(rows), monthCells: new Set(), blankFormulas: [] }];
    } else {
      const archive = await inspectXlsx(await file.arrayBuffer());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(archive as unknown as ArrayBuffer);
      const chosen = options.sheets === "first" ? workbook.worksheets.slice(0, 1) : workbook.worksheets;
      sheets = chosen.map(sheetOf);
    }
  } catch (error) {
    if (error instanceof ImportRefusal) return { error: error.message };
    return { error: "Fichier illisible — un classeur .xlsx (ou un .csv) est attendu." };
  }
  return { sheets };
}

/**
 * Whether the request announces a body larger than any import accepts —
 * checked before `request.formData()` reads it (the 8 Mo of the file are
 * checked once read; nginx caps the body in production too).
 */
export function importRequestTooLarge(request: Request): boolean {
  const length = Number(request.headers.get("content-length") ?? "");
  return Number.isFinite(length) && length > MAX_IMPORT_REQUEST_BYTES;
}

/** The first sheet's rows (the lot 3D contract: the register, the suppliers). */
export async function readImportFile(file: File): Promise<{ rows: SheetRow[] } | { error: string }> {
  const read = await readImportWorkbook(file, { sheets: "first" });
  if ("error" in read) return read;
  return { rows: read.sheets[0]?.rows ?? [] };
}
