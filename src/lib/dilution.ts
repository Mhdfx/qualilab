import { formatDecimal } from "./labels";

/**
 * The multiplier applied to a bench reading (PROGRAMME.md §6).
 *
 * The programme d'analyse may give a parameter a dilution factor for this
 * sample alone (`SampleParameter.dilutionFactor`, « ×10 »); when it is
 * present it replaces the catalogue's `calcFactor`. Pure, so the bench
 * screen, `PUT …/results` and the bench sheet all transform a reading with
 * the same figure. A line programmed without one — or before this slice —
 * keeps the parameter's factor exactly as before.
 *
 * The programmed factor arrives as a Prisma `Decimal` from the database and
 * as a number from the screen: both are read through `Number()`.
 */
export function effectiveFactor(
  dilutionFactor: number | string | { toString(): string } | null | undefined,
  calcFactor: number
): number {
  if (dilutionFactor === null || dilutionFactor === undefined) return calcFactor;
  const factor = Number(dilutionFactor.toString());
  return Number.isFinite(factor) && factor > 0 ? factor : calcFactor;
}

/** The ceiling of a dilution typed at the bench (1/1 000 000 000) — and of the column, DECIMAL(12, 4). */
export const MAX_DILUTION = 1_000_000_000;

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};

/**
 * The dilution a technician typed beside a reading (lot 3B, J4 — 28/10, 2.12 :
 * « le technicien va faire entrer les résultats avec les dilutions
 * utilisées »), read as the multiplier the reading takes: « 1/100 », « 1:100 »,
 * « 10-2 », « 10^-2 », « 10⁻² », « -2 » and « 100 » all mean ×100; « 1 » means
 * none. Null when nothing is typed (the programmed dilution, else the
 * catalogue's factor, applies); « invalid » for anything else, never guessed.
 * Hypothèse, à confirmer par R-12 : lecture 30 au 1/100 → 3.10³ au rapport.
 */
export function parseDilution(raw: string | null | undefined): number | null | "invalid" {
  let text = (raw ?? "").trim();
  if (!text) return null;
  for (const [sup, digit] of Object.entries(SUPERSCRIPT_DIGITS)) text = text.replaceAll(sup, digit);
  text = text.replace(/\s+/g, "").replace(/^[×x*]/i, "").replace(",", ".");
  let factor: number | null = null;
  const fraction = text.match(/^1[/:](\d+(?:\.\d+)?)$/);
  const power = text.match(/^10(?:\^[-–]?|[-–])(\d{1,2})$/);
  const exponent = text.match(/^[-–](\d{1,2})$/);
  if (fraction) factor = Number(fraction[1]);
  else if (power) factor = 10 ** Number(power[1]);
  else if (exponent) factor = 10 ** Number(exponent[1]);
  else if (/^\d+(?:\.\d+)?$/.test(text)) factor = Number(text);
  if (factor === null || !Number.isFinite(factor) || factor <= 0 || factor > MAX_DILUTION) return "invalid";
  // Four decimals at most, as the column stores it.
  return Math.round(factor * 10_000) / 10_000 || "invalid";
}

/**
 * A multiplier as the bench writes the dilution: « 1/100 » for ×100, « 1 »
 * for none, « ×0,5 » for a factor below one (a concentration).
 */
export function dilutionText(factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) return "";
  if (factor === 1) return "1";
  const shown = formatDecimal(factor, 4);
  return factor > 1 ? `1/${shown}` : `×${shown}`;
}

/**
 * The factor a line is read with (J4): the technician's own dilution when one
 * is stored, else the programmed one, else the catalogue's factor
 * (`effectiveFactor`). The screen, the save and the submission read this.
 */
export function readingFactor(
  dilutionUsed: number | string | { toString(): string } | null | undefined,
  dilutionFactor: number | string | { toString(): string } | null | undefined,
  calcFactor: number
): number {
  return effectiveFactor(dilutionUsed ?? null, effectiveFactor(dilutionFactor, calcFactor));
}

/**
 * What the save stores in `Result.dilutionUsed`: the dilution typed, only when
 * it differs from the one the line would be read with anyway — so a later
 * change of the programme reaches a line the technician never set.
 */
export function dilutionToStore(typed: number | null, programmed: number): number | null {
  return typed !== null && typed !== programmed ? typed : null;
}
