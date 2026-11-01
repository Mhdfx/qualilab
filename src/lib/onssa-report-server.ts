import "server-only";
import { prisma } from "./prisma";
import { ONSSA_COUNT_BY, ONSSA_OFFICIAL_CONTROL } from "./lab-proposals";
import {
  buildOnssaReport,
  onssaGroupOf,
  type OnssaMonth,
  type OnssaReport,
  type OnssaSampleInput,
} from "./onssa-report";

/**
 * Lot 3E, N3 — reads a month's samples for the ONSSA report (the screen and
 * the Excel): the validated samples of the month (`ONSSA_COUNT_BY`), their
 * série's « contrôle officiel » (N1), their group and their results with the
 * parameters' ONSSA columns (N2). Bounded: a laboratory's month is a few
 * thousand samples at most; past `MAX_ONSSA_SAMPLES` the caller refuses.
 */

export const MAX_ONSSA_SAMPLES = 20_000;

/** The statuses of a sample whose administrative validation is signed. */
const COUNTED_STATUSES = ["VALIDE", "RAPPORT_ENVOYE"] as const;

export type OnssaMonthData = {
  report: OnssaReport;
  /**
   * Samples received in the month still waiting for their validation; null
   * on the VALIDATION basis, where the figure has no meaning (a sample not
   * yet validated belongs to no month yet).
   */
  pendingSamples: number | null;
  /** The month holds more samples than one report reads. */
  tooMany: boolean;
};

export async function loadOnssaMonth(month: OnssaMonth): Promise<OnssaMonthData> {
  const range = { gte: month.from, lt: month.until };
  const where =
    ONSSA_COUNT_BY === "VALIDATION"
      ? { status: { in: [...COUNTED_STATUSES] }, approvedAt: range }
      : { status: { in: [...COUNTED_STATUSES] }, receivedAt: range };

  const [samples, groups, pendingSamples] = await Promise.all([
    prisma.sample.findMany({
      where,
      orderBy: [{ receivedAt: "asc" }, { code: "asc" }],
      take: MAX_ONSSA_SAMPLES + 1,
      select: {
        id: true,
        code: true,
        controlCode: true,
        client: { select: { name: true } },
        serie: {
          select: {
            controleOfficiel: true,
            organismePreleveur: true,
            etablissement: true,
            origine: true,
            site: { select: { name: true } },
          },
        },
        nature: { select: { label: true, onssaGroupId: true } },
        productType: { select: { name: true, onssaGroupId: true } },
        parameters: {
          select: { parameterId: true, normVersion: { select: { norm: { select: { code: true } } } } },
        },
        results: {
          select: {
            parameterId: true,
            value: true,
            interpretation: true,
            informalInterpretation: true,
            conform: true,
            parameter: { select: { name: true, onssaColumn: true } },
            normVersion: { select: { norm: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.onssaProductGroup.findMany({
      select: { id: true, name: true, domain: true, sortOrder: true, active: true },
    }),
    ONSSA_COUNT_BY === "RECEPTION"
      ? prisma.sample.count({
          where: { receivedAt: range, status: { notIn: [...COUNTED_STATUSES, "ANNULE"] } },
        })
      : Promise.resolve(null),
  ]);

  const tooMany = samples.length > MAX_ONSSA_SAMPLES;
  const inputs: OnssaSampleInput[] = samples.slice(0, MAX_ONSSA_SAMPLES).map((sample) => {
    const programmedNorm = new Map(sample.parameters.map((p) => [p.parameterId, p.normVersion?.norm.code ?? null]));
    // The switch off: every série reads as an autocontrôle, whatever is stored.
    const official = ONSSA_OFFICIAL_CONTROL && sample.serie.controleOfficiel;
    return {
      id: sample.id,
      reference: sample.controlCode ?? sample.code,
      clientName: sample.client.name,
      siteName: sample.serie.site?.name ?? null,
      natureLabel: sample.nature.label,
      familyName: sample.productType?.name ?? null,
      groupId: onssaGroupOf(sample),
      controleOfficiel: official,
      organismePreleveur: official ? sample.serie.organismePreleveur : null,
      etablissement: official ? sample.serie.etablissement : null,
      origine: ONSSA_OFFICIAL_CONTROL ? sample.serie.origine : null,
      results: sample.results.map((result) => ({
        parameterName: result.parameter.name,
        parameterColumn: result.parameter.onssaColumn,
        normCode: result.normVersion?.norm.code ?? programmedNorm.get(result.parameterId) ?? null,
        value: result.value,
        interpretation: result.interpretation,
        informalInterpretation: result.informalInterpretation,
        conform: result.conform,
      })),
    };
  });

  return { report: buildOnssaReport(inputs, groups), pendingSamples, tooMany };
}
