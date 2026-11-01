import { ALERTS_AT_VALIDATION } from "./lab-proposals";

/**
 * When the contamination alerts leave (RETOUR-LABO-28-10.md K3 — 2.16 (c)
 * « Non », to confirm by R-13; `ALERTS_AT_VALIDATION`). Pure.
 *
 * ON (the default, as before): at the validation the settings name — the
 * technical one (`alertAfterTechnicalValidation`), else the administrative
 * one (S2: the owner switches the setting off) — and again with each send of
 * the report, which retries one that failed (the claim `alertsSentAt` sends
 * each alert once). OFF: no validation sends them; they leave with the
 * report — « Valider et envoyer », « Envoyer au client ».
 */

/** At the technical validation (step 1). */
export function alertsAtTechnicalValidation(alertAfterTechnicalValidation: boolean, atValidation: boolean = ALERTS_AT_VALIDATION): boolean {
  return atValidation && alertAfterTechnicalValidation;
}

/** At the administrative validation (step 2): always ON — the retry or the only send; OFF only with « Valider et envoyer ». */
export function alertsAtApproval(sendingReport: boolean, atValidation: boolean = ALERTS_AT_VALIDATION): boolean {
  return atValidation || sendingReport;
}
