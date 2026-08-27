import { describe, it, expect } from "vitest";
import { detectDelimiter, parseCsv } from "./csv";
import { guessMapping, validateImport } from "./client-import";

/**
 * The import will run once, on the laboratory's real historical data — a
 * failure there is silent data corruption in production. These tests pin the
 * behaviours that matter: Excel's actual output quirks, header guessing, and
 * the fact that every row obeys the same rules as the creation form.
 */

describe("parseCsv", () => {
  it("reads a Moroccan Excel export: semicolons, CRLF, BOM", () => {
    const text = "﻿Raison sociale;ICE;Email\r\nRestaurant Atlas;001234567000045;chef@atlas.ma\r\n";
    expect(detectDelimiter(text.replace(/^﻿/, ""))).toBe(";");
    expect(parseCsv(text)).toEqual([
      ["Raison sociale", "ICE", "Email"],
      ["Restaurant Atlas", "001234567000045", "chef@atlas.ma"],
    ]);
  });

  it("keeps a quoted field containing the delimiter and doubled quotes", () => {
    const rows = parseCsv('"Café ""Le Central"";Rabat";100\n');
    expect(rows).toEqual([['Café "Le Central";Rabat', "100"]]);
  });

  it("handles commas and tabs when that is what the file uses", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("drops fully empty lines instead of importing ghost clients", () => {
    expect(parseCsv("a;b\n;\n\nc;d\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("guessMapping", () => {
  it("recognises the headers a lab tool actually writes", () => {
    expect(
      guessMapping(["Raison sociale", "ICE", "Adresse", "Téléphone", "E-mail", "Contact"])
    ).toEqual(["name", "ice", "address", "phone", "email", "contact"]);
  });

  it("never assigns the same field to two columns", () => {
    expect(guessMapping(["Nom", "Nom 2"])).toEqual(["name", ""]);
  });

  it("leaves unknown columns unmapped rather than guessing wrong", () => {
    expect(guessMapping(["Colonne mystère"])).toEqual([""]);
  });
});

describe("validateImport", () => {
  const rows = [
    ["Raison sociale", "ICE"],
    ["Restaurant Atlas", "001234567000045"],
    ["", "000000000000001"],
    ["Hôtel Majorelle", "12"],
    ["Restaurant Atlas", "001234567000045"],
  ];
  const mapping: ("name" | "ice" | "")[] = ["name", "ice"];

  it("validates with the same rules as the creation form, line-accurately", () => {
    const result = validateImport(rows, mapping, true);
    expect(result.valid.map((r) => r.value.name)).toEqual(["Restaurant Atlas"]);
    // Line numbers are the file's real ones — openable in Excel.
    expect(result.invalid).toEqual([
      { line: 3, error: "La raison sociale est obligatoire." },
      { line: 4, error: "L'ICE doit comporter 15 chiffres." },
    ]);
    expect(result.duplicatesInFile).toHaveLength(1);
    expect(result.duplicatesInFile[0].line).toBe(5);
  });

  it("treats every row as data when the file has no header", () => {
    const result = validateImport([["Client A", ""]], ["name", "ice"], false);
    expect(result.valid).toEqual([
      { line: 1, value: expect.objectContaining({ name: "Client A" }) },
    ]);
  });

  it("ignores unmapped columns entirely", () => {
    const result = validateImport(
      [["Client B", "junk", "notes internes"]],
      ["name", "", ""],
      false
    );
    expect(result.valid[0].value.name).toBe("Client B");
  });
});
