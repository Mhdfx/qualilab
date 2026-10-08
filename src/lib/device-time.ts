import { fromLabWallTime, labOffsetMinutes, toLabWallTime } from "@/lib/lab-time";

/**
 * The device's clock versus the laboratory's legal clock (RETOUR-LABO-06-10.md
 * §8.1, retour du 08/10).
 *
 * Morocco returned to GMT on 20 September 2026; a PC or phone whose
 * time-zone data predates that still shows one hour more. Its user reads
 * that hour and types it. Rather than refuse it, the date-time field
 * (`LabDateTimeInput`) shows and reads the DEVICE's wall time and converts
 * it to the legal wall time, which stays the only value the form state and
 * the server ever see.
 *
 * Pure and client-safe: the clock and the device offset are parameters, so
 * the tests pin them.
 */

/** Below this, a difference between the two clocks is not a time-zone error. */
const DRIFT_THRESHOLD_MINUTES = 30;

/**
 * How many minutes the device's wall clock is ahead of the legal one at
 * `at` (negative: behind). 0 when the difference is under 30 minutes — a
 * device on the right zone. `deviceOffsetMinutes` is minutes east of UTC,
 * as the device's zone data has it (`-getTimezoneOffset()`).
 */
export function deviceDriftMinutes(at: Date, deviceOffsetMinutes: number = -at.getTimezoneOffset()): number {
  const drift = deviceOffsetMinutes - labOffsetMinutes(at);
  return Math.abs(drift) < DRIFT_THRESHOLD_MINUTES ? 0 : drift;
}

/**
 * The drift that applies to a given legal wall time. The device's error is
 * only about dates after the switch: on 10/09/2026 an outdated device and
 * the law both said UTC+1. So when the device drifts NOW, the drift of the
 * value's own instant is used — editing a September visit on such a device
 * does not shift it. `deviceOffsetAt` = the device's offset at an instant
 * (minutes east of UTC); injectable for the tests.
 */
export function driftForWall(
  legalWall: string,
  nowDrift: number,
  deviceOffsetAt: (at: Date) => number = (at) => -at.getTimezoneOffset()
): number {
  if (nowDrift === 0 || !legalWall) return nowDrift;
  const at = fromLabWallTime(legalWall);
  return at ? deviceDriftMinutes(at, deviceOffsetAt(at)) : nowDrift;
}

/** A "YYYY-MM-DDTHH:mm" wall time moved by `minutes`; "" and unreadable values unchanged. */
function shiftWall(wall: string, minutes: number): string {
  if (!wall || minutes === 0) return wall;
  const instant = fromLabWallTime(wall);
  if (!instant) return wall;
  return toLabWallTime(new Date(instant.getTime() + minutes * 60000));
}

/** The legal wall time as the device's clock shows it (what the field displays). */
export function legalToDeviceWall(legalWall: string, driftMinutes: number): string {
  return shiftWall(legalWall, driftMinutes);
}

/** The legal wall time behind a wall time read on the device (what the field stores). */
export function deviceToLegalWall(deviceWall: string, driftMinutes: number): string {
  return shiftWall(deviceWall, -driftMinutes);
}

/**
 * What `LabDateTimeInput` displays for a stored LEGAL wall time: the
 * device's hour, with the drift of the value's own date (`driftForWall`).
 */
export function fieldDisplayWall(
  legalWall: string,
  nowDrift: number,
  deviceOffsetAt?: (at: Date) => number
): string {
  return legalToDeviceWall(legalWall, driftForWall(legalWall, nowDrift, deviceOffsetAt));
}

/**
 * What `LabDateTimeInput` stores for a wall time typed on the device: the
 * LEGAL wall time. The drift of the typed date is estimated from the current
 * one (a September date typed on a drifting device is not shifted). Inverse
 * of `fieldDisplayWall`: one conversion each way, never two.
 */
export function fieldLegalWall(
  deviceWall: string,
  nowDrift: number,
  deviceOffsetAt?: (at: Date) => number
): string {
  if (!deviceWall) return "";
  const estimate = driftForWall(deviceToLegalWall(deviceWall, nowDrift), nowDrift, deviceOffsetAt);
  return deviceToLegalWall(deviceWall, estimate);
}

/** "HH:MM" of the legal clock at `now`. */
export function legalClock(now: Date = new Date()): string {
  return toLabWallTime(now).slice(11, 16);
}

/**
 * The « dans le futur » check next to a field, as the server applies it
 * (serie-input.ts: 5 minutes of tolerance): a French message, or null when
 * the value is empty, unreadable or not in the future.
 * « L'heure de fin est dans le futur : il est 18:06 (heure légale du Maroc). Vérifiez l'heure saisie. »
 */
export function futureFieldError(
  label: string,
  legalWall: string,
  now: Date = new Date(),
  toleranceMinutes = 5
): string | null {
  if (!legalWall) return null;
  const instant = fromLabWallTime(legalWall);
  if (!instant) return null;
  if (instant.getTime() <= now.getTime() + toleranceMinutes * 60000) return null;
  return `${label} est dans le futur : il est ${legalClock(now)} (heure légale du Maroc). Vérifiez l'heure saisie.`;
}
