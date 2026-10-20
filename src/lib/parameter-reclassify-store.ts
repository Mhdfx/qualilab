import type { Family } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { CORRECTABLE_STATUSES } from "@/lib/sample-status";
import type { ReclassifyContext } from "@/lib/parameter-reclassify";

/**
 * The database side of a domain change (RETOUR-LABO-19-10.md D-19): what
 * `planReclassification` / `reclassifyRefusal` need to know about the
 * parameters asked for. Read only.
 */

/** The columns a parameter is written with, and journalled before / after (as `/api/parameters/[id]`). */
export const RECLASSIFY_PARAMETER_SELECT = {
  id: true,
  name: true,
  category: true,
  family: true,
  unit: true,
  limitValue: true,
  alertOnExceed: true,
  threshold: true,
  calcFactor: true,
  aliases: true,
} as const;

type JournalledParameter = {
  name: string;
  category: string;
  family: Family;
  unit: string | null;
  limitValue: number | null;
  alertOnExceed: boolean;
  threshold: string | null;
  calcFactor: number;
  aliases: string | null;
};

/** The journal's before / after of a parameter — the fields and order of `/api/parameters/[id]`. */
export function parameterJournalFields(row: JournalledParameter): JournalledParameter {
  return {
    name: row.name,
    category: row.category,
    family: row.family,
    unit: row.unit,
    limitValue: row.limitValue,
    alertOnExceed: row.alertOnExceed,
    threshold: row.threshold,
    calcFactor: row.calcFactor,
    aliases: row.aliases,
  };
}

/** Counts one more for the (parameter, domain) entry of `map`. */
function tally(map: Map<string, { parameterId: string; family: Family; count: number }>, parameterId: string, family: Family) {
  const key = `${parameterId}|${family}`;
  const entry = map.get(key) ?? { parameterId, family, count: 0 };
  entry.count += 1;
  map.set(key, entry);
}

export async function loadReclassifyContext(parameterIds: readonly string[]): Promise<ReclassifyContext> {
  const ids = [...parameterIds];
  const [natures, profiles, carried, criteria] = await Promise.all([
    prisma.analysisNature.findMany({ where: { active: true }, select: { family: true, legacyType: true } }),
    prisma.analysisProfile.findMany({
      where: { active: true, parameters: { some: { parameterId: { in: ids } } } },
      select: {
        name: true,
        nature: { select: { family: true } },
        parameters: { where: { parameterId: { in: ids } }, select: { parameterId: true } },
      },
    }),
    // The samples whose analyses may still change (`CORRECTABLE_STATUSES`):
    // the ones a programmer or a corrector opens after the change.
    prisma.sampleParameter.findMany({
      where: { parameterId: { in: ids }, sample: { status: { in: CORRECTABLE_STATUSES } } },
      select: { parameterId: true, sample: { select: { nature: { select: { family: true } } } } },
    }),
    prisma.criterion.findMany({
      where: { parameterId: { in: ids }, active: true, productType: { active: true } },
      select: { parameterId: true, productTypeId: true, productType: { select: { family: true } } },
    }),
  ]);

  const openSamples = new Map<string, { parameterId: string; family: Family; count: number }>();
  for (const row of carried) tally(openSamples, row.parameterId, row.sample.nature.family);

  // A family cites a germ once, whatever its norm versions (D-17).
  const citedBy = new Map<string, { parameterId: string; family: Family; count: number }>();
  const seen = new Set<string>();
  for (const row of criteria) {
    const key = `${row.parameterId}|${row.productTypeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tally(citedBy, row.parameterId, row.productType.family);
  }

  return {
    natures,
    profiles: profiles.map((profile) => ({
      name: profile.name,
      family: profile.nature.family,
      parameterIds: profile.parameters.map((p) => p.parameterId),
    })),
    openSamples: [...openSamples.values()],
    citedBy: [...citedBy.values()],
  };
}
