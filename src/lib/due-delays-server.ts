import "server-only";
import { prisma } from "./prisma";
import { DUE_DELAYS_DEFAULTS, type DueDelays } from "./due-date";

export const DUE_DELAYS_SELECT = { dueDaysMicro: true, dueDaysChimie: true, dueDaysAutre: true, dueCalendarDays: true } as const;

/**
 * The delays of « à rendre le » (K5), read apart from the reception's
 * settings: the settings row, or the assumption of 01/11 (R-18) until it
 * exists. A failed read proposes nothing, never breaks the programme sheet.
 */
export async function getDueDelays(): Promise<DueDelays> {
  try {
    const row = await prisma.labSettings.findUnique({ where: { id: "lab" }, select: DUE_DELAYS_SELECT });
    return row ?? DUE_DELAYS_DEFAULTS;
  } catch (error) {
    console.error("[programme] due delays unreadable, nothing proposed", { error });
    return { dueDaysMicro: null, dueDaysChimie: null, dueDaysAutre: null, dueCalendarDays: null };
  }
}
