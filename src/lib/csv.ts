/**
 * A small CSV reader for the legacy-data import (NEEDEDINFO item 7).
 *
 * The laboratory's export will arrive in whatever their current tool
 * produces — most likely an Excel "CSV" with semicolons, sometimes commas or
 * tabs, quotes around fields containing the delimiter, and a BOM. This
 * parser handles exactly that, and nothing more exotic: the goal is to read
 * their file, not to implement RFC 4180 museum pieces.
 */

/** Picks the delimiter that appears most in the first line: ; , or tab. */
export function detectDelimiter(sample: string): string {
  const firstLine = sample.slice(0, sample.indexOf("\n") + 1 || undefined);
  let best = ";";
  let bestCount = -1;
  for (const candidate of [";", ",", "\t"]) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parses CSV text into rows of trimmed fields. Quoted fields may contain the
 * delimiter and line breaks; a doubled quote inside quotes is a literal one.
 * Fully empty rows are dropped.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  // Strip the BOM Excel loves to prepend.
  const input = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === sep) {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  return rows;
}
