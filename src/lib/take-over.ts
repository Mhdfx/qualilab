import type { SampleStatus } from "@/generated/prisma/enums";
import { BENCH_STATUSES, TAKE_MESSAGES, type Refusal, type TakeState } from "./bench-access";
import { COLLEAGUE_SAMPLES_HIDDEN, TAKE_OVER_COLLEAGUE } from "./lab-proposals";
import { formatDateTime } from "./labels";
import type { Role } from "./roles";

/**
 * « Reprendre » the sample a colleague holds (RETOUR-LABO-16-10.md §3, C3;
 * re-ask 2.13 — Q107 « l'accès à la saisie doit être pour tous les
 * techniciens responsables de la tâche »). Behind `TAKE_OVER_COLLEAGUE`.
 *
 * Any technician takes over a sample on the bench that a colleague holds:
 * one button, one confirmation, no reason to write (the proposal of 2.13).
 * The holder changes (`PATCH /api/samples/[id]/take`, under the row lock,
 * guarded by the holder the confirmation named); nothing else does — not
 * `assignedAt`, the start of the analyses the report prints, nor the
 * readings already saved, each with its author (`Result.enteredById`,
 * D-09); the one who takes over finishes and submits. Journalled
 * SAMPLE_TAKEN_OVER with the previous holder and how many readings were
 * saved: that row dates the take-over (`currentTakeOver`).
 *
 * What the plan left open, decided the safe way:
 * - a line a legacy programme handed parameter by parameter (before 13/10)
 *   is never taken over: whose parameters would move is not obvious — an
 *   administrator finishes it, as before;
 * - the previous holder's typing not yet saved is never written over the
 *   new holder's: their next « Enregistrer » is refused (the sample is no
 *   longer theirs) and the sheet keeps it on screen for them to pass on;
 *   the confirmation tells the one who takes over;
 * - the previous holder reads « Repris par X » on the sheet, and the sample
 *   leaves their « Mes analyses » for « Pris par un collègue ».
 *
 * With it, each reading of the sheet says who typed it (`enteredByText`,
 * « Saisi par X le … », as the validation page has since D-09), so a
 * sample taken over shows whose readings are whose.
 *
 * Pure, so the route, the sheet and the tests read the same rule.
 */

export const TAKE_OVER_MESSAGES = {
  disabled: "La reprise de l'échantillon d'un collègue n'est pas ouverte : seul son titulaire y saisit.",
  technicianOnly: "Seul un technicien reprend l'échantillon d'un collègue.",
  free: "Personne n'a pris cet échantillon en charge : utilisez « Prendre en charge ».",
  legacy:
    "Cet échantillon a été réparti paramètre par paramètre avant le 13/10 : il ne peut pas être repris. Un administrateur peut le terminer à la place de ses techniciens.",
  offBench: "Cet échantillon n'est plus à la paillasse : il ne peut plus être repris.",
  changed: "Cet échantillon vient de changer : rechargez la page.",
} as const;

/**
 * May this user take the sample over from its holder? Null = yes. Already
 * theirs is not a refusal: the route answers it as done (a double click).
 * `enabled` is the switch, passed by the tests.
 */
export function takeOverRefusal(
  state: TakeState | null,
  session: { id: string; role: Role },
  enabled: boolean = TAKE_OVER_COLLEAGUE,
  colleaguesHidden: boolean = COLLEAGUE_SAMPLES_HIDDEN
): Refusal | null {
  if (!enabled) return { status: 403, error: TAKE_OVER_MESSAGES.disabled };
  // Lot 5A, J7 (2.14 of 20/11, hypothèse D-1): a colleague's sample is no
  // longer reached — the administrator's « Libérer » hands it over instead.
  // Answered as a sample that does not exist, like its sheet (review of lot
  // 5A: the button is never offered, only an address typed reaches it).
  if (colleaguesHidden) return state && state.technicianId === session.id ? null : { status: 404, error: TAKE_MESSAGES.notFound };
  if (session.role !== "TECHNICIEN") return { status: 403, error: TAKE_OVER_MESSAGES.technicianOnly };
  if (!state) return { status: 404, error: TAKE_MESSAGES.notFound };
  if (state.technicianId === session.id) return null;
  // Off the bench or held at reception first: « Prendre en charge » would
  // refuse such a free sample too, so it is never the answer to it.
  if (!BENCH_STATUSES.includes(state.status)) return { status: 409, error: TAKE_OVER_MESSAGES.offBench };
  if (state.analysisBlocked) return { status: 409, error: TAKE_MESSAGES.blocked };
  if (state.heldByParameter) return { status: 409, error: TAKE_OVER_MESSAGES.legacy };
  if (state.technicianId === null) return { status: 409, error: TAKE_OVER_MESSAGES.free };
  return null;
}

/**
 * The refusals of `PUT …/results` and `POST …/results/submit` that say the
 * sample is no longer the viewer's: a colleague holds it — took it over
 * (403 `TAKE_MESSAGES.heldByOther`), or took it during the save (409
 * « Déjà pris par X. », `TAKE_MESSAGES.takenBy`). Read from the messages
 * themselves, so a reworded message cannot silently drift from this test.
 */
const LOST_SAMPLE_MESSAGES = [TAKE_MESSAGES.heldByOther, TAKE_MESSAGES.takenBy].map(
  (message) => message("\u0000").split("\u0000") as [prefix: string, suffix: string]
);

/**
 * The colleague who now holds the sample, when this refusal says the sample
 * is no longer the viewer's; null for any other refusal (a legacy parameter
 * « réservé à » a colleague, a programme changed, a guard) — the sheet then
 * re-renders as before instead of keeping the typing (`ResultEntryForm`).
 */
export function lostSampleHolder(message: string): string | null {
  for (const [prefix, suffix] of LOST_SAMPLE_MESSAGES) {
    if (message.length > prefix.length + suffix.length && message.startsWith(prefix) && message.endsWith(suffix)) {
      return message.slice(prefix.length, message.length - suffix.length);
    }
  }
  return null;
}

/** A sheet's sample as `takeOverRefusal` reads it — the twin of `lockTakeState`, from the page's own select. */
export function takeStateOf(sample: {
  status: SampleStatus;
  analysisBlocked: boolean;
  technicianId: string | null;
  technician: { name: string } | null;
  parameters: readonly { technicianId: string | null }[];
}): TakeState {
  return {
    status: sample.status,
    analysisBlocked: sample.analysisBlocked,
    technicianId: sample.technicianId,
    holderName: sample.technician?.name ?? null,
    heldByParameter: sample.parameters.some((parameter) => parameter.technicianId !== null),
  };
}

/** The journal's bench rows on a sample — the take, the give-back, the take-over. */
export const HOLDER_ACTIONS = ["SAMPLE_TAKEN", "SAMPLE_UNTAKEN", "SAMPLE_TAKEN_OVER"] as const;

export type HolderRow = { action: string; actorId: string | null; createdAt: Date; metadata: string | null };

export type TakeOver = {
  at: Date;
  previousTechnicianId: string | null;
  previousTechnicianName: string | null;
};

/**
 * The take-over the current holder holds the sample by: the latest bench
 * row of the journal, when it is a SAMPLE_TAKEN_OVER written by that holder.
 * Null when they took it from « À prendre », or nobody holds it. `rows` in
 * any order.
 */
export function currentTakeOver(rows: readonly HolderRow[], holderId: string | null): TakeOver | null {
  if (!holderId) return null;
  const latest = rows
    .filter((row) => (HOLDER_ACTIONS as readonly string[]).includes(row.action))
    .reduce<HolderRow | null>((last, row) => (!last || row.createdAt >= last.createdAt ? row : last), null);
  if (!latest || latest.action !== "SAMPLE_TAKEN_OVER" || latest.actorId !== holderId) return null;
  const meta = parseMeta(latest.metadata);
  return {
    at: latest.createdAt,
    previousTechnicianId: typeof meta.previousTechnicianId === "string" ? meta.previousTechnicianId : null,
    previousTechnicianName:
      typeof meta.previousTechnicianName === "string" && meta.previousTechnicianName.trim()
        ? meta.previousTechnicianName.trim()
        : null,
  };
}

/**
 * Since when the current holder holds the sample — the « pris le … » of the
 * bench, the validation and the programme screens (review of lot 5A).
 *
 * - Taken over from a colleague (C3): the take-over's own row
 *   (`currentTakeOver`).
 * - Taken from « À prendre » after an administrator freed the sample with
 *   its readings on it (J7, SAMPLE_UNTAKEN `typedResults` > 0): `assignedAt`
 *   was kept as the start of the analyses — the report's « Date d'analyse »
 *   — so this take is dated by its own SAMPLE_TAKEN row (explicit, or the
 *   implicit one of a first reading), never by the previous holder's.
 * - Any other take: `assignedAt`, as before.
 *
 * `rows` in any order; null when nobody holds it.
 */
export function holderTakenAt(
  rows: readonly HolderRow[],
  holderId: string | null,
  assignedAt: Date | null
): Date | null {
  if (!holderId) return null;
  const takeOver = currentTakeOver(rows, holderId);
  if (takeOver) return takeOver.at;
  const bench = rows.filter((row) => (HOLDER_ACTIONS as readonly string[]).includes(row.action));
  const latest = bench.reduce<HolderRow | null>((last, row) => (!last || row.createdAt >= last.createdAt ? row : last), null);
  if (latest && latest.action === "SAMPLE_TAKEN" && latest.actorId === holderId) {
    const handedOver = bench.some(
      (row) =>
        row !== latest &&
        row.action === "SAMPLE_UNTAKEN" &&
        row.createdAt <= latest.createdAt &&
        typedResultsOf(row) > 0
    );
    if (handedOver) return latest.createdAt;
  }
  return assignedAt;
}

/**
 * A technician's samples in the order they took them (the printed bench
 * sheet): by `holderTakenAt` — `takenAt`, else `assignedAt` — then by
 * reception and code, a missing time first (as MySQL sorts NULL). A sample
 * handed over by an administrator with its readings (J7) keeps its old
 * `assignedAt`, and must not lead the new holder's sheet (review of lot 5A).
 */
export function inTakeOrder<T extends { id: string; assignedAt: Date | null; receivedAt: Date | null; code: string }>(
  rows: readonly T[],
  takenAt: ReadonlyMap<string, Date | null>
): T[] {
  const time = (date: Date | null | undefined) => (date ? date.getTime() : Number.NEGATIVE_INFINITY);
  const key = (row: T) => time(takenAt.get(row.id) ?? row.assignedAt);
  return [...rows].sort(
    (a, b) =>
      key(a) - key(b) ||
      time(a.receivedAt) - time(b.receivedAt) ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
  );
}

/** How many readings a SAMPLE_UNTAKEN row says the sample carried when freed (lot 5A, J7); 0 when absent. */
function typedResultsOf(row: HolderRow): number {
  const typed = parseMeta(row.metadata).typedResults;
  return typeof typed === "number" && Number.isFinite(typed) ? typed : 0;
}

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * « Saisi par X le … » under a reading at the bench — the same words and the
 * same rule as the validation page (D-09): a line with a value or a unit
 * reading names whoever typed it last, even after a take-over; a line left
 * empty names nobody.
 */
export function enteredByText(
  result:
    | {
        value: string | null;
        enteredBy: { name: string } | null;
        enteredAt: Date | null;
        units: readonly unknown[];
      }
    | null
    | undefined
): string | null {
  if (!result?.enteredBy || !result.enteredAt || !(result.value || result.units.length > 0)) return null;
  return `Saisi par ${result.enteredBy.name} le ${formatDateTime(result.enteredAt)}`;
}

/**
 * The confirmation of the administrator's « Libérer » on a sample that
 * carries readings (lot 5A, J7): what stays (the readings, with their
 * author), where it goes, and that its holder should be told.
 */
export function releaseTypedConfirmation(holderName: string): string {
  return (
    `Retirer cet échantillon à ${holderName} et le remettre dans « À prendre » ?\n\n` +
    `Les résultats déjà enregistrés restent, chacun au nom de la personne qui l'a saisi ; le technicien qui le prendra en charge termine la saisie et soumet l'échantillon.\n` +
    `Ce que ${holderName} n'a pas encore enregistré ne sera pas gardé : pensez à prévenir ${holderName}.`
  );
}

/**
 * The confirmation « Reprendre cet échantillon » asks, naming the holder:
 * what stays (the saved readings, with their author), what does not (their
 * typing not saved yet), and who submits.
 */
export function takeOverConfirmation(holderName: string): string {
  return (
    `Reprendre cet échantillon à ${holderName} ?\n\n` +
    `Les résultats déjà enregistrés restent, chacun au nom de la personne qui l'a saisi ; vous terminez la saisie et soumettez l'échantillon.\n` +
    `Ce que ${holderName} n'a pas encore enregistré ne sera pas gardé : pensez à prévenir ${holderName}.`
  );
}
