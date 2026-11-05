import type { SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "./roles";
import { formatDecimal } from "./labels";
import { alertsAtApproval } from "./alert-moment";
import { ACCREDITATION_LOGO_BY_HAND, COMMERCIAL_RESENDS_REPORTS } from "./lab-proposals";

/**
 * The actions on an issued report that are not part of the double
 * validation: the send to the client — never automatic since 16/10 (Q92) —
 * and its resend (finalversion.md:116), and the administrator's silent
 * correction of the conclusion (HANDOFF §8, 18/08). Pure rules — the screens
 * hide what a role cannot do, the routes decide again with the same constants.
 */

/**
 * Who sends a report to the client — the FIRST send of a version, sample by
 * sample (« Envoyer au client ») or a whole série: the validator, the
 * Direction and the administrator. The laboratory struck « le gestionnaire
 * commercial » from the senders (re-ask 2.16 (b), answer of 28/10 —
 * RETOUR-LABO-28-10.md K2). The guard of the série's send
 * (`POST /api/series/[id]/reports/send`, its plan `GET …/reports`), checked
 * by the tests.
 */
export const SEND_REPORT_ROLES = ["VALIDATEUR", "DIRECTION", "ADMIN"] as const satisfies readonly Role[];

/**
 * Who may reach `POST /api/samples/[id]/report/send` at all: the senders,
 * plus the gestionnaire commercial for the RESEND of a version already sent
 * (finalversion.md:116, V11) while `COMMERCIAL_RESENDS_REPORTS` is on. The
 * route then decides with `reportSendRefusal` on the report it reads: since
 * lot 4A (K8, Q9 of 04/11 — the switch off) it refuses the gestionnaire
 * every send with a 403; the guard keeps the four so that the switch stays
 * a way back without touching the route.
 */
export const RESEND_REPORT_ROLES = ["GESTIONNAIRE", ...SEND_REPORT_ROLES] as const satisfies readonly Role[];

/** Whether this role sends a version never sent (`SEND_REPORT_ROLES`). */
export function sendsReports(role: string): boolean {
  return (SEND_REPORT_ROLES as readonly string[]).includes(role);
}

/**
 * Why this role may not send this report now, or null when it may — the
 * per-sample route's decision after its guard. The senders always may (the
 * dispatch then checks the status, the amendment, the addresses); the
 * gestionnaire commercial only resends the version in force once it has
 * left (`reportVersionSent`), never while an amendment is pending (the
 * send would issue and send the amended version: a first send), and not at
 * all when `COMMERCIAL_RESENDS_REPORTS` is off (the default since lot 4A,
 * K8 — confirmé le 04/11).
 */
export function reportSendRefusal(
  role: string,
  report: { sentAt: Date | null; amendedAt: Date | null; amendmentPending: boolean } | null,
  commercialResends: boolean = COMMERCIAL_RESENDS_REPORTS
): string | null {
  if (sendsReports(role)) return null;
  if (role !== "GESTIONNAIRE" || !commercialResends) return "Votre profil n'est pas autorisé à envoyer les rapports.";
  if (!report || report.amendmentPending || !reportVersionSent(report)) {
    return "Le premier envoi d'un rapport revient au validateur, à la direction ou à l'administrateur ; le gestionnaire commercial le renvoie une fois parti.";
  }
  return null;
}

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
 * Whether « Envoyer / Renvoyer au client » is offered. Never while an
 * amendment is pending: the version in force is being replaced, and the
 * amended report is issued at the new administrative validation — to be
 * sent then. `sent` is `reportVersionSent` of the version in force: the
 * gestionnaire commercial is offered « Renvoyer » only (28/10, K2 —
 * `reportSendRefusal`, the route's own decision).
 */
export function canResendReport(
  role: string,
  status: SampleStatus,
  amendmentPending: boolean,
  sent: boolean,
  commercialResends: boolean = COMMERCIAL_RESENDS_REPORTS
): boolean {
  if (!SENDABLE_STATUSES.includes(status) || amendmentPending) return false;
  if (sendsReports(role)) return true;
  return role === "GESTIONNAIRE" && commercialResends && sent;
}

/**
 * Whether the version in force has reached the client — « Renvoyer » rather
 * than « Envoyer au client »: a send recorded since this version was issued.
 * An amended version keeps the record's `sentAt` of the version it replaced
 * (`amendReportFor` does not clear it), so the date alone would read
 * « Renvoyer » on a « -A1 » never sent. The original (`amendedAt` null) can
 * only have been sent after it was issued.
 */
export function reportVersionSent(report: { sentAt: Date | null; amendedAt: Date | null }): boolean {
  if (report.sentAt === null) return false;
  return report.amendedAt === null || report.sentAt.getTime() > report.amendedAt.getTime();
}

/**
 * What the administrative validation sends (16/10, Q92: « le rapport ne
 * devra pas être envoyé automatiquement au client »). « Valider » issues the
 * report and leaves the sample VALIDE — listed « Validés — à envoyer » —
 * until someone clicks « Envoyer au client »; « Valider et envoyer » sends it
 * at once. The contamination alerts (`sendAlerts`, `alertsAtApproval`):
 * since lot 4A (K7, Q9 of 04/11 — `ALERTS_AT_VALIDATION` off) they leave
 * with the report only, so with « Valider et envoyer »; switch on, the
 * approval always runs them (a no-op when they left at the technical
 * validation, the retry of a failed one, or their only send).
 *
 * `accreditationLogo` (K10, Q13 of 04/11 — `ACCREDITATION_LOGO_BY_HAND`):
 * the box « Logo d'accréditation » as the signer left it, null when it was
 * not shown (no logo uploaded) or the switch is off — the rule decides
 * (`accreditationLogoDecision`).
 */
export type ApprovalDispatch =
  | { ok: true; sendReport: boolean; sendAlerts: boolean; accreditationLogo: boolean | null }
  | { ok: false; error: string };

/**
 * Reads `send` of the approval body (`POST /api/samples/[id]/validation`,
 * `action: "approve"`, and the série's): absent is « Valider » (nothing
 * leaves), `true` is « Valider et envoyer »; `accreditationLogo` absent or
 * null is the rule, a boolean the signer's choice; anything else is refused
 * (400) rather than guessed.
 */
export function approvalDispatch(body: unknown, logoByHand: boolean = ACCREDITATION_LOGO_BY_HAND): ApprovalDispatch {
  const fields = body && typeof body === "object" ? (body as { send?: unknown; accreditationLogo?: unknown }) : {};
  const send = fields.send;
  if (send !== undefined && typeof send !== "boolean") {
    return { ok: false, error: "Requête invalide : « send » vaut true ou false." };
  }
  const logo = fields.accreditationLogo;
  if (logo !== undefined && logo !== null && typeof logo !== "boolean") {
    return { ok: false, error: "Requête invalide : « accreditationLogo » vaut true, false ou null." };
  }
  return {
    ok: true,
    sendReport: send === true,
    sendAlerts: alertsAtApproval(send === true),
    accreditationLogo: logoByHand && typeof logo === "boolean" ? logo : null,
  };
}

/** The validation panel's four decisions, as `POST /api/samples/[id]/validation` reads them. */
export type ValidationAction = "validate" | "approve" | "reject";

/**
 * The body the validation panel posts. `send` rides only on an approval —
 * true for « Valider et envoyer », false for « Valider » — so that
 * `approvalDispatch` sends the report exactly when that button was used.
 * `accreditationLogo` (K10) rides on an approval too, only when the box was
 * shown (a boolean); null or absent leaves the rule to decide.
 */
export function validationBody(
  action: ValidationAction,
  reason: string,
  regulationId: string,
  withSend: boolean,
  accreditationLogo: boolean | null = null
) {
  return {
    action,
    reason: reason.trim(),
    regulationId: regulationId || undefined,
    ...(action === "approve" ? { send: withSend } : {}),
    ...(action === "approve" && accreditationLogo !== null ? { accreditationLogo } : {}),
  };
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
      error: `La conclusion ne peut pas dépasser ${formatDecimal(CONCLUSION_MAX_LENGTH, 0)} caractères (${formatDecimal(text.length, 0)} saisis).`,
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
