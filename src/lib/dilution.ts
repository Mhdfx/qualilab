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
