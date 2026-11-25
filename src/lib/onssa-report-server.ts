import "server-only";
import { prisma } from "./prisma";
import { ONSSA_COUNT_BY, ONSSA_IV_NON_ACCREDITED, ONSSA_OFFICIAL_CONTROL } from "./lab-proposals";
import { labDayOf } from "./lab-time";
import {
  buildOnssaReport,
  onssaGroupOf,
  type OnssaMonth,
  type OnssaReport,
  type OnssaReportOptions,
  type OnssaSampleInput,
} from "./onssa-report";
import {
  eilRows,
  isEilOfMonth,
  onssaYearStart,
  receptionRows,
  regulationRows,
  strainRows,
  type OnssaSections,
} from "./onssa-sections";

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
  /** Lot 6C, N4 — section III / IV of the canevas of 2026; null unless asked. */
  sections: OnssaSections | null;
};

export type OnssaLoadOptions = {
  /** Lot 6C: the canevas of 2026's reading (`canevasReportOptions`). */
  report?: OnssaReportOptions;
  /** Lot 6C, N4: also read what section III (and IV) of the canevas shows. */
  sections?: boolean;
};

export async function loadOnssaMonth(month: OnssaMonth, options: OnssaLoadOptions = {}): Promise<OnssaMonthData> {
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
        receivedAt: true,
        regulation: { select: { title: true } },
        client: { select: { name: true } },
        serie: {
          select: {
            controleOfficiel: true,
            organismePreleveur: true,
            etablissement: true,
            origine: true,
            site: { select: { name: true, city: true } },
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
            detected: true,
            parameter: { select: { name: true, onssaColumn: true, alertOnExceed: true } },
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
      receivedDay: sample.receivedAt ? labDayOf(sample.receivedAt) : null,
      city: sample.serie.site?.city ?? null,
      regulationTitle: sample.regulation?.title ?? null,
      results: sample.results.map((result) => ({
        parameterName: result.parameter.name,
        parameterColumn: result.parameter.onssaColumn,
        normCode: result.normVersion?.norm.code ?? programmedNorm.get(result.parameterId) ?? null,
        value: result.value,
        interpretation: result.interpretation,
        informalInterpretation: result.informalInterpretation,
        conform: result.conform,
        detected: result.detected,
        sensitive: result.parameter.alertOnExceed,
      })),
    };
  });

  const sections = options.sections ? await loadOnssaSections(month, inputs, groups) : null;
  return { report: buildOnssaReport(inputs, groups, options.report), pendingSamples, tooMany, sections };
}

/** At most this many EIL in III-1 (a laboratory runs a few dozen a year). */
const MAX_EIL = 500;

/**
 * Lot 6C, N4 — section III (and IV) of the canevas of 2026 for the month:
 * the EIL of the year still in scope, the sensitive germs detected and the
 * regulations of the month's declared samples (`inputs`), the reception's
 * non-conformities, rejections and destructions of the month. Read-only.
 */
async function loadOnssaSections(
  month: OnssaMonth,
  inputs: OnssaSampleInput[],
  groups: { id: string; name: string; domain: "ALIMENTAIRE" | "EAU"; sortOrder: number; active: boolean }[]
): Promise<OnssaSections> {
  const range = { gte: month.from, lt: month.until };
  const yearStart = onssaYearStart(month);
  const [campaigns, nonConform, refused, nonAccredited] = await Promise.all([
    prisma.eilCampaign.findMany({
      where: {
        OR: [
          { startDate: { gte: yearStart, lt: month.until } },
          { status: { not: "CLOTUREE" }, OR: [{ startDate: null }, { startDate: { lt: month.until } }] },
        ],
      },
      orderBy: [{ startDate: "asc" }, { name: "asc" }],
      take: MAX_EIL,
      select: {
        name: true,
        organizer: true,
        scope: true,
        startDate: true,
        resultDate: true,
        status: true,
        outcome: true,
        satisfactory: true,
      },
    }),
    // Received in the month and declared non conforme at reception (a sample
    // cancelled afterwards is counted below by its cancellation, not twice).
    prisma.sample.findMany({
      where: {
        receivedAt: range,
        conformity: false,
        NOT: { cancelReason: { in: ["REJETE_A_RECEPTION", "DETRUIT_A_RECEPTION"] } },
      },
      select: { conformityReason: true },
    }),
    prisma.sample.findMany({
      where: { cancelledAt: range, cancelReason: { in: ["REJETE_A_RECEPTION", "DETRUIT_A_RECEPTION"] } },
      select: { cancelReason: true },
    }),
    ONSSA_IV_NON_ACCREDITED
      ? prisma.analysisParameter.findMany({
          where: { accreditation: "NON_ACCREDITE" },
          orderBy: { name: "asc" },
          select: { name: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    eil: eilRows(campaigns.filter((campaign) => isEilOfMonth(campaign, yearStart, month.until))),
    strains: strainRows(inputs, groups),
    regulations: regulationRows(inputs, groups),
    reception: receptionRows(
      nonConform.map((sample) => ({ reason: sample.conformityReason })),
      refused.flatMap((sample) => (sample.cancelReason ? [{ reason: sample.cancelReason }] : []))
    ),
    nonAccredited: nonAccredited.map((parameter) => parameter.name),
  };
}
