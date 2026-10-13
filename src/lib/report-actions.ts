import type { SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "./roles";

/**
 * The actions on an issued report that are not part of the double
 * validation: the manual (re)send to the client (finalversion.md:116) and the
 * administrator's silent correction of the conclusion (HANDOFF §8, 18/08).
 * Pure rules — the screens hide what a role cannot do, the routes decide
 * again with the same constants.
 */

/**
 * Who may send or resend a report: the gestionnaire commercial (the client
 * relationship is theirs), the validator, the Direction and the
 * administrator — exactly the guard of `POST /api/samples/[id]/report/send`
 * (checked by its test).
 */
export const RESEND_REPORT_ROLES = ["GESTIONNAIRE", "VALIDATEUR", "DIRECTION", "ADMIN"] as const satisfies readonly Role[];

/**
 * Who may read an issued report — download, duplicata, older versions:
 * exactly the guards of `GET /api/samples/[id]/report` and of
 * `GET /api/samples/[id]/report/versions` (checked by the tests). /recherche
 * offers the report actions to these roles only.
 */
export const REPORT_READ_ROLES = ["VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "COMPTABLE", "ADMIN"] as const satisfies readonly Role[];

export function canReadReports(role: string): boolean {
  return (REPORT_READ_ROLES as readonly string[]).includes(role);
}

/** A report leaves the laboratory only once both signatures are on it. */
export const SENDABLE_STATUSES: readonly SampleStatus[] = ["VALIDE", "RAPPORT_ENVOYE"];

/**
 * Whether « Renvoyer au client » is offered. Never while an amendment is
 * pending: the version in force is being replaced, and the amended report
 * leaves on its own at the new administrative validation.
 */
export function canResendReport(role: string, status: SampleStatus, amendmentPending: boolean): boolean {
  return (RESEND_REPORT_ROLES as readonly string[]).includes(role) && SENDABLE_STATUSES.includes(status) && !amendmentPending;
}

/** The longest conclusion the administrator may type (printed on a one-page report). */
export const CONCLUSION_MAX_LENGTH = 2000;

/**
 * Whether « Modifier la conclusion » is offered: the administrator only, and
 * never while an amendment is pending — the amended report's approval
 * recomputes the conclusion (`amendReportFor`) and the correction would be lost.
 */
export function canEditConclusion(role: string, amendmentPending: boolean): boolean {
  return role === "ADMIN" && !amendmentPending;
}

export type ConclusionEdit =
  | { ok: true; conclusion: string }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Reads the body of `PATCH /api/reports/[id]/admin-edit`: a non-empty text of
 * at most `CONCLUSION_MAX_LENGTH` characters once trimmed, refused (409) while
 * an amendment is pending.
 */
export function readConclusionEdit(body: unknown, amendmentPending: boolean): ConclusionEdit {
  if (amendmentPending) {
    return {
      ok: false,
      status: 409,
      error:
        "Un amendement de ce rapport est en cours : sa conclusion sera recalculée à la validation administrative. Corrigez-la une fois le rapport amendé émis.",
    };
  }
  const conclusion = (body && typeof body === "object" ? (body as { conclusion?: unknown }).conclusion : undefined);
  if (typeof conclusion !== "string" || !conclusion.trim()) {
    return { ok: false, status: 400, error: "La conclusion ne peut pas être vide." };
  }
  const text = conclusion.trim();
  if (text.length > CONCLUSION_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `La conclusion ne peut pas dépasser ${CONCLUSION_MAX_LENGTH.toLocaleString("fr-FR")} caractères (${text.length.toLocaleString("fr-FR")} saisis).`,
    };
  }
  return { ok: true, conclusion: text };
}

/** What the send route answered, as the confirmation dialog shows it. */
export type ResendOutcome = {
  /** No mail provider configured yet: recorded in the journal, not delivered. */
  simulated: boolean;
  headline: string;
  recipients: string[];
  /** « 1 alerte de contamination envoyée avec le rapport. », or null when none left. */
  alerts: string | null;
  /** The alerts could not be sent: the report did leave, say why the alerts did not. */
  alertsError: string | null;
};

/**
 * Reads the JSON of a successful `POST /api/samples/[id]/report/send`
 * (`{ ok, status, to, alerts, alertsError }`). Defensive: a field missing
 * from the answer is shown as missing, never invented.
 */
export function resendOutcome(payload: unknown): ResendOutcome {
  const data = (payload && typeof payload === "object" ? payload : {}) as {
    status?: unknown;
    to?: unknown;
    alerts?: unknown;
    alertsError?: unknown;
  };
  const simulated = data.status === "SIMULE";
  const recipients = Array.isArray(data.to) ? data.to.filter((entry): entry is string => typeof entry === "string") : [];
  const count = typeof data.alerts === "number" && Number.isInteger(data.alerts) && data.alerts > 0 ? data.alerts : 0;
  const plural = count > 1 ? "s" : "";
  return {
    simulated,
    headline: simulated
      ? "Envoi simulé : aucun service d'envoi n'est encore configuré. Le message est inscrit au journal des envois mais n'a pas quitté le laboratoire."
      : "Rapport envoyé au client.",
    recipients,
    alerts:
      count > 0
        ? `${count} alerte${plural} de contamination ${simulated ? "enregistrée" : "envoyée"}${plural} avec le rapport.`
        : null,
    alertsError: typeof data.alertsError === "string" && data.alertsError.trim() ? data.alertsError.trim() : null,
  };
}
