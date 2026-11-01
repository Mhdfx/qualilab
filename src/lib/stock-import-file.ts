import "server-only";
import ExcelJS from "exceljs";
import { parseCsv } from "./csv";
import { MAX_IMPORT_ROWS, type SheetCell, type SheetRow } from "./stock-import";

/**
 * Reads the workbook of an import of the magasin (lot 3D, M8) into rows:
 * an .xlsx (its first sheet) or a .csv. The laboratory's « Journal Achat »
 * is an old .xls: Excel saves it as .xlsx in one click — the message says so.
 */

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

function cellValue(value: ExcelJS.CellValue): SheetCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
  }
  return String(value);
}

export async function readImportFile(file: File): Promise<{ rows: SheetRow[] } | { error: string }> {
  if (file.size > MAX_IMPORT_BYTES) return { error: "Fichier trop volumineux (8 Mo maximum)." };
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) {
    return { error: "Ancien format .xls : ouvrez le fichier dans Excel et enregistrez-le au format .xlsx." };
  }
  let rows: SheetRow[];
  try {
    if (name.endsWith(".csv")) {
      rows = parseCsv(await file.text());
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      rows = [];
      sheet?.eachRow({ includeEmpty: true }, (row, number) => {
        const values = (row.values as ExcelJS.CellValue[]).slice(1);
        rows[number - 1] = values.map((value) => cellValue(value ?? null));
      });
      rows = Array.from(rows, (row) => row ?? []);
    }
  } catch {
    return { error: "Fichier illisible — un classeur .xlsx (ou un .csv) est attendu." };
  }
  if (rows.length > MAX_IMPORT_ROWS + 10) {
    return { error: `Trop de lignes (${rows.length}) — ${MAX_IMPORT_ROWS} maximum par fichier.` };
  }
  return { rows };
}
