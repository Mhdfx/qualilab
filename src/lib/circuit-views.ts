import type { Prisma } from "@/generated/prisma/client";
import type { SampleStatus } from "@/generated/prisma/enums";
import { benchQueueWhereFor, benchWhereFor } from "./bench-access";
import type { Role } from "./roles";

/**
 * The tiles of the circuit dashboards as sorts (retour du laboratoire :
 * « rendre tous les blocs de tous les dashboards cliquables comme un tri »).
 *
 * Each `?vue=` of /programmation, /technicien, /validation and /preleveur is
 * defined once here — its label (the tile's) and the exact filter the tile
 * counts with. The tile and the list it opens read the same definition, so
 * they cannot disagree. The address side (`parseView`, `viewHref`, and
 * `serverIsoDay` for a day link to /recherche) lives in
 * `lib/dashboard-view.ts`. Pure and client-safe (type-only Prisma imports).
 */

// ─── /programmation ─────────────────────────────────────────────────────────

/** The views of the programme queue, keyed as the address writes them. */
export const PROGRAMMATION_VIEWS = {
  a_programmer: "À programmer",
  aujourdhui: "Programmés aujourd'hui",
  retard: "En retard",
  programmes: "En attente de paillasse",
} as const;
export type ProgrammationView = keyof typeof PROGRAMMATION_VIEWS;

/** The queue without a view: received and programmed samples (PROGRAMME.md §5). */
export const PROGRAMMATION_QUEUE_STATUSES = ["RECU", "PROGRAMME"] as const satisfies readonly SampleStatus[];

/**
 * « En retard »: a promised date already passed on a sample the circuit still
 * owes — received, programmed, at the bench or awaiting validation.
 */
export const LATE_STATUSES = ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as const satisfies readonly SampleStatus[];

/**
 * The « En retard » badge of one line — the same rule as the view, so a
 * sample validated after its promised date is not flagged late any more.
 */
export function isLate(line: { dueAt: Date | null; status: SampleStatus }, now: Date): boolean {
  return (
    line.dueAt !== null &&
    line.dueAt.getTime() < now.getTime() &&
    (LATE_STATUSES as readonly SampleStatus[]).includes(line.status)
  );
}

/** The page's clock: one `now` and the start of its day, shared by every tile and list. */
export type DayClock = { now: Date; startOfDay: Date };

/**
 * The samples of a programmation view. « Programmés aujourd'hui » and
 * « En retard » reach past the queue (a sample programmed this morning may
 * already be at the bench), so each view is its own query, never a filter
 * of the loaded queue.
 */
export function programmationWhere(view: ProgrammationView | null, clock: DayClock): Prisma.SampleWhereInput {
  switch (view) {
    case null:
      return { status: { in: [...PROGRAMMATION_QUEUE_STATUSES] } };
    case "a_programmer":
      return { status: "RECU" };
    case "programmes":
      return { status: "PROGRAMME" };
    case "aujourdhui":
      return { programmedAt: { gte: clock.startOfDay } };
    case "retard":
      return { dueAt: { lt: clock.now }, status: { in: [...LATE_STATUSES] } };
  }
}

// ─── /technicien ────────────────────────────────────────────────────────────

/** The views of the bench. */
export const BENCH_VIEWS = {
  a_commencer: "Qui m'attendent",
  en_analyse: "En analyse",
  anomalies: "Anomalies",
  soumis: "Résultats soumis",
} as const;
export type BenchView = keyof typeof BENCH_VIEWS;

/**
 * The samples of a bench view, always inside the viewer's bench (the lines
 * they hold or share a parameter of; everything for the admin —
 * `bench-access.ts`). « Anomalies » counts samples, not readings: a sample
 * with a parameter in anomaly, whatever its step; « Résultats soumis » the
 * samples handed to validation. Both reach past the bench statuses.
 */
export function benchViewWhere(view: BenchView | null, session: { id: string; role: Role }): Prisma.SampleWhereInput {
  if (view === null) return benchQueueWhereFor(session);
  const within = (where: Prisma.SampleWhereInput): Prisma.SampleWhereInput => ({
    AND: [benchWhereFor(session), where],
  });
  switch (view) {
    case "a_commencer":
      return within({ status: "PROGRAMME" });
    case "en_analyse":
      return within({ status: "EN_ANALYSE" });
    case "anomalies":
      return within({ results: { some: { workStatus: "ANOMALIE" } } });
    case "soumis":
      return within({ status: "RESULTATS_SAISIS" });
  }
}

// ─── /validation ────────────────────────────────────────────────────────────

/** The views of the validation queue (samples whose results are submitted). */
export const VALIDATION_VIEWS = {
  a_valider: "À valider",
  attente_admin: "Attente admin",
} as const;
export type ValidationView = keyof typeof VALIDATION_VIEWS;

/**
 * Is this submitted sample in the view? « Attente admin » once the technical
 * validation is signed, « À valider » before; no view keeps them all.
 */
export function inValidationView(view: ValidationView | null, item: { validatedById: string | null }): boolean {
  if (view === null) return true;
  return view === "attente_admin" ? item.validatedById !== null : item.validatedById === null;
}

// ─── /preleveur ─────────────────────────────────────────────────────────────

/** The views of « Mes visites ». No view is the whole list (« Échantillons au total »). */
export const PRELEVEUR_VIEWS = {
  aujourdhui: "Visites aujourd'hui",
  semaine: "Visites de la semaine",
} as const;
export type PreleveurView = keyof typeof PRELEVEUR_VIEWS;

/**
 * The first instant of a view on the device's clock (the préleveur's phone):
 * today's midnight, or seven days before it for the week — today and the
 * seven days before.
 */
export function visitViewStart(view: PreleveurView, now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (view === "semaine") start.setDate(start.getDate() - 7);
  return start;
}

/** The visits of a view, in the list's order; no view keeps them all. */
export function visitsInView<T extends { startedAt: Date | string }>(
  visits: readonly T[],
  view: PreleveurView | null,
  now: Date
): T[] {
  if (view === null) return [...visits];
  const since = visitViewStart(view, now).getTime();
  return visits.filter((visit) => new Date(visit.startedAt).getTime() >= since);
}
