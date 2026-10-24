import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { declaredSampledAt, sampleConclusion, sampleSearchWhere, searchReceptionAt, type Conclusion, type SampleSearch } from "./sample-search";

/**
 * The rows the search screen, the client summary and the Excel export print
 * (RETOUR-LABO-29-09.md, slice F): one row per sample, its conclusion
 * computed the same way everywhere.
 */

export type SearchRow = {
  id: string;
  /** Null on a blind search (`blind`): the client is not even loaded. */
  clientId: string | null;
  clientName: string | null;
  /** The série's sampling site, null for the « Siège » (RETOUR-LABO-06-10.md §5, V5) and on a blind search. */
  siteName: string | null;
  serialNumber: string;
  controlCode: string | null;
  code: string;
  status: import("@/generated/prisma/enums").SampleStatus;
  produit: string | null;
  numeroLot: string | null;
  /** The client's place — null on a blind search. */
  lieu: string | null;
  nature: string;
  parameters: string[];
  /** The sampling date, null on a deposit whose sampling time was not
   *  declared — never the instant it was entered (`declaredSampledAt`). */
  sampledAt: Date | null;
  receivedAt: Date | null;
  /** What the client reads as the reception: the arrival, else `receivedAt` (`searchReceptionAt`). */
  receptionAt: Date | null;
  hasReport: boolean;
  conclusion: Conclusion;
};

/** What a search row reads of a sample. */
const SEARCH_SELECT = {
  id: true,
  code: true,
  controlCode: true,
  status: true,
  produit: true,
  numeroLot: true,
  lieu: true,
  sampledAt: true,
  receivedAt: true,
  client: { select: { id: true, name: true } },
  // Whether a deposit's « Prélevé le » was declared (R6 / C5).
  // `arrivedAt`: the reception the client reads (lot 1b, `searchReceptionAt`).
  serie: { select: { serialNumber: true, site: { select: { name: true } }, samplingTimeDeclared: true, arrivedAt: true } },
  nature: { select: { label: true } },
  parameters: { select: { parameter: { select: { name: true } } } },
  report: { select: { interpretation: true } },
  results: { select: { interpretation: true, informalInterpretation: true, conform: true } },
} as const satisfies Prisma.SampleSelect;

/**
 * A technician's blind search (re-ask 2.15, `benchHidesClient`): neither the
 * client, the site nor the client's place (`lieu`) is loaded — what their
 * screen never shows is never read for it (as `SAMPLE_BENCH_SELECT`).
 */
const BLIND_SEARCH_SELECT = {
  ...SEARCH_SELECT,
  client: false,
  lieu: false,
  serie: { select: { ...SEARCH_SELECT.serie.select, site: false } },
} as const satisfies Prisma.SampleSelect;

/** A sample as either select reads it. */
type SearchSample = Prisma.SampleGetPayload<{ select: typeof BLIND_SEARCH_SELECT }> & {
  lieu?: string;
  client?: { id: string; name: string };
  serie: { site?: { name: string } | null };
};

/**
 * One page of a search. `scope` narrows it to what the caller may see — a
 * technician's search stays on the samples they hold (`benchWhereFor`,
 * legacy parameter lines included). It is wrapped in AND: the search sets
 * its own OR for the free text, and a spread scope carrying an OR would
 * silently replace it. `blind`: the client, the site and the place are not
 * loaded (`BLIND_SEARCH_SELECT`) — their columns come back null.
 */
export async function searchSamples(
  search: SampleSearch,
  options: { scope?: Prisma.SampleWhereInput; take: number; skip?: number; excludeCancelled?: boolean; blind?: boolean }
): Promise<{ rows: SearchRow[]; total: number }> {
  const where: Prisma.SampleWhereInput = {
    ...sampleSearchWhere(search),
    ...(options.scope ? { AND: [options.scope] } : {}),
    ...(options.excludeCancelled ? { NOT: { status: "ANNULE" as const } } : {}),
  };
  // On the column itself: an undeclared deposit takes its place by the
  // instant it was entered, the same instant the period filter reads.
  const orderBy =
    search.dateField === "prelevement"
      ? [{ sampledAt: "desc" as const }, { createdAt: "desc" as const }]
      : [{ receivedAt: { sort: "desc" as const, nulls: "first" as const } }, { createdAt: "desc" as const }];
  const page = { where, orderBy, take: options.take, skip: options.skip ?? 0 };
  const [samples, total]: [SearchSample[], number] = await Promise.all([
    options.blind
      ? prisma.sample.findMany({ ...page, select: BLIND_SEARCH_SELECT })
      : prisma.sample.findMany({ ...page, select: SEARCH_SELECT }),
    prisma.sample.count({ where }),
  ]);
  return {
    total,
    rows: samples.map((s) => ({
      id: s.id,
      clientId: s.client?.id ?? null,
      clientName: s.client?.name ?? null,
      siteName: s.serie.site?.name ?? null,
      serialNumber: s.serie.serialNumber,
      controlCode: s.controlCode,
      code: s.code,
      status: s.status,
      produit: s.produit,
      numeroLot: s.numeroLot,
      lieu: s.lieu ?? null,
      nature: s.nature.label,
      parameters: s.parameters.map((p) => p.parameter.name),
      sampledAt: declaredSampledAt(s.sampledAt, s.serie.samplingTimeDeclared),
      receivedAt: s.receivedAt,
      receptionAt: searchReceptionAt(s.receivedAt, s.serie.arrivedAt),
      hasReport: s.report !== null,
      conclusion: sampleConclusion(s),
    })),
  };
}
