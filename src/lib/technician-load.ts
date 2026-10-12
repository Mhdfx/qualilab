import type { SampleStatus } from "@/generated/prisma/enums";
import { BENCH_STATUSES, parameterTechnicianId, type BenchSampleRef } from "./bench-access";
import { isLate } from "./circuit-views";

/**
 * The load of each technician, shown where a line is handed to one
 * (finalversion.md: « attribution … avec visibilité sur la charge de
 * chacun »).
 *
 * A technician's load is what is on their bench now — the lines programmed
 * or under analysis (`BENCH_STATUSES`) where they hold the sample or at least
 * one of its parameters (PROGRAMME.md §6, the same rule as the bench queue):
 * how many samples, how many parameters are theirs (a parameter's own
 * technician, else the sample's), and how many of those samples are past
 * their promised date (`isLate`, the « En retard » rule of the dashboards).
 *
 * Pure: `loadProgrammeReferential` loads the bench lines in one query and
 * hands them here. Kept apart from `bench-access.ts` because it reads
 * `circuit-views.ts`, which itself imports `bench-access.ts`.
 */

export type TechnicianLoad = {
  /** Lines on their bench (the sample's technician or one of its parameters'). */
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

/** Per technician id, what is on their bench at `now`. A technician with nothing is absent. */
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

/**
 * A technician as a choice of the programme sheet: « Nom — 12 éch. · 3 en
 * retard » (the delay part only when some are late); the bare name when the
 * load is unknown (an older payload).
 */
export function technicianLoadLabel(name: string, load?: TechnicianLoad | null): string {
  if (!load) return name;
  const parts = [`${load.samples} éch.`];
  if (load.late > 0) parts.push(`${load.late} en retard`);
  return `${name} — ${parts.join(" · ")}`;
}

/** The same load in words: « 12 échantillons programmés ou en analyse · 40 paramètres · dont 3 en retard ». */
export function technicianLoadText(load: TechnicianLoad): string {
  if (load.samples === 0) return "Aucun échantillon programmé ou en analyse";
  const parts = [
    plural(load.samples, "échantillon programmé ou en analyse", "échantillons programmés ou en analyse"),
    plural(load.parameters, "paramètre", "paramètres"),
  ];
  if (load.late > 0) parts.push(`dont ${load.late} en retard`);
  return parts.join(" · ");
}
