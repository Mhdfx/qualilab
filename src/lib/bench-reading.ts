import { applyCalcFactor, parseLabValue, suggestConformity, type ParsedValue } from "./result-value";
import {
  aboveBelowLimit,
  applyUnitFactor,
  parseUnitReading,
  suggestUnitsConformity,
  summariseReadings,
  type UnitReading,
} from "./interpretation";
import { repetitionLabel } from "./series";

/**
 * How a line of the bench reads — pure, shared by the entry screen
 * (`ResultEntryForm`), its page and the submission (`POST …/results/submit`),
 * so that what the screen asks for is what the server checks.
 */

/**
 * The unit a line is read in: its criterion's (the family's sampling plan,
 * « /1 g » for Salmonella on raw poultry), else the parameter's — the unit
 * the bench sheet, the stored result, the validation page and the report
 * print (Q40, 16/10).
 */
export function benchUnit(plan: { unit: string | null } | null | undefined, parameterUnit: string | null): string | null {
  return plan?.unit ?? parameterUnit;
}

/** A line judged against the parameter's own limit — no criterion. */
export type LimitReading = {
  /** The final reading (the worst unit when read per unit); null while nothing is typed. */
  parsed: ParsedValue | null;
  /** The conformity the reading decides on its own; null when it cannot. */
  suggested: boolean | null;
  /** « > x » below the limit: why the conformity cannot be computed. */
  undecided: string | null;
  /**
   * The technician chooses « Conforme » / « Non conforme »: the reading is
   * meaningful but not a number (« Présence », « Indénombrable » without a
   * limit, a text the engine cannot read on a single value), or a « > x »
   * below the limit.
   */
  needsManual: boolean;
};

/** The readings of a line read per unit, the dilution applied as the server applies it. */
export type UnitsRead = {
  readings: UnitReading[];
  /** How many repetitions hold something. */
  typedUnits: number;
  /** Repetitions typed in a notation the engine cannot read (« abc »): R1, R4… */
  unreadable: string[];
};

export function benchUnits(units: string[], factor: number): UnitsRead {
  const readings = units.map((unit) => applyUnitFactor(parseUnitReading(unit), factor));
  return {
    readings,
    typedUnits: readings.filter((reading) => reading.kind !== "empty").length,
    // A reading the engine cannot parse is neither a count nor an absence:
    // it must be retyped, never silently dropped.
    unreadable: readings.flatMap((reading, index) => (reading.kind === "unreadable" ? [repetitionLabel(index + 1)] : [])),
  };
}

/**
 * One value against the parameter's limit. The suggestion compares the
 * FINAL value — the reading × the factor — exactly as `PUT …/results`
 * stores it.
 */
export function valueAgainstLimit(value: string, factor: number, limitValue: number | null | undefined): LimitReading {
  const text = value.trim();
  if (!text) return { parsed: null, suggested: null, undecided: null, needsManual: false };
  const parsed = applyCalcFactor(parseLabValue(text), factor);
  const suggested = suggestConformity(parsed.numeric, limitValue, parsed.kind);
  const undecided =
    parsed.kind === "above" && suggested === null
      ? aboveBelowLimit([applyUnitFactor(parseUnitReading(text), factor)], limitValue)
      : null;
  return {
    parsed,
    suggested,
    undecided,
    needsManual: suggested === null && (parsed.numeric === null || undecided !== null),
  };
}

/**
 * Every unit against the parameter's limit: the worst one decides. The
 * technician decides only once every repetition typed reads — a decision
 * taken earlier must not outlive the reading it was about.
 */
export function unitsAgainstLimit(
  units: string[],
  factor: number,
  limitValue: number | null | undefined
): UnitsRead & LimitReading {
  const read = benchUnits(units, factor);
  const summary = summariseReadings(read.readings);
  const parsed = summary.value ? { ...parseLabValue(summary.value), numeric: summary.numeric } : null;
  const suggested = suggestUnitsConformity(read.readings, limitValue);
  const undecided = suggested === null ? aboveBelowLimit(read.readings, limitValue) : null;
  return {
    ...read,
    parsed,
    suggested,
    undecided,
    needsManual:
      read.typedUnits > 0 &&
      read.unreadable.length === 0 &&
      suggested === null &&
      (parsed?.numeric == null || undecided !== null),
  };
}

/** A stored result, as the submission reads it again. */
export type StoredResult = {
  /** The criterion frozen with the result: its verdict decides, never a choice. */
  criterion: unknown;
  conform: boolean | null;
  value: string | null;
  /** The bench reading as typed, when the stored value rewrote it. */
  rawValue: string | null;
  units: { unitIndex: number; rawValue: string }[];
};

/**
 * A result still waiting for the technician's « Conforme » / « Non
 * conforme »: no criterion, nothing stored, and the reading — read again
 * from what was typed, with the line's factor and limit — is one the screen
 * asks a choice for. The screen keeps « Soumettre » closed on such a line;
 * the submission refuses it too, so a stale page or a forged request never
 * sends an unjudged result to validation (Q78, 16/10).
 */
export function awaitsManualConformity(
  result: StoredResult,
  line: { unitCount: number; factor: number; limitValue: number | null }
): boolean {
  if (result.criterion !== null || result.conform !== null) return false;
  if (line.unitCount > 1) {
    const typed = Array.from(
      { length: line.unitCount },
      (_, index) => result.units.find((unit) => unit.unitIndex === index + 1)?.rawValue ?? ""
    );
    return unitsAgainstLimit(typed, line.factor, line.limitValue).needsManual;
  }
  return valueAgainstLimit(result.rawValue ?? result.value ?? "", line.factor, line.limitValue).needsManual;
}
