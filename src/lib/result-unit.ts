import type { AirMethod, LineKind } from "@/generated/prisma/enums";
import { AIR_EXPOSURE_MINUTES, isExposedPlate } from "./labels";
import { SURFACE_JUDGED_WHATEVER_UNIT, SURFACE_UNIT_CHOSEN_AT_ENTRY, UNIT_MISMATCH_NOT_JUDGED } from "./lab-proposals";

/**
 * The unit a result is expressed in, from what was sampled — pure, shared by
 * the bench screen, its printed sheet, the save (`PUT …/results`, which stores
 * it on the result), the submission and, through the stored unit, the
 * validation, the report and the alert e-mail.
 *
 * - J1 (28/10, 2.3 : « On exprime le résultat par UFC / surface prélevée,
 *   exemple UFC / couteau, UFC / poignée ») — a surface described in words
 *   (« Autre » of the area, `Sample.surfaceAreaNote`) gives « UFC/<texte> »:
 *   « UFC/couteau ».
 * - J2 (28/10, 2.17 and Q50) — the air's unit follows its sampling means:
 *   biocollecteur « UFC/m³ », exposed plate « UFC/boîte (exposée N min) »
 *   (N = `Sample.airExposureMin`, 30 when absent). No volume in litres.
 *
 * Only a count unit is rewritten (one that starts with « UFC », or a bare
 * per-area, per-volume or per-plate denominator — « ufc/m3 », « /cm² »):
 * a presence test « /25 g », a « % » or « - » stay as they are. Every other
 * line — a surface given in cm², foods, waters, hands — keeps its unit.
 *
 * A criterion or a limit whose unit names another basis cannot judge such a
 * line (`unitJudges`): « UFC/cm² » on a couteau, « ufc/m3 » on an exposed
 * plate, « ufc/boite » on a biocollecteur. The line is then read without
 * them — « sans interprétation » (J3) — rather than against a limit it was
 * never expressed in. Hypothèse, à confirmer par R-29: behind the switch
 * `UNIT_MISMATCH_NOT_JUDGED` (`lab-proposals.ts`, on).
 *
 * Lot 5A, J6 (C-1 of 20/11): that rule now holds for the AIR only (hypothèse,
 * à confirmer par D-4). A surface is judged by its value whatever the unit
 * (`SURFACE_JUDGED_WHATEVER_UNIT`), and its unit may be chosen at entry —
 * « UFC/100 cm² » or « UFC/<objet> » (`surfaceUnitChoice`,
 * `SURFACE_UNIT_CHOSEN_AT_ENTRY`): the save stores the unit chosen, and the
 * validation, the report and the alert print that stored unit.
 */
export type UnitContext = {
  lineKind: LineKind | null;
  surfaceAreaNote: string | null;
  airMethod: AirMethod | null;
  airExposureMin: number | null;
};

const UFC = /^\s*ufc\b/i;
/** « cm² », « cm2 », « /25cm² », « m² ». */
const PER_AREA = /m\s*²|cm\s*2(?!\d)/i;
/** « m³ », « m3 ». */
const PER_VOLUME = /m\s*³|m\s*3(?!\d)/i;
/** « boîte », « boite », « Boite ». */
const PER_PLATE = /bo[iî]te/i;

function isCountUnit(unit: string | null | undefined): unit is string {
  if (!unit) return false;
  // « mg/m³ » (a dust, a gas) is no count: only a bare denominator « /cm² » counts colonies.
  return UFC.test(unit) || (/^\s*\//.test(unit) && (PER_AREA.test(unit) || PER_VOLUME.test(unit) || PER_PLATE.test(unit)));
}

/** The words of a surface described in place of its area, as typed; null when none. */
function describedSurface(context: UnitContext): string | null {
  if (context.lineKind !== "SURFACE") return null;
  const note = context.surfaceAreaNote?.trim();
  return note ? note : null;
}

/** « UFC/boîte (exposée 45 min) », « UFC/m³ » — the air's unit for its means. */
export function airUnitText(method: AirMethod, minutes?: number | null): string {
  return isExposedPlate(method) ? `UFC/boîte (exposée ${minutes ?? AIR_EXPOSURE_MINUTES.default} min)` : "UFC/m³";
}

/** `Result.unit` VARCHAR(191) — counted in characters, as MariaDB counts them. */
export const MAX_RESULT_UNIT = 191;

/**
 * A unit cut to fit `Result.unit`: a surface may be described in up to 191
 * characters (`Sample.surfaceAreaNote`), and « UFC/ » before it would
 * overflow the column (« Data too long » in strict mode, a 500 on every save
 * of the sample). The end of the words gives way to « … ».
 */
function boundedUnit(unit: string): string {
  const chars = Array.from(unit);
  if (chars.length <= MAX_RESULT_UNIT) return unit;
  return `${chars.slice(0, MAX_RESULT_UNIT - 1).join("").trimEnd()}…`;
}

/**
 * The unit the result of a line is expressed in: `base` (the criterion's,
 * else the parameter's — `benchUnit`), rewritten for a surface described in
 * words (J1) or an air sample (J2).
 */
export function resultUnit(context: UnitContext, base: string | null): string | null {
  if (!isCountUnit(base)) return base;
  const surface = describedSurface(context);
  if (surface) return boundedUnit(`UFC/${surface}`);
  if (context.lineKind === "AIR" && context.airMethod) return airUnitText(context.airMethod, context.airExposureMin);
  return base;
}

/**
 * Whether a criterion or a limit expressed in `unit` can judge this line:
 * not when the unit names another basis than the one sampled. A unit that
 * is no count (absent, « - », « mg/m³ ») never sets a limit aside.
 */
export function unitJudges(
  context: UnitContext,
  unit: string | null | undefined,
  mismatchNotJudged: boolean = UNIT_MISMATCH_NOT_JUDGED,
  surfaceJudgedWhateverUnit: boolean = SURFACE_JUDGED_WHATEVER_UNIT
): boolean {
  // Lot 5A, J6 (a) — C-1 of 20/11: a surface is judged by its value, whatever
  // the unit of its criterion or limit (« 120 UFC/couteau » against « ≤ 100
  // UFC/100 cm² » is non conforme). No conversion: the numbers are compared.
  if (surfaceJudgedWhateverUnit && context.lineKind === "SURFACE") return true;
  // Switch off (hypothèse R-29 refused): every criterion and limit judges, as before lot 3B.
  if (!mismatchNotJudged) return true;
  // Only a count is expressed per what was sampled; « mg/m³ », « % » judge as before.
  if (!isCountUnit(unit)) return true;
  if (describedSurface(context)) return !PER_AREA.test(unit);
  if (context.lineKind === "AIR" && context.airMethod) {
    if (PER_AREA.test(unit)) return false;
    return isExposedPlate(context.airMethod) ? !PER_VOLUME.test(unit) : !PER_PLATE.test(unit);
  }
  return true;
}

/** The parameter's limit when its unit can judge this line, else none (`unitJudges`). */
export function judgingLimit(context: UnitContext, limitValue: number | null, parameterUnit: string | null): number | null {
  return unitJudges(context, parameterUnit) ? limitValue : null;
}

/** The catalogue threshold printed beside a line: none when its limit cannot judge it. */
export function judgingThreshold(context: UnitContext, threshold: string | null, parameterUnit: string | null): string | null {
  return unitJudges(context, parameterUnit) ? threshold : null;
}

// ─── Lot 5A, J6 (b) — the unit of a surface, chosen at entry ────────────────

/**
 * C-1 of 20/11: « 2 façons pour exprimer l'unité des surfaces : soit UFC/100
 * cm² soit UFC/objet prélevé, donc laisser la possibilité de modifier
 * l'unité ». On a SURFACE line counted in UFC, the bench offers the unit of
 * each result, prefilled as computed (`resultUnit`); the save stores the one
 * chosen (`surfaceUnitChoice`). Behind `SURFACE_UNIT_CHOSEN_AT_ENTRY`. The
 * verdict does not depend on it: a surface is judged by its value
 * (`unitJudges`, J6 (a)).
 */

/** « UFC/100 cm² » — the per-area unit the laboratory names. */
export const SURFACE_UNIT_PER_AREA = "UFC/100 cm²";

/** The longest object typed after « UFC/ » (« couteau », « poignée de porte »). */
export const MAX_SURFACE_OBJECT = 60;

/** The unit's refusals, worded once for the screen and the API. */
export const SURFACE_UNIT_MESSAGES = {
  notChoosable: "l'unité ne se choisit que pour une surface comptée en UFC.",
  invalid: `unité invalide : choisissez « ${SURFACE_UNIT_PER_AREA} » ou « UFC/ » suivi de l'objet prélevé (${MAX_SURFACE_OBJECT} caractères au plus).`,
} as const;

/** May the unit of this line be chosen at entry? A SURFACE line whose base unit is a count. */
export function surfaceUnitEditable(
  context: UnitContext,
  base: string | null,
  enabled: boolean = SURFACE_UNIT_CHOSEN_AT_ENTRY
): boolean {
  return enabled && context.lineKind === "SURFACE" && isCountUnit(base);
}

/** The object a surface was described by, cut to `MAX_SURFACE_OBJECT` characters; "" when none. */
export function surfaceObjectOf(context: UnitContext): string {
  const note = describedSurface(context);
  if (!note) return "";
  return Array.from(note.replace(/\s+/g, " ")).slice(0, MAX_SURFACE_OBJECT).join("").trim();
}

/**
 * The units the bench proposes for a surface line, without repeats: the
 * computed one first (what the sheet is prefilled with), « UFC/100 cm² »,
 * « UFC/<objet> » when the surface was described in words, and the
 * criterion's (`base`) when it differs. Empty when the unit is not chosen
 * (`surfaceUnitEditable`).
 */
export function surfaceUnitChoices(
  context: UnitContext,
  base: string | null,
  enabled: boolean = SURFACE_UNIT_CHOSEN_AT_ENTRY
): string[] {
  if (!surfaceUnitEditable(context, base, enabled)) return [];
  const object = surfaceObjectOf(context);
  const choices = [resultUnit(context, base), SURFACE_UNIT_PER_AREA, object ? `UFC/${object}` : null, base];
  const seen = new Set<string>();
  return choices.filter((unit): unit is string => {
    if (!unit) return false;
    const key = unit.trim().toLocaleLowerCase("fr");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** « UFC/ » followed by an object: the free form of the choice. */
const UFC_PER_OBJECT = /^UFC\s*\/\s*(.+)$/i;
/** No control character in a unit printed on the report. */
const CONTROL_CHARS = /\p{Cc}/u;

/**
 * The unit a save stores for a line: the one posted when it may be chosen
 * and is valid — one of `surfaceUnitChoices`, or « UFC/<objet> » with an
 * object of 1 to `MAX_SURFACE_OBJECT` characters — else the computed one.
 * Nothing posted (`undefined`, null, "") keeps the computed unit. A unit
 * posted on a line whose unit is not chosen, or an invalid one, is an
 * `error` (the route answers 400); with the switch off, a posted unit is
 * ignored, as before lot 5A.
 */
/** « UFC/ » with no object after the slash (spaces allowed). */
const BARE_UFC_PER = /^UFC\s*\/\s*$/i;

export function surfaceUnitChoice(
  context: UnitContext,
  base: string | null,
  posted: unknown,
  enabled: boolean = SURFACE_UNIT_CHOSEN_AT_ENTRY
): { unit: string | null } | { error: string } {
  const computed = resultUnit(context, base);
  if (!enabled || posted === undefined || posted === null || posted === "") return { unit: computed };
  if (!surfaceUnitEditable(context, base, enabled)) return { error: SURFACE_UNIT_MESSAGES.notChoosable };
  if (typeof posted !== "string") return { error: SURFACE_UNIT_MESSAGES.invalid };
  const unit = posted.replace(/\s+/g, " ").trim();
  // « UFC/ … autre objet » left without its object posts a bare « UFC/ »: as
  // nothing posted — the computed unit, as the sheet shows it (`shownUnit`),
  // never a 400 that would lose the whole sheet (review of lot 5A).
  if (!unit || BARE_UFC_PER.test(unit)) return { unit: computed };
  if (CONTROL_CHARS.test(unit) || Array.from(unit).length > MAX_RESULT_UNIT) return { error: SURFACE_UNIT_MESSAGES.invalid };
  const offered = surfaceUnitChoices(context, base, enabled).find(
    (choice) => choice.toLocaleLowerCase("fr") === unit.toLocaleLowerCase("fr")
  );
  if (offered) return { unit: offered };
  const object = UFC_PER_OBJECT.exec(unit)?.[1]?.trim() ?? "";
  if (!object || Array.from(object).length > MAX_SURFACE_OBJECT) return { error: SURFACE_UNIT_MESSAGES.invalid };
  return { unit: `UFC/${object}` };
}

/** A context that rewrites nothing (a line whose sample is unknown). */
export const PLAIN_UNIT_CONTEXT: UnitContext = { lineKind: null, surfaceAreaNote: null, airMethod: null, airExposureMin: null };
