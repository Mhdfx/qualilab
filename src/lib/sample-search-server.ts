import "server-only";
import { prisma } from "./prisma";
import { sampleConclusion, sampleSearchWhere, type Conclusion, type SampleSearch } from "./sample-search";

/**
 * The rows the search screen, the client summary and the Excel export print
 * (RETOUR-LABO-29-09.md, slice F): one row per sample, its conclusion
 * computed the same way everywhere.
 */

export type SearchRow = {
  id: string;
  clientId: string;
  clientName: string;
  serialNumber: string;
  controlCode: string | null;
  code: string;
  status: import("@/generated/prisma/enums").SampleStatus;
  produit: string | null;
  numeroLot: string | null;
  lieu: string;
  nature: string;
  parameters: string[];
  sampledAt: Date;
  receivedAt: Date | null;
  hasReport: boolean;
  conclusion: Conclusion;
};

export async function searchSamples(
  search: SampleSearch,
  options: { technicianId?: string; take: number; skip?: number; excludeCancelled?: boolean }
): Promise<{ rows: SearchRow[]; total: number }> {
  const where = {
    ...sampleSearchWhere(search),
    ...(options.technicianId ? { technicianId: options.technicianId } : {}),
    ...(options.excludeCancelled ? { NOT: { status: "ANNULE" as const } } : {}),
  };
  const orderBy =
    search.dateField === "prelevement"
      ? [{ sampledAt: "desc" as const }, { createdAt: "desc" as const }]
      : [{ receivedAt: { sort: "desc" as const, nulls: "first" as const } }, { createdAt: "desc" as const }];
  const [samples, total] = await Promise.all([
    prisma.sample.findMany({
      where,
      orderBy,
      take: options.take,
      skip: options.skip ?? 0,
      select: {
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
        serie: { select: { serialNumber: true } },
        nature: { select: { label: true } },
        parameters: { select: { parameter: { select: { name: true } } } },
        report: { select: { interpretation: true } },
        results: { select: { interpretation: true, informalInterpretation: true, conform: true } },
      },
    }),
    prisma.sample.count({ where }),
  ]);
  return {
    total,
    rows: samples.map((s) => ({
      id: s.id,
      clientId: s.client.id,
      clientName: s.client.name,
      serialNumber: s.serie.serialNumber,
      controlCode: s.controlCode,
      code: s.code,
      status: s.status,
      produit: s.produit,
      numeroLot: s.numeroLot,
      lieu: s.lieu,
      nature: s.nature.label,
      parameters: s.parameters.map((p) => p.parameter.name),
      sampledAt: s.sampledAt,
      receivedAt: s.receivedAt,
      hasReport: s.report !== null,
      conclusion: sampleConclusion(s),
    })),
  };
}
