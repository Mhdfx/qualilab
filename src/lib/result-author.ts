import type { ResultWorkStatus } from "@/generated/prisma/enums";

/**
 * Who typed each reading (RETOUR-LABO-16-10.md, D-09 — C3 « Avec lui »).
 *
 * The bench screen sends the whole sheet on every « Enregistrer », so
 * `PUT …/results` used to write `enteredById` / `enteredAt` on every line:
 * whoever saved last became the author of readings a colleague (or the
 * admin standing in) had typed. A line keeps its author and its time now
 * unless what was typed on it changed — the value, a unit's reading, the
 * note, the step, or the technician's own « Conforme / Non conforme ».
 *
 * Only what a person types counts. What the server derives from it — the
 * final value after a factor, the worst unit, the verdict of a criterion,
 * a conformity computed against the limit — follows the reading, and may
 * move on its own when the catalogue or the engine changes: that is no one
 * typing. A line never typed on has no author (`hasTypedResult`'s empty
 * line: no value, no note, no unit, « En cours »).
 *
 * A line may move between one value and a grid R1 … Rn while it is in
 * analysis: its plan comes live from the criteria catalogue. A single value
 * is compared as R1, so the move alone is no one's typing, and a reading the
 * move leaves behind (the grid on screen starts empty) is an erasure by
 * whoever saves it.
 *
 * A line saved empty before D-09 still carries whoever saved it last, and
 * keeps that author until someone types on it: an untouched line is never
 * rewritten here.
 */

/** What is typed on one line of the sheet, as stored. */
export type TypedReading = {
  /**
   * A single value as typed: `rawValue ?? value` (a factor or « 3(-2) »
   * rewrites `value`, never `rawValue`). On a line read per unit `value` is
   * the worst unit, derived: it is not compared there — a stored line with
   * units is read per unit.
   */
  typed: string | null;
  /** The units typed, R1 … Rn — an empty unit is never stored. */
  units: { unitIndex: number; rawValue: string }[];
  note: string | null;
  workStatus: ResultWorkStatus;
  conform: boolean | null;
};

/** The author of a line as stored: null on a line never typed on. */
export type ReadingAuthor = { enteredById: string | null; enteredAt: Date | null };

/** The line a save sends, with what the server knows of how it was read. */
export type SavedReading = TypedReading & {
  /** Read per unit (R1 … Rn): the units are the reading, `typed` is derived. */
  perUnit: boolean;
  /**
   * `conform` is the technician's choice — where the screen asks for one:
   * `valueAgainstLimit` / `unitsAgainstLimit` `.needsManual`, the rule the
   * screen and the submission apply — not a computed verdict.
   */
  conformChosen: boolean;
};

/** The line before anything was typed on it. */
const NOTHING_TYPED: TypedReading = { typed: null, units: [], note: null, workStatus: "EN_COURS", conform: null };

const text = (value: string | null | undefined) => (value ?? "").trim();

/** The units typed, in order: « R2 = 10 » is not « R1 = 10 ». */
function unitsKey(units: TypedReading["units"]): string {
  return JSON.stringify(
    units
      .map((unit) => [unit.unitIndex, text(unit.rawValue)] as const)
      .filter(([, raw]) => raw !== "")
      .sort(([a], [b]) => a - b)
  );
}

/**
 * What is typed on a line, one value or a grid alike: a single value counts
 * as R1, so a line the catalogue moves between the two compares as typed.
 */
function readingKey(units: TypedReading["units"], typed: string | null, perUnit: boolean): string {
  return unitsKey(perUnit ? units : text(typed) ? [{ unitIndex: 1, rawValue: typed as string }] : []);
}

/** A stored `Result` (with its units) read back as what was typed on it. */
export function storedReading(row: {
  value: string | null;
  rawValue: string | null;
  note: string | null;
  workStatus: ResultWorkStatus;
  conform: boolean | null;
  units: { unitIndex: number; rawValue: string }[];
}): TypedReading {
  return {
    typed: row.rawValue ?? row.value,
    units: row.units,
    note: row.note,
    workStatus: row.workStatus,
    conform: row.conform,
  };
}

/** The units of a save, R1 … Rn as typed — the empty ones are not stored. */
export function typedUnits(readings: { raw: string; kind: string }[] | null): TypedReading["units"] {
  return (readings ?? []).flatMap((reading, index) =>
    reading.kind === "empty" ? [] : [{ unitIndex: index + 1, rawValue: reading.raw }]
  );
}

/**
 * Whether this save changes what was typed on the line. `before` is null for
 * a line never saved: it then counts as an empty one, so a line saved empty
 * is no one's typing.
 */
export function readingChanged(before: TypedReading | null, after: SavedReading): boolean {
  const was = before ?? NOTHING_TYPED;
  if (was.workStatus !== after.workStatus) return true;
  if (text(was.note) !== text(after.note)) return true;
  // A stored line read per unit has its units (or nothing typed at all).
  if (readingKey(was.units, was.typed, was.units.length > 0) !== readingKey(after.units, after.typed, after.perUnit)) {
    return true;
  }
  // A computed conformity follows the reading (or the catalogue): only the
  // technician's own « Conforme / Non conforme » is typing.
  if (after.conformChosen && was.conform !== after.conform) return true;
  return false;
}

/**
 * The author a save leaves on a line: whoever saves it when what is typed
 * changes, at the time of the save; otherwise the stored author and time,
 * untouched (none for a line never typed on). `replaced` names the colleague
 * the line is taken from — the journal keeps who typed it before.
 */
export function resultAuthor(
  before: (TypedReading & ReadingAuthor) | null,
  after: SavedReading,
  actorId: string,
  now: Date
): ReadingAuthor & { changed: boolean; replaced: string | null } {
  if (readingChanged(before, after)) {
    const was = before?.enteredById ?? null;
    return { enteredById: actorId, enteredAt: now, changed: true, replaced: was !== actorId ? was : null };
  }
  return { enteredById: before?.enteredById ?? null, enteredAt: before?.enteredAt ?? null, changed: false, replaced: null };
}
