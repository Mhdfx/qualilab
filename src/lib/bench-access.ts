import type { Prisma } from "@/generated/prisma/client";
import type { ResultWorkStatus, SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "./roles";
import { BLIND_BENCH_SCREENS } from "./lab-proposals";

/**
 * Who works a line at the bench — the « prise en charge libre » of 13/10
 * (PROGRAMME.md §10).
 *
 * Nobody assigns a technician any more. A confirmed programme puts the
 * sample in the shared « À prendre » list; the technician who takes it —
 * « Prendre en charge », or the first result typed on it — becomes its
 * holder (`Sample.technicianId`, `assignedAt`) and is the only one who types
 * on it. « Libérer » gives it back while nothing is typed yet.
 *
 * Lines programmed before 13/10 may still carry a technician per parameter
 * (`SampleParameter.technicianId`): those rows keep working exactly as they
 * did — a parameter's own technician, else the sample's — and such a line
 * counts as taken, never as free. Samples assigned before 13/10 count as
 * taken by that person.
 *
 * Pure, so the rule is written once and read the same way by the bench
 * lists and tiles, the sheet, the take route, `PUT …/results` and
 * `POST …/results/submit`.
 */

/** The statuses a line is on the bench with: programmed, or under analysis. */
export const BENCH_STATUSES: readonly SampleStatus[] = ["PROGRAMME", "EN_ANALYSE"];

export type BenchSampleRef = { technicianId: string | null };
export type BenchParameterRef = { parameterId: string; technicianId: string | null };
export type BenchSample = BenchSampleRef & { parameters: readonly { technicianId: string | null }[] };

/** The technician in charge of one parameter: its own (legacy), else the sample's. */
export function parameterTechnicianId(
  sample: BenchSampleRef,
  parameter: { technicianId: string | null }
): string | null {
  return parameter.technicianId ?? sample.technicianId;
}

/** Does this user hold this parameter — the sample's holder, or a legacy parameter technician? */
export function canEditParameter(
  sample: BenchSampleRef,
  parameter: { technicianId: string | null },
  userId: string
): boolean {
  const technicianId = parameterTechnicianId(sample, parameter);
  return technicianId !== null && technicianId === userId;
}

/** Is this line on this user's bench — they took the sample, or hold one of its parameters? */
export function isOnBenchOf(sample: BenchSample, userId: string): boolean {
  return (
    sample.technicianId === userId ||
    sample.parameters.some((parameter) => parameter.technicianId === userId)
  );
}

/**
 * Nobody holds it: neither the sample nor any of its parameters — the
 * « À prendre » test, the pure twin of `UNCLAIMED_WHERE`.
 */
export function isUnclaimed(sample: BenchSample): boolean {
  return sample.technicianId === null && sample.parameters.every((parameter) => parameter.technicianId === null);
}

/** Taken by someone who is not this user — a colleague's sample, read-only. */
export function isHeldByOther(sample: BenchSample, userId: string): boolean {
  return !isUnclaimed(sample) && !isOnBenchOf(sample, userId);
}

/**
 * May this technician type this parameter? Their own (`canEditParameter`),
 * or any parameter of a free sample — the first result typed takes it. On a
 * legacy line handed parameter by parameter with no sample holder, an
 * analysis nobody holds (added after 13/10 by the programme or « Corriger la
 * fiche ») belongs to the line's technicians — never to nobody.
 */
export function canEnterParameter(
  sample: BenchSample,
  parameter: { technicianId: string | null },
  userId: string
): boolean {
  if (isUnclaimed(sample) || canEditParameter(sample, parameter, userId)) return true;
  return sample.technicianId === null && parameter.technicianId === null && isOnBenchOf(sample, userId);
}

/**
 * The parameters of a line split between this user's and the ones a legacy
 * programme handed to other technicians — « il reste N paramètres à
 * d'autres techniciens ».
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
 * May a technician open this sheet? Their own work at any step, and the
 * whole shared bench (« À prendre » and colleagues' samples, read-only).
 */
export function canReadAtBench(sample: BenchSample & { status: SampleStatus }, userId: string): boolean {
  return isOnBenchOf(sample, userId) || BENCH_STATUSES.includes(sample.status);
}

// ─── Prisma filters ─────────────────────────────────────────────────────────

/**
 * « À prendre » — the shared list every technician sees: on the bench,
 * not held at reception, held by nobody (not even a legacy parameter
 * technician). The tiles, the lists and the dashboards all read this one
 * filter, so a count and its list cannot disagree.
 */
export const UNCLAIMED_WHERE = {
  status: { in: [...BENCH_STATUSES] },
  analysisBlocked: false,
  technicianId: null,
  parameters: { none: { technicianId: { not: null } } },
} satisfies Prisma.SampleWhereInput;

/** Taken by somebody — the sample's holder, or a legacy parameter technician. */
export const TAKEN_WHERE = {
  OR: [{ technicianId: { not: null } }, { parameters: { some: { technicianId: { not: null } } } }],
} satisfies Prisma.SampleWhereInput;

/**
 * The samples a user holds: a technician sees the lines they took (or hold
 * a legacy parameter of); every other admitted role sees them all (`{}`).
 * What « Mes analyses », the bench tiles, the bench sheet, search and the
 * list API narrow a technician to.
 */
export function benchWhereFor(session: { id: string; role: Role }): Prisma.SampleWhereInput {
  if (session.role !== "TECHNICIEN") return {};
  return {
    OR: [{ technicianId: session.id }, { parameters: { some: { technicianId: session.id } } }],
  };
}

/**
 * Does this viewer's bench hide the client (re-ask 2.15, Q55, plan C2)? A
 * technician's screens — the bench lists, the sheet, the search — name
 * neither the client nor the site, like the bench sheet (C1); every other
 * role still reads them. `enabled` is the switch, passed by the tests.
 */
export function benchHidesClient(role: Role, enabled: boolean = BLIND_BENCH_SCREENS): boolean {
  return enabled && role === "TECHNICIEN";
}

/**
 * What a technician's « Recherche des analyses » may reach: the samples they
 * hold (`benchWhereFor`); every other role, everything (undefined). On a
 * blind bench (`benchHidesClient`) the free text must also match something
 * the technician reads on the sheet — the numbers, the designation, the lot
 * — never only the client's or the site's name, nor the client's place
 * (`lieu`), which would tell them whose sample it is. Wrapped in AND by
 * `searchSamples`, so it narrows the search's own text OR (client and site
 * included) to these fields; a field added there and not here is simply not
 * searched by the technician (fails closed).
 */
export function benchSearchScope(
  session: { id: string; role: Role },
  q: string | null,
  enabled: boolean = BLIND_BENCH_SCREENS
): Prisma.SampleWhereInput | undefined {
  if (session.role !== "TECHNICIEN") return undefined;
  if (!q || !benchHidesClient(session.role, enabled)) return benchWhereFor(session);
  return {
    AND: [
      benchWhereFor(session),
      {
        OR: [
          { code: { contains: q } },
          { controlCode: { contains: q } },
          { serialNumber: { contains: q } },
          { serie: { serialNumber: { contains: q } } },
          { produit: { contains: q } },
          { numeroLot: { contains: q } },
        ],
      },
    ],
  };
}

/** The held filter with the statuses that belong on the bench. */
export function benchQueueWhereFor(session: { id: string; role: Role }): Prisma.SampleWhereInput {
  return { ...benchWhereFor(session), status: { in: [...BENCH_STATUSES] } };
}

/**
 * The taken bench samples that are not the viewer's — « Pris par un
 * collègue » for a technician (read-only), every taken one for the admin.
 */
export function takenByOthersWhere(session: { id: string; role: Role }): Prisma.SampleWhereInput {
  return {
    status: { in: [...BENCH_STATUSES] },
    AND: [TAKEN_WHERE, ...(session.role === "TECHNICIEN" ? notMine(session.id) : [])],
  };
}

/**
 * « Not mine », spelled column by column: a NOT around `technicianId = me`
 * would also drop the rows whose holder is NULL (SQL three-valued logic) —
 * the legacy lines held only by a colleague's parameters.
 */
function notMine(userId: string): Prisma.SampleWhereInput[] {
  return [
    { OR: [{ technicianId: null }, { technicianId: { not: userId } }] },
    { parameters: { none: { technicianId: userId } } },
  ];
}

// ─── What counts as a typed result ──────────────────────────────────────────

/**
 * A result row with something typed in it: a value, a unit reading, a note,
 * or a step other than « En cours ». An « Enregistrer » with nothing typed
 * writes empty rows: those neither take the sample, nor start its analysis,
 * nor stop its release — the three rules read this one predicate.
 */
export type TypedResultFields = {
  value: string | null;
  note: string | null;
  workStatus: ResultWorkStatus;
  /** How many unit readings the row holds. */
  unitCount: number;
};

export function hasTypedResult(result: TypedResultFields): boolean {
  return result.value !== null || result.note !== null || result.unitCount > 0 || result.workStatus !== "EN_COURS";
}

/** `hasTypedResult` as a Prisma filter on `Result`. */
export const TYPED_RESULT_WHERE = {
  OR: [
    { value: { not: null } },
    { note: { not: null } },
    { units: { some: {} } },
    { workStatus: { not: "EN_COURS" } },
  ],
} satisfies Prisma.ResultWhereInput;

// ─── Taking and giving back ─────────────────────────────────────────────────

export const TAKE_MESSAGES = {
  notFound: "Échantillon introuvable.",
  takenBy: (name: string) => `Déjà pris par ${name}.`,
  notOnBench: "Cet échantillon n'est pas à prendre : son programme d'analyse n'est pas confirmé ou il a quitté la paillasse.",
  blocked: "Cet échantillon est bloqué en réception : il doit être libéré depuis « Bloqués » avant toute analyse.",
  notTaken: "Cet échantillon n'est pris en charge par personne.",
  notYours: (name: string) => `Seul ${name} ou un administrateur peut libérer cet échantillon.`,
  offBench: "Cet échantillon n'est plus à la paillasse : il ne peut plus être libéré.",
  typed: "Des résultats sont déjà saisis sur cet échantillon : il ne peut plus être libéré.",
  heldByOther: (name: string) =>
    `Cet échantillon est pris en charge par ${name} : vous ne pouvez pas y saisir de résultats.`,
  submitUnclaimed:
    "Personne n'a pris cet échantillon en charge : un technicien doit le prendre avant la soumission.",
} as const;

/** The sample as the take and the give-back read it, under the row lock. */
export type TakeState = {
  status: SampleStatus;
  analysisBlocked: boolean;
  technicianId: string | null;
  /** The holder's name — the sample's, else a legacy parameter technician's. */
  holderName: string | null;
  /** A legacy parameter technician holds part of it. */
  heldByParameter: boolean;
};

export type Refusal = { status: 403 | 404 | 409; error: string };

/**
 * May this technician take the sample? Null = yes. Already theirs is not a
 * refusal: the route answers it as done (a double click).
 */
export function takeRefusal(state: TakeState | null, userId: string): Refusal | null {
  if (!state) return { status: 404, error: TAKE_MESSAGES.notFound };
  if (state.technicianId === userId) return null;
  if (state.technicianId !== null || state.heldByParameter) {
    return { status: 409, error: TAKE_MESSAGES.takenBy(state.holderName ?? "un collègue") };
  }
  if (!BENCH_STATUSES.includes(state.status)) return { status: 409, error: TAKE_MESSAGES.notOnBench };
  if (state.analysisBlocked) return { status: 409, error: TAKE_MESSAGES.blocked };
  return null;
}

/**
 * May this user give the sample back to « À prendre »? Null = yes. Its
 * holder or an administrator, while it is on the bench and nothing is
 * typed on it (`hasTypedResult`).
 */
export function untakeRefusal(
  state: TakeState | null,
  typedResults: number,
  session: { id: string; role: Role }
): Refusal | null {
  if (!state) return { status: 404, error: TAKE_MESSAGES.notFound };
  if (state.technicianId === null && !state.heldByParameter) return { status: 409, error: TAKE_MESSAGES.notTaken };
  if (session.role !== "ADMIN" && state.technicianId !== session.id) {
    return { status: 403, error: TAKE_MESSAGES.notYours(state.holderName ?? "le technicien qui l'a pris") };
  }
  if (!BENCH_STATUSES.includes(state.status)) return { status: 409, error: TAKE_MESSAGES.offBench };
  if (typedResults > 0) return { status: 409, error: TAKE_MESSAGES.typed };
  return null;
}
