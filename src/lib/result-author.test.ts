import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { unitsAgainstLimit, valueAgainstLimit } from "./bench-reading";
import { parseUnitReading } from "./interpretation";
import {
  readingChanged,
  resultAuthor,
  storedReading,
  typedUnits,
  type ReadingAuthor,
  type SavedReading,
  type TypedReading,
} from "./result-author";

/**
 * RETOUR-LABO-16-10.md, D-09 (C3 « Avec lui ») — the sheet comes back whole on
 * every save: only the lines whose typing changed take the saver as author.
 */

const MONDAY = new Date("2026-10-19T09:00:00Z");
const TUESDAY = new Date("2026-10-20T15:30:00Z");

/** A line as stored, typed by tech A on Monday. */
function stored(over: Partial<TypedReading & ReadingAuthor> = {}): TypedReading & ReadingAuthor {
  return {
    typed: "50",
    units: [],
    note: null,
    workStatus: "EN_COURS",
    conform: true,
    enteredById: "tech-a",
    enteredAt: MONDAY,
    ...over,
  };
}

/** The same line as a save sends it back. */
function saved(over: Partial<SavedReading> = {}): SavedReading {
  return { typed: "50", units: [], note: null, workStatus: "EN_COURS", conform: true, perUnit: false, conformChosen: false, ...over };
}

describe("resultAuthor — who « saisi par » a line is after a save", () => {
  it("keeps the author and the time of a line the save sends back unchanged", () => {
    expect(resultAuthor(stored(), saved(), "tech-b", TUESDAY)).toEqual({
      enteredById: "tech-a",
      enteredAt: MONDAY,
      changed: false,
      replaced: null,
    });
  });

  it("gives a line whose value changed to whoever saves it, at the time of the save — and names whom it was taken from", () => {
    expect(resultAuthor(stored(), saved({ typed: "60" }), "tech-b", TUESDAY)).toEqual({
      enteredById: "tech-b",
      enteredAt: TUESDAY,
      changed: true,
      replaced: "tech-a",
    });
  });

  it("names no one replaced when the author retypes their own line, or a line with no author", () => {
    expect(resultAuthor(stored(), saved({ typed: "60" }), "tech-a", TUESDAY)).toMatchObject({ changed: true, replaced: null });
    expect(resultAuthor(stored({ enteredById: null, enteredAt: null }), saved({ typed: "60" }), "admin", TUESDAY)).toMatchObject({
      enteredById: "admin",
      changed: true,
      replaced: null,
    });
  });

  it("gives a first reading to whoever typed it", () => {
    expect(resultAuthor(null, saved(), "tech-b", TUESDAY)).toEqual({
      enteredById: "tech-b",
      enteredAt: TUESDAY,
      changed: true,
      replaced: null,
    });
  });

  it("leaves a line saved empty with no author — no one typed on it", () => {
    const empty = saved({ typed: null, conform: null });
    expect(resultAuthor(null, empty, "tech-b", TUESDAY)).toEqual({ enteredById: null, enteredAt: null, changed: false, replaced: null });
    // Typed on later: its author is the one who typed.
    expect(resultAuthor({ ...stored({ typed: null, conform: null }), enteredById: null, enteredAt: null }, saved(), "tech-a", TUESDAY))
      .toMatchObject({ enteredById: "tech-a", changed: true });
  });

  it("answers a cleared reading to whoever cleared it", () => {
    expect(resultAuthor(stored(), saved({ typed: null, conform: null }), "tech-b", TUESDAY)).toMatchObject({
      enteredById: "tech-b",
      changed: true,
      replaced: "tech-a",
    });
  });

  it("keeps the stored author when it is null (a user since deleted)", () => {
    expect(resultAuthor(stored({ enteredById: null, enteredAt: null }), saved(), "admin", TUESDAY)).toEqual({
      enteredById: null,
      enteredAt: null,
      changed: false,
      replaced: null,
    });
  });

  it("keeps the last saver on a line saved empty before D-09, until someone types on it", () => {
    // Before D-09 every save, an empty one too, wrote its author: such a line
    // still names whoever saved the sheet last. An untouched line is never
    // rewritten, so it keeps that name; the first reading typed replaces it.
    const legacy = { ...stored({ typed: null, conform: null }), enteredById: "admin", enteredAt: MONDAY };
    expect(resultAuthor(legacy, saved({ typed: null, conform: null }), "tech-b", TUESDAY)).toEqual({
      enteredById: "admin",
      enteredAt: MONDAY,
      changed: false,
      replaced: null,
    });
    expect(resultAuthor(legacy, saved({ typed: "50" }), "tech-b", TUESDAY)).toMatchObject({
      enteredById: "tech-b",
      enteredAt: TUESDAY,
      changed: true,
    });
  });
});

describe("readingChanged — what counts as typing", () => {
  it("the note and the step", () => {
    expect(readingChanged(stored(), saved({ note: "Boîte fêlée" }))).toBe(true);
    expect(readingChanged(stored({ note: "Boîte fêlée" }), saved({ note: "Boîte fêlée" }))).toBe(false);
    expect(readingChanged(stored(), saved({ workStatus: "TERMINE" }))).toBe(true);
    expect(readingChanged(stored(), saved({ workStatus: "ANOMALIE", note: "Gélose contaminée" }))).toBe(true);
  });

  it("not the spaces around a note, nor an empty note stored as null", () => {
    expect(readingChanged(stored({ note: null }), saved({ note: "" }))).toBe(false);
    expect(readingChanged(stored({ note: "à relire" }), saved({ note: " à relire " }))).toBe(false);
  });

  it("compares a single value as typed, not as the report prints it", () => {
    // « 3(-2) » stored as « 3.10² » with the raw entry kept…
    const shorthand = storedReading({
      value: "3.10²",
      rawValue: "3(-2)",
      note: null,
      workStatus: "EN_COURS",
      conform: null,
      units: [],
    });
    expect(readingChanged(shorthand, saved({ typed: "3(-2)", conform: null }))).toBe(false);
    // …and as typed by a save made before « 3(-2) » was read (lot 2A, C4).
    const before = storedReading({ value: "3(-2)", rawValue: null, note: null, workStatus: "EN_COURS", conform: null, units: [] });
    expect(readingChanged(before, saved({ typed: "3(-2)", conform: null }))).toBe(false);
    expect(readingChanged(before, saved({ typed: "4(-2)", conform: null }))).toBe(true);
  });

  it("compares the units one by one, in their place", () => {
    const grid = stored({ typed: "1.10²", units: [{ unitIndex: 1, rawValue: "10" }, { unitIndex: 2, rawValue: "1(-1)" }] });
    const same = saved({ typed: "1.10²", perUnit: true, units: typedUnits(["10", "1(-1)", ""].map(parseUnitReading)) });
    expect(readingChanged(grid, same)).toBe(false);
    // One unit retyped.
    expect(readingChanged(grid, saved({ ...same, units: typedUnits(["10", "2(-1)", ""].map(parseUnitReading)) }))).toBe(true);
    // A third unit typed.
    expect(readingChanged(grid, saved({ ...same, units: typedUnits(["10", "1(-1)", "30"].map(parseUnitReading)) }))).toBe(true);
    // The same readings in other units are not the same grid.
    expect(readingChanged(grid, saved({ ...same, units: typedUnits(["", "10", "1(-1)"].map(parseUnitReading)) }))).toBe(true);
  });

  it("does not compare the worst unit of a grid: it is derived from the units", () => {
    const grid = stored({ typed: "1.10²", units: [{ unitIndex: 1, rawValue: "100" }] });
    // The engine prints it otherwise now: the technician typed nothing new.
    expect(readingChanged(grid, saved({ typed: "100", perUnit: true, units: [{ unitIndex: 1, rawValue: "100" }] }))).toBe(false);
  });

  it("compares a line the catalogue moves between one value and a grid as typed: one value is R1", () => {
    // A criterion added: the single « 10 » shows as an empty R1, and the save
    // erases it; whoever saves answers for the erasure.
    const single = stored({ typed: "10" });
    expect(readingChanged(single, saved({ typed: null, conform: null, perUnit: true, units: typedUnits([parseUnitReading("")]) }))).toBe(true);
    // The same reading in R1: the move alone is no one's typing.
    expect(readingChanged(single, saved({ typed: "10", perUnit: true, units: [{ unitIndex: 1, rawValue: "10" }] }))).toBe(false);
    // The criterion deactivated: R1 = « 10 » sent back as the single « 10 ».
    const grid = stored({ typed: "10", units: [{ unitIndex: 1, rawValue: "10" }] });
    expect(readingChanged(grid, saved({ typed: "10" }))).toBe(false);
    // R1 and R2 typed, one value sent back: a reading went.
    const two = stored({ typed: "20", units: [{ unitIndex: 1, rawValue: "10" }, { unitIndex: 2, rawValue: "20" }] });
    expect(readingChanged(two, saved({ typed: "20" }))).toBe(true);
    // Nothing typed either way: nothing changed.
    expect(readingChanged(stored({ typed: null, conform: null }), saved({ typed: null, conform: null, perUnit: true }))).toBe(false);
  });

  it("counts the technician's own « Conforme / Non conforme », not a computed one", () => {
    // Chosen on the screen (no suggestion): a choice is typing.
    expect(readingChanged(stored({ typed: "Présence", conform: true }), saved({ typed: "Présence", conform: false, conformChosen: true }))).toBe(true);
    expect(readingChanged(stored({ typed: "Présence", conform: true }), saved({ typed: "Présence", conform: true, conformChosen: true }))).toBe(false);
    // Computed against a limit (or a criterion) that changed: no one typed.
    expect(readingChanged(stored({ conform: true }), saved({ conform: false, conformChosen: false }))).toBe(false);
  });

  it("takes a conformity as chosen exactly where the screen asks for one (needsManual)", () => {
    // The limit removed from the catalogue: « 50 », computed conforme, comes
    // back with no conformity, and the screen asked for none.
    expect(
      readingChanged(
        stored({ typed: "50", conform: true }),
        saved({ typed: "50", conform: null, conformChosen: valueAgainstLimit("50", 1, null).needsManual })
      )
    ).toBe(false);
    // An empty line: a stale or forged conformity sent on it is no one's typing.
    expect(valueAgainstLimit("", 1, 100).needsManual).toBe(false);
    expect(unitsAgainstLimit(["", ""], 1, 100).needsManual).toBe(false);
    // « Présence », or « > x » below the limit: the technician chooses.
    expect(valueAgainstLimit("Présence", 1, 100).needsManual).toBe(true);
    expect(unitsAgainstLimit(["10", "> 50"], 1, 100).needsManual).toBe(true);
  });
});

describe("typedUnits — the units a save stores", () => {
  it("keeps the typed ones, numbered R1 … Rn in their place", () => {
    expect(typedUnits(["10", "", "Absence"].map(parseUnitReading))).toEqual([
      { unitIndex: 1, rawValue: "10" },
      { unitIndex: 3, rawValue: "Absence" },
    ]);
    expect(typedUnits(null)).toEqual([]);
  });
});

describe("PUT …/results writes the author through resultAuthor", () => {
  const source = readFileSync(fileURLToPath(new URL("../app/api/samples/[id]/results/route.ts", import.meta.url)), "utf8");

  it("reads the stored lines under the lock, before writing them", () => {
    const lock = source.indexOf("lockTakeState(tx, sample.id)");
    const read = source.indexOf("tx.result.findMany(");
    const write = source.indexOf("tx.result.upsert(");
    expect(lock).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(lock);
    expect(write).toBeGreaterThan(read);
  });

  it("never re-attributes an unchanged line to the saver", () => {
    expect(source).toContain("update: author.changed ? { ...data, enteredById: session.id, enteredAt: now } : data");
    expect(source).toContain("enteredById: author.enteredById,");
    expect(source.match(/enteredById: session\.id/g)).toHaveLength(1);
  });

  it("compares what was typed: the raw entry, and a conformity only where the screen asks for one", () => {
    expect(source).toContain("typed: data.rawValue ?? data.value,");
    const chosen = source.match(/conformChosen: .+,/g) ?? [];
    expect(chosen).toHaveLength(3);
    expect(chosen).toContain("conformChosen: false,");
    expect(chosen).toContain("conformChosen: unitsAgainstLimit(units, factor, parameter.limitValue).needsManual,");
    expect(chosen).toContain("conformChosen: valueAgainstLimit(value, factor, parameter.limitValue).needsManual,");
  });

  it("journals whom each retyped line was taken from", () => {
    expect(source).toContain("if (author.replaced) replaced[entry.parameterId] = author.replaced;");
    expect(source).toContain("replaced: written.replaced,");
  });
});

describe("« Saisi par » on the validation page (D-09)", () => {
  const page = readFileSync(fileURLToPath(new URL("../app/validation/[id]/page.tsx", import.meta.url)), "utf8");

  it("reads each result's author and time, and names them only on a typed line", () => {
    expect(page).toContain("enteredBy: { select: { name: true } },");
    expect(page).toContain("enteredAt: true,");
    expect(page).toContain("result.enteredBy && result.enteredAt && (result.value || result.units.length > 0)");
    expect(page).toContain("Saisi par {result.enteredBy.name} le {formatDateTime(result.enteredAt)}");
  });
});
