import type { Prisma } from "@/generated/prisma/client";
import type { Interpretation } from "@/generated/prisma/enums";
import { parseUnitReading, suggestUnitsConformity, type UnitReading } from "./interpretation";
import { PRESENCE_OVER_ZERO_LIMIT_NON_CONFORME } from "./lab-proposals";
import { suggestConformity, type ParsedValue } from "./result-value";

/**
 * Which results raise a contamination alert — pure, one rule for the
 * dispatch (`sendContaminationAlerts`) and the validation screen's count.
 *
 * A sensitive germ (`alertOnExceed`) alerts when
 *  1. it is judged over its limit: officially (`conform: false`, which every
 *     « Non satisfaisant » verdict sets, and a technician's « Non conforme »)
 *     or only indicatively (too few units, RETOUR-LABO-29-09.md §3); or
 *  2. it carries no judgement at all — no criterion, no limit, so no
 *     verdict (28/10, 2.11 : « si on n'a pas de critère, nous ne faisons pas
 *     d'interprétation », J3) — and its reading shows the germ: a presence, a
 *     count above zero, « > x » or « Indénombrable » (`Result.detected`).
 *     This is rule O-12 (RETOUR-LABO-28-10.md §5, lot 3B): without it, a
 *     Salmonella present on a surface without criterion would lose its alert
 *     the day the bench stops asking « Conforme / Non conforme » for it.
 *
 * It reads verdicts and the stored presence, never `numericValue`: an
 * « Indénombrable » plate or a « Présence » has no number at all and must
 * alert all the same — the lesson of the 09/09 audit, where a fix silently
 * lost alerts.
 */
export type AlertCandidate = {
  conform: boolean | null;
  interpretation: Interpretation | null;
  informalInterpretation: Interpretation | null;
  /** The reading shows the germ (O-12); null = unknown (nothing readable, or saved before lot 3B). */
  detected: boolean | null;
  parameter: { alertOnExceed: boolean };
};

/** Rule 2: nothing judged the result — no verdict, no indicative one, no conformity. */
export function carriesNoJudgement(result: Pick<AlertCandidate, "conform" | "interpretation" | "informalInterpretation">): boolean {
  return result.conform === null && result.interpretation === null && result.informalInterpretation === null;
}

export function raisesContaminationAlert(result: AlertCandidate): boolean {
  if (!result.parameter.alertOnExceed) return false;
  if (result.conform === false || result.informalInterpretation === "NON_SATISFAISANT") return true;
  return carriesNoJudgement(result) && result.detected === true;
}

/** `raisesContaminationAlert`, as the database filters it. */
export const ALERT_RESULT_WHERE: Prisma.ResultWhereInput = {
  parameter: { alertOnExceed: true },
  OR: [
    { conform: false },
    { informalInterpretation: "NON_SATISFAISANT" },
    { conform: null, interpretation: null, informalInterpretation: null, detected: true },
  ],
};

/** One reading shows the germ: present, uncountable, « > x », or a count above zero. */
function shows(reading: UnitReading): boolean {
  return reading.detected === true || reading.kind === "above" || (reading.detected === null && (reading.value ?? 0) > 0);
}

/**
 * What `Result.detected` stores for a line (O-12): true as soon as one
 * reading shows the germ — whatever the dilution, a count above zero stays
 * above zero —, false when every reading typed says it is absent
 * (« Absence », « < 10 », « 0 »), null when nothing readable was typed (an
 * empty line, a text the engine cannot read: never guessed).
 */
export function readingsShowGerm(readings: readonly UnitReading[]): boolean | null {
  const usable = readings.filter((reading) => reading.kind !== "empty" && reading.kind !== "unreadable");
  if (usable.length === 0) return null;
  return usable.some(shows);
}

/** `readingsShowGerm` for a line read as one value, as typed. */
export function valueShowsGerm(typed: string | null | undefined): boolean | null {
  return readingsShowGerm([parseUnitReading(typed ?? "")]);
}

/**
 * Lot 5A, J6 — review of the integration (21/11),
 * `PRESENCE_OVER_ZERO_LIMIT_NON_CONFORME`: a reading that shows the germ
 * against a limit ≤ 0 is non conforme on its own — « Présence » has no
 * number, and a zero-tolerance alert must not hang on a « Conforme » click.
 * Otherwise the reading's own suggestion (`suggestConformity`). Lives here,
 * not in `result-value.ts`, to keep that module free of imports (no cycle
 * through `interpretation.ts`).
 */
export function suggestConformityOf(
  text: string | null | undefined,
  parsed: Pick<ParsedValue, "numeric" | "kind">,
  limitValue: number | null | undefined,
  presenceOverZero: boolean = PRESENCE_OVER_ZERO_LIMIT_NON_CONFORME
): boolean | null {
  if (presenceOverZero && limitValue !== null && limitValue !== undefined && limitValue <= 0 && valueShowsGerm(text) === true) {
    return false;
  }
  return suggestConformity(parsed.numeric, limitValue, parsed.kind);
}

/** `suggestConformityOf` for a line read per unit: one unit showing the germ against a limit ≤ 0 is enough. */
export function suggestUnitsConformityOf(
  readings: UnitReading[],
  limitValue: number | null | undefined,
  presenceOverZero: boolean = PRESENCE_OVER_ZERO_LIMIT_NON_CONFORME
): boolean | null {
  if (presenceOverZero && limitValue !== null && limitValue !== undefined && limitValue <= 0 && readingsShowGerm(readings) === true) {
    return false;
  }
  return suggestUnitsConformity(readings, limitValue);
}
