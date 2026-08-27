/**
 * Système Qualité arithmetic — Phase 7.
 *
 * Pure functions shared by the API, the dashboard and the screens: when a
 * calibration is due, and whether a temperature is out of range. Same
 * discipline as stock.ts — one judge per question, tested without a
 * database.
 */

export type CalibrationState = "OK" | "BIENTOT" | "RETARD" | "JAMAIS";

/** How many days before the due date the calibration alert starts. */
export const CALIBRATION_SOON_DAYS = 30;

/** Calendar-safe month addition (Jan 31 + 1 month = end of February). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

/**
 * Where an equipment stands against its calibration schedule.
 * No frequency → not a calibrated equipment (state OK, no due date).
 * A frequency but no record yet → JAMAIS: it must be calibrated once
 * before the schedule can mean anything.
 */
export function calibrationDue(
  lastCalibratedAt: Date | null,
  frequencyMonths: number | null,
  now: Date = new Date()
): { state: CalibrationState; dueDate: Date | null } {
  if (!frequencyMonths) return { state: "OK", dueDate: null };
  if (!lastCalibratedAt) return { state: "JAMAIS", dueDate: null };

  const dueDate = addMonths(lastCalibratedAt, frequencyMonths);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(dueDate) - startOfDay(now)) / 86_400_000);

  if (days < 0) return { state: "RETARD", dueDate };
  if (days <= CALIBRATION_SOON_DAYS) return { state: "BIENTOT", dueDate };
  return { state: "OK", dueDate };
}

/**
 * Whether a reading violates the equipment's bounds. A missing bound is an
 * open side (a freezer may have only a max); no bounds at all means the
 * equipment is not monitored and nothing can be out of range.
 */
export function isOutOfRange(
  value: number,
  tempMin: number | null,
  tempMax: number | null
): boolean {
  if (tempMin === null && tempMax === null) return false;
  if (tempMin !== null && value < tempMin) return true;
  if (tempMax !== null && value > tempMax) return true;
  return false;
}
