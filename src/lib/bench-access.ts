import type { Prisma } from "@/generated/prisma/client";
import type { SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "./roles";

/**
 * Who works a line at the bench (PROGRAMME.md §6).
 *
 * The programme d'analyse hands each parameter to a technician — its own
 * (`SampleParameter.technicianId`) or, by default, the sample's
 * (`Sample.technicianId`). A technician's bench therefore lists every line
 * where they hold the sample or at least one of its parameters, and on the
 * sheet only their own parameters are editable.
 *
 * Pure, so the rule is written once and read the same way by the queue, the
 * sheet, `PUT …/results` and `POST …/results/submit`. A line programmed
 * before this slice — or never programmed — carries no per-parameter
 * technician: everything falls back to the sample's, exactly as before.
 */

/** The statuses a line is on the bench with: programmed, or under analysis. */
export const BENCH_STATUSES: readonly SampleStatus[] = ["PROGRAMME", "EN_ANALYSE"];

export type BenchSampleRef = { technicianId: string | null };
export type BenchParameterRef = { parameterId: string; technicianId: string | null };
export type BenchSample = BenchSampleRef & { parameters: BenchParameterRef[] };

/** The technician in charge of one parameter: its own, else the sample's. */
export function parameterTechnicianId(
  sample: BenchSampleRef,
  parameter: { technicianId: string | null }
): string | null {
  return parameter.technicianId ?? sample.technicianId;
}

/** May this user type the results of this parameter? */
export function canEditParameter(
  sample: BenchSampleRef,
  parameter: { technicianId: string | null },
  userId: string
): boolean {
  const technicianId = parameterTechnicianId(sample, parameter);
  return technicianId !== null && technicianId === userId;
}

/** Is this line on this user's bench — the sample's technician, or one of its parameters'? */
export function isOnBenchOf(sample: BenchSample, userId: string): boolean {
  return (
    sample.technicianId === userId ||
    sample.parameters.some((parameter) => parameter.technicianId === userId)
  );
}

/**
 * The parameters of a line split between this user's and the other
 * technicians' — « il reste N paramètres à d'autres techniciens ».
 */
export function splitParameters<T extends { technicianId: string | null }>(
  sample: BenchSampleRef & { parameters: T[] },
  userId: string
): { mine: T[]; others: T[] } {
  const mine: T[] = [];
  const others: T[] = [];
  for (const parameter of sample.parameters) {
    (canEditParameter(sample, parameter, userId) ? mine : others).push(parameter);
  }
  return { mine, others };
}

/**
 * Every technician of the line, the sample's first, each once — what the
 * report prints under « Analyses réalisées par ».
 */
export function benchTechnicianIds(sample: BenchSample): string[] {
  const ids: string[] = [];
  const push = (id: string | null) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(sample.technicianId);
  for (const parameter of sample.parameters) push(parameterTechnicianId(sample, parameter));
  return ids;
}

/**
 * The Prisma filter of a bench: a technician sees the lines they hold or
 * share; every other admitted role sees them all (`{}`), as today.
 */
export function benchWhereFor(session: { id: string; role: Role }): Prisma.SampleWhereInput {
  if (session.role !== "TECHNICIEN") return {};
  return {
    OR: [{ technicianId: session.id }, { parameters: { some: { technicianId: session.id } } }],
  };
}

/** The bench filter with the statuses that belong on it. */
export function benchQueueWhereFor(session: { id: string; role: Role }): Prisma.SampleWhereInput {
  return { ...benchWhereFor(session), status: { in: [...BENCH_STATUSES] } };
}
