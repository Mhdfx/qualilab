import { ALERTS_AT_VALIDATION } from "./lab-proposals";

/**
 * When the contamination alerts leave (RETOUR-LABO-28-10.md K3 — 2.16 (c);
 * settled by Q9 of 04/11, RETOUR-LABO-04-11.md K7: « alerte seulement avec
 * l'envoi du rapport »; `ALERTS_AT_VALIDATION`). Pure.
 *
 * OFF (the default since lot 4A): no validation sends them; they leave with
 * the report — « Valider et envoyer », « Envoyer au client », the série's
 * send — and each send retries one that failed (the claim `alertsSentAt`
 * sends each alert once). ON (the way back, 01/11 to lot 4A): at the
 * validation the settings name — the technical one
 * (`alertAfterTechnicalValidation`), else the administrative one (S2).
 */

/**
 * The line /admin/reglages prints under the setting « Moment d'envoi des
 * alertes de contamination » (S2) while the switch is off (K7): the setting
 * is kept, but decides nothing. Null while the switch is on.
 */
export function alertSettingNotice(atValidation: boolean = ALERTS_AT_VALIDATION): string | null {
  return atValidation
    ? null
    : "Sans effet depuis la réponse du laboratoire du 04/11 : l'alerte de contamination part seulement avec l'envoi du rapport (« Valider et envoyer », « Envoyer au client »), une seule fois. Aucune validation ne l'envoie, quel que soit ce choix ; il est conservé et reprendrait effet si cette règle était levée.";
}

/** At the technical validation (step 1). */
export function alertsAtTechnicalValidation(alertAfterTechnicalValidation: boolean, atValidation: boolean = ALERTS_AT_VALIDATION): boolean {
  return atValidation && alertAfterTechnicalValidation;
}

/** At the administrative validation (step 2): OFF (default) only with « Valider et envoyer »; ON always — the retry or the only send. */
export function alertsAtApproval(sendingReport: boolean, atValidation: boolean = ALERTS_AT_VALIDATION): boolean {
  return atValidation || sendingReport;
}

/**
 * K7 (lot 4A) — hypothèse, à confirmer (RETOUR-LABO-04-11.md §5 K7): whether
 * the alerts go on after a send of the report (« Valider et envoyer »,
 * « Envoyer au client », the série's send). The report left: yes. It could
 * not leave for lack of a report address (`noRecipients`, the client has
 * only an alert address): yes too — the alert is not held hostage by a
 * missing report address. Any other failure (the PDF, a send already under
 * way, an amendment not issued): no, the alert waits for the report — the
 * next send retries both.
 */
export function alertsFollowSend(sent: { ok: boolean; noRecipients?: boolean }): boolean {
  return sent.ok || sent.noRecipients === true;
}

/**
 * K7: what a send that could not e-mail the report (no report address) says
 * of the alerts tried anyway — appended to its refusal, per sample and in
 * the série's lines. Empty when no alert was due.
 */
export function alertsWithoutReportNote(alerts: { ok: true; sent: number } | { ok: false; error: string }): string {
  if (!alerts.ok) return `Alerte de contamination non envoyée : ${alerts.error}`;
  if (alerts.sent === 0) return "";
  return "L'alerte de contamination est partie à l'adresse d'alerte du client ; le rapport reste à envoyer.";
}

/**
 * At the administrative validation, once its send (if any) is done: switch
 * `ALERTS_AT_VALIDATION` on, always (the alerts belong to the validation);
 * off (the default), only with « Valider et envoyer » and as the send
 * allows (`alertsFollowSend`) — the same rule as « Envoyer au client ».
 */
export function alertsAfterApproval(
  sendingReport: boolean,
  sent: { ok: boolean; noRecipients?: boolean } | null,
  atValidation: boolean = ALERTS_AT_VALIDATION
): boolean {
  if (atValidation) return true;
  return sendingReport && sent !== null && alertsFollowSend(sent);
}

/**
 * K7: an approved sample whose contamination alert has not left yet — it
 * waits for the report's send (switch off). The validation list (« Validés —
 * à envoyer ») and the fiche show « Alerte en attente de l'envoi du
 * rapport »: a report handed over on paper, never e-mailed, would otherwise
 * keep its alert forever unseen. `alerting`: results that raise an alert
 * (`ALERT_RESULT_WHERE`).
 */
export function alertAwaitingReport(
  sample: { status: string; alertsSentAt: Date | string | null; alerting: number },
  atValidation: boolean = ALERTS_AT_VALIDATION
): boolean {
  return !atValidation && sample.status === "VALIDE" && sample.alertsSentAt === null && sample.alerting > 0;
}

/** The badge's words (`alertAwaitingReport`). */
export const ALERT_AWAITING_REPORT_LABEL = "Alerte en attente de l'envoi du rapport";
