import type { SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "./roles";
import { CORRECTABLE_STATUSES, canTransition } from "./sample-status";

/**
 * Who may correct the identification of a sample in « Corriger la fiche »
 * (the designation, the lot, the dates, the place…): the reception, the
 * validation desks (validateur, Direction) and the admin. The guard of
 * `PATCH /api/samples/[id]/intake` admits them and the responsable des
 * paramètres, who changes the analyses there once the bench has started
 * (`correctionRights`; checked by direction-guards.test.ts).
 */
export const FICHE_CORRECTION_ROLES = ["RECEPTIONNISTE", "VALIDATEUR", "DIRECTION", "ADMIN"] as const satisfies readonly Role[];

/**
 * Where the reception and the validation desks may still change the
 * analyses: before the programme is confirmed (16/10, Q128 — RP3b (a)).
 */
const ANALYSES_BEFORE_PROGRAMME: readonly SampleStatus[] = ["PRELEVE", "RECU"];

/**
 * Where the responsable des paramètres changes them through « Corriger la
 * fiche »: once the bench has started. Before, at RECU and PROGRAMME, the
 * programme sheet itself is editable (`PROGRAMMABLE_STATUSES`).
 */
const ANALYSES_AT_THE_BENCH: readonly SampleStatus[] = ["EN_ANALYSE", "RESULTATS_SAISIS"];

/** The two halves of « Corriger la fiche » one person may use on one sample. */
export type CorrectionRights = {
  /** The identification fields: designation, lot, dates, quantity, place, temperatures, remarks… */
  identification: boolean;
  /** The analyses: their list, the product type (its criteria) and the number of units. */
  analyses: boolean;
};

/**
 * Who changes what in « Corriger la fiche » (16/10, Q128 — RP3b (a)): once
 * the programme is confirmed, the analyses — their list, the product type
 * and the number of units — belong to the responsable des paramètres and the
 * administrator. The identification stays with `FICHE_CORRECTION_ROLES`.
 *
 * - identification: `FICHE_CORRECTION_ROLES`, until the approval;
 * - analyses: the administrator always; the reception, the validateur and
 *   the Direction before the programme (PRELEVE, RECU); the responsable des
 *   paramètres at the bench (EN_ANALYSE, RESULTATS_SAISIS) — before, he
 *   edits the programme sheet itself.
 *
 * Nothing once approved, sent or cancelled (`CORRECTABLE_STATUSES`). The
 * intake route decides with this, field by field (`correctionRefusal`).
 */
export function correctionRights(role: Role, status: SampleStatus): CorrectionRights {
  if (!CORRECTABLE_STATUSES.includes(status)) return { identification: false, analyses: false };
  const identification = (FICHE_CORRECTION_ROLES as readonly Role[]).includes(role);
  let analyses = false;
  if (role === "ADMIN") analyses = true;
  else if (role === "PROGRAMMATEUR") analyses = ANALYSES_AT_THE_BENCH.includes(status);
  else if (identification) analyses = ANALYSES_BEFORE_PROGRAMME.includes(status);
  return { identification, analyses };
}

/** Why the intake route refuses a correction (403), in the person's words. */
export const CORRECTION_MESSAGES = {
  analysesReserved:
    "Après la confirmation du programme, les analyses se changent par le responsable des paramètres.",
  /** The responsable des paramètres, before the bench: the programme sheet is open. */
  analysesOnProgramme:
    "Tant que la paillasse n'a pas commencé, les analyses se changent sur la fiche de programme.",
  identificationReserved:
    "L'identification de l'échantillon (désignation, lot, dates, lieu…) se corrige par la réception, la validation ou l'administrateur.",
} as const;

/**
 * The refusal of a correction that touches what this person may not change
 * here, or null. `touches` says which halves the correction actually changes
 * (`correctionTouches` in intake-input.ts).
 */
export function correctionRefusal(
  role: Role,
  status: SampleStatus,
  touches: { identification: boolean; analyses: boolean }
): string | null {
  const rights = correctionRights(role, status);
  if (touches.analyses && !rights.analyses) {
    return role === "PROGRAMMATEUR" ? CORRECTION_MESSAGES.analysesOnProgramme : CORRECTION_MESSAGES.analysesReserved;
  }
  if (touches.identification && !rights.identification) return CORRECTION_MESSAGES.identificationReserved;
  return null;
}

/**
 * How the correction notes name each role that may cancel a sample, in the
 * order they are named. Who may, at a given step, is the state machine's
 * answer (`canTransition(status, "ANNULE", role)`), never a list kept here.
 */
const CANCELLER_NAMES: readonly (readonly [Role, string])[] = [
  ["RECEPTIONNISTE", "la réception"],
  ["VALIDATEUR", "la validation"],
  ["DIRECTION", "la Direction"],
  ["ADMIN", "l'administrateur"],
];

/** « a », « a ou b », « a, b ou c ». */
function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;
}

/**
 * Who cancels a sample at this step, in words (16/10, Q13): « la réception
 * ou l'administrateur » before the programme, « la validation, la Direction
 * ou l'administrateur » from the programme to the results. `of` puts « de »
 * before each name (« relève de la réception ou de l'administrateur »).
 * Empty when nobody may (approved, sent, cancelled).
 */
export function cancellersLabel(status: SampleStatus, of = false): string {
  const names = CANCELLER_NAMES.filter(([role]) => canTransition(status, "ANNULE", role).ok).map(([, name]) =>
    of ? `de ${name}` : name
  );
  return orList(names);
}

/**
 * The name of the verb: « Corriger la fiche » with the identification,
 * « Corriger les analyses » for the responsable des paramètres, who changes
 * nothing else there.
 */
export function correctionLabel(rights: CorrectionRights): string {
  return rights.identification ? "Corriger la fiche" : "Corriger les analyses";
}

/**
 * Who opens a sample's validation page, `/validation/[id]` — exactly its
 * guard (checked by direction-guards.test.ts). /recherche links the N° there
 * for them, so a sample at the bench can be opened and cancelled (16/10,
 * Q13), and a sent report reopened.
 */
export const VALIDATION_PAGE_ROLES = ["VALIDATEUR", "DIRECTION", "ADMIN"] as const satisfies readonly Role[];

export function opensValidationPage(role: Role): boolean {
  return (VALIDATION_PAGE_ROLES as readonly Role[]).includes(role);
}

/** Where /recherche opens one sample for one person, and what the link says to a screen reader. */
export type SampleLink = { href: string; label: string };

/**
 * The page a sample's N° opens in /recherche, or null (plain text):
 *   - the validation desks: its validation page, `/validation/[id]`;
 *   - the responsable des paramètres: its programme sheet,
 *     `/programmation/[id]` (guard PROGRAMMATEUR + ADMIN, every status) —
 *     the only way to a sample programmed on an earlier day and now at the
 *     bench, where his « Corriger les analyses » is (16/10, Q128).
 * The administrator opens the validation page, as before.
 */
export function sampleLinkFor(role: Role, id: string): SampleLink | null {
  if (opensValidationPage(role)) return { href: `/validation/${id}`, label: "ouvrir la fiche de validation" };
  if (role === "PROGRAMMATEUR") return { href: `/programmation/${id}`, label: "ouvrir la fiche de programme" };
  return null;
}

/**
 * Which correction verbs a role may use on a line: pure, so a Server
 * Component (the programme sheet) can decide what to render without
 * importing the client-side `SampleVerbs` module — calling a function of a
 * "use client" module from the server throws at runtime, not at build time.
 */
export function verbsFor(sample: { status: SampleStatus; hasReport?: boolean }, role: Role) {
  // « Corriger la fiche » in two halves (16/10, Q128): `correct` is the
  // identification, `correctAnalyses` the analyses, product type and units.
  const rights = correctionRights(role, sample.status);
  // A sample whose report was issued (reopened for amendment) is corrected by
  // the amendment, never cancelled — the cancel route refuses it too.
  const cancel = canTransition(sample.status, "ANNULE", role).ok && !sample.hasReport;
  const reactivate = sample.status === "ANNULE" && role === "ADMIN";
  return { correct: rights.identification, correctAnalyses: rights.analyses, cancel, reactivate };
}
