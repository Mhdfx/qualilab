import type { AirMethod, LineKind } from "@/generated/prisma/enums";
import { AIR_EXPOSURE_MINUTES, isExposedPlate } from "./labels";

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
 * never expressed in.
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

/**
 * The unit the result of a line is expressed in: `base` (the criterion's,
 * else the parameter's — `benchUnit`), rewritten for a surface described in
 * words (J1) or an air sample (J2).
 */
export function resultUnit(context: UnitContext, base: string | null): string | null {
  if (!isCountUnit(base)) return base;
  const surface = describedSurface(context);
  if (surface) return `UFC/${surface}`;
  if (context.lineKind === "AIR" && context.airMethod) return airUnitText(context.airMethod, context.airExposureMin);
  return base;
}

/**
 * Whether a criterion or a limit expressed in `unit` can judge this line:
 * not when the unit names another basis than the one sampled. A unit that
 * is no count (absent, « - », « mg/m³ ») never sets a limit aside.
 */
export function unitJudges(context: UnitContext, unit: string | null | undefined): boolean {
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

/** A context that rewrites nothing (a line whose sample is unknown). */
export const PLAIN_UNIT_CONTEXT: UnitContext = { lineKind: null, surfaceAreaNote: null, airMethod: null, airExposureMin: null };
