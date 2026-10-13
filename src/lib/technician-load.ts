import type { SampleStatus } from "@/generated/prisma/enums";
import { BENCH_STATUSES, parameterTechnicianId, type BenchSampleRef } from "./bench-access";
import { isLate } from "./circuit-views";

/**
 * What each technician holds at the bench — the admin's « Paillasse — qui
 * tient quoi » (prise en charge libre of 13/10, PROGRAMME.md §10).
 *
 * Nobody hands a line to a technician any more: a technician holds the
 * samples they took — « Prendre en charge », or the first result typed on a
 * free sample (`Sample.technicianId`). A line programmed before 13/10 may
 * still name a technician per parameter (`SampleParameter.technicianId`):
 * that technician holds the line too, read exactly as the bench reads it
 * (a parameter's own technician, else the sample's — `parameterTechnicianId`).
 * A free line (« À prendre ») is nobody's load.
 *
 * A technician's load is the lines programmed or under analysis
 * (`BENCH_STATUSES`) they hold: how many samples, how many of their
 * parameters, and how many of those samples are past their promised date
 * (`isLate`, the « En retard » rule of the dashboards).
 *
 * Pure: the dashboard loads the bench lines in one query and hands them
 * here. Kept apart from `bench-access.ts` because it reads
 * `circuit-views.ts`, which itself imports `bench-access.ts`.
 */

export type TechnicianLoad = {
  /** Lines they hold (the sample's holder, or a legacy parameter technician). */
  samples: number;
  /** Parameters of those lines that are theirs. */
  parameters: number;
  /** Of those lines, how many are past their promised date. */
  late: number;
};

export const NO_LOAD: TechnicianLoad = { samples: 0, parameters: 0, late: 0 };

export type BenchLoadSample = BenchSampleRef & {
  status: SampleStatus;
  dueAt: Date | null;
  parameters: readonly { technicianId: string | null }[];
};

/** Per technician id, what they hold at the bench at `now`. A technician holding nothing is absent. */
export function benchLoadByTechnician(
  samples: readonly BenchLoadSample[],
  now: Date
): Record<string, TechnicianLoad> {
  const loads: Record<string, TechnicianLoad> = {};
  const loadOf = (id: string) => (loads[id] ??= { ...NO_LOAD });
  for (const sample of samples) {
    if (!BENCH_STATUSES.includes(sample.status)) continue;
    const holders = new Set<string>();
    if (sample.technicianId) holders.add(sample.technicianId);
    for (const parameter of sample.parameters) {
      const technicianId = parameterTechnicianId(sample, parameter);
      if (!technicianId) continue;
      holders.add(technicianId);
      loadOf(technicianId).parameters += 1;
    }
    const late = isLate(sample, now);
    for (const technicianId of holders) {
      const load = loadOf(technicianId);
      load.samples += 1;
      if (late) load.late += 1;
    }
  }
  return loads;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** A load in words: « 3 échantillons pris · dont 1 en retard » (the delay only when some are late). */
export function technicianLoadText(load: TechnicianLoad): string {
  if (load.samples === 0) return "Aucun échantillon pris";
  const taken = plural(load.samples, "échantillon pris", "échantillons pris");
  return load.late > 0 ? `${taken} · dont ${load.late} en retard` : taken;
}

/**
 * Does this change of an account take its holder off the bench — disabled
 * now, or no longer a technician? Its taken samples then wait for someone:
 * the admin is warned (`benchHoldWarning`), never refused, since a departure
 * must stay possible at once.
 */
export function leavesBench(
  before: { role: string | null; banned: boolean | null },
  after: { role: string | null; banned: boolean | null }
): boolean {
  const disabled = !before.banned && Boolean(after.banned);
  const leftRole = before.role === "TECHNICIEN" && after.role !== "TECHNICIEN";
  return disabled || leftRole;
}

/**
 * What the admin is told when an account leaving the bench still holds
 * samples there; null when it holds none. Those samples stay taken — a
 * colleague cannot take them — until « Libérer » gives them back to
 * « À prendre » (nothing typed yet) or the admin finishes them.
 */
export function benchHoldWarning(held: number): string | null {
  if (held <= 0) return null;
  return held === 1
    ? "Ce technicien tient encore 1 échantillon à la paillasse : libérez-le depuis la paillasse (s'il n'a aucun résultat) ou terminez-le en tant qu'administrateur."
    : `Ce technicien tient encore ${held} échantillons à la paillasse : libérez-les depuis la paillasse (s'ils n'ont aucun résultat) ou terminez-les en tant qu'administrateur.`;
}
