import { validateClient, type CleanClient } from "./client-validation";

/**
 * Turning the laboratory's legacy export into client records — the
 * scaffolding half of NEEDEDINFO item 7. The file's exact shape is unknown
 * until they send it, so nothing here assumes an order: the admin maps each
 * column to a field, the mapping is guessed from the headers, and every row
 * passes through the same validateClient() the creation form uses. When the
 * real file arrives, adapting means adjusting a mapping, not writing code.
 */

export const CLIENT_IMPORT_FIELDS = [
  "name",
  "contact",
  "email",
  "phone",
  "address",
  "ice",
] as const;

export type ClientImportField = (typeof CLIENT_IMPORT_FIELDS)[number];
/** One entry per CSV column: a field name, or "" to ignore the column. */
export type ImportMapping = (ClientImportField | "")[];

export const FIELD_LABELS: Record<ClientImportField, string> = {
  name: "Raison sociale",
  contact: "Contact",
  email: "Email",
  phone: "Téléphone",
  address: "Adresse",
  ice: "ICE",
};

/** Header words that reveal which field a column holds, whatever the tool. */
const HEADER_HINTS: [RegExp, ClientImportField][] = [
  [/raison|soci[ée]t[ée]|client|nom|name|entreprise/i, "name"],
  [/ice/i, "ice"],
  [/mail/i, "email"],
  [/t[ée]l|phone|gsm|portable/i, "phone"],
  [/adresse|address|ville/i, "address"],
  [/contact|responsable|interlocuteur/i, "contact"],
];

export function guessMapping(headers: string[]): ImportMapping {
  const used = new Set<ClientImportField>();
  return headers.map((header) => {
    for (const [pattern, field] of HEADER_HINTS) {
      if (pattern.test(header) && !used.has(field)) {
        used.add(field);
        return field;
      }
    }
    return "";
  });
}

export type ImportRow = { line: number; value: CleanClient };
export type ImportError = { line: number; error: string };

export type ImportValidation = {
  valid: ImportRow[];
  invalid: ImportError[];
  /** Rows repeating a name (or ICE) already seen earlier in the same file. */
  duplicatesInFile: ImportError[];
};

/**
 * Applies the mapping and validates every data row. Line numbers are the
 * file's real ones (header included), so an error message points at the line
 * the admin can actually open in Excel.
 */
export function validateImport(
  rows: string[][],
  mapping: ImportMapping,
  hasHeader: boolean
): ImportValidation {
  const valid: ImportRow[] = [];
  const invalid: ImportError[] = [];
  const duplicatesInFile: ImportError[] = [];
  const seenNames = new Set<string>();
  const seenIces = new Set<string>();

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const offset = hasHeader ? 2 : 1;

  dataRows.forEach((cells, index) => {
    const line = index + offset;
    const input: Partial<Record<ClientImportField, string>> = {};
    mapping.forEach((field, column) => {
      if (field) input[field] = cells[column] ?? "";
    });

    const result = validateClient(input);
    if (!result.ok) {
      invalid.push({ line, error: result.error });
      return;
    }

    const nameKey = result.value.name.toLowerCase();
    if (seenNames.has(nameKey) || (result.value.ice && seenIces.has(result.value.ice))) {
      duplicatesInFile.push({
        line,
        error: `« ${result.value.name} » apparaît plusieurs fois dans le fichier.`,
      });
      return;
    }
    seenNames.add(nameKey);
    if (result.value.ice) seenIces.add(result.value.ice);

    valid.push({ line, value: result.value });
  });

  return { valid, invalid, duplicatesInFile };
}
