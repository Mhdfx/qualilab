/**
 * Our proposals of the re-ask of 18/10 (RETOUR-LABO-16-10.md §7), built
 * before the laboratory answered them — the owner's decision of 23/10,
 * exactly as « Heure de prélèvement inconnue du client » (2.6, replaced on
 * 01/11 by `samplingTimeRequired` in serie-input.ts after the answer of
 * 28/10) and the hands' state (`HANDS_STATE_CHOICES`, 2.1) were.
 *
 * One switch per point. A switch is ON when it carries the plan's proposal
 * (the behaviour the laboratory read, or our default while a re-ask is
 * open); set it to `false` and the screens and the API go back to the
 * behaviour before the proposal — nothing else changes, no row is
 * rewritten. One exception, OFF by default: `PAYMENT_REQUIRES_TAX_CERTIFICATE`
 * (lot 3D, M7) — the plan proposes a warning, and ON is the stricter
 * alternative (the payment blocked). Pure constants, so the server, the
 * screens and the tests read the same value.
 *
 * The answers of 28/10 (RETOUR-LABO-28-10.md §2) CONFIRMED 2.13, 2.15 and
 * 2.16 (a)(d): their switches stay ON, kept as a way back. Lot 3A (01/11)
 * adds the switches of what the laboratory has not confirmed yet, each with
 * the re-ask that will settle it (`COMMERCIAL_RESENDS_REPORTS` R-13,
 * `UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE` R-15,
 * `OBSERVATION_ONLY_DELAY_AND_TEMPERATURE` Q71 / R-28); lot 3D those of
 * Achat & Stock, last in this file.
 */

/**
 * Re-ask 2.15 (Q55, plan C2) — CONFIRMED « Oui » on 28/10: « aucun nom de
 * client ni de site à l'écran du technicien », like the bench sheet already
 * (C1). The technician's bench lists, their sheet and their search name
 * neither the client nor the site (nor the client's person who agreed to
 * analyse a non-conform line), and their search does not match them. Every other role still reads them.
 * Off: the technician's screens name the client again.
 */
export const BLIND_BENCH_SCREENS = true;

/**
 * Re-ask 2.13 (Q107, plan C3) — CONFIRMED on 28/10 (« Tout technicien
 * responsable de la tâche devra avoir l'accès à la saisie ; (2) non, il y
 * aura une seule saisie »): any technician may « Reprendre » a sample a
 * colleague holds — one button, one confirmation, no reason to write; the
 * readings already saved stay, each with its author (D-09), and the one who
 * takes over finishes and submits. Journalled SAMPLE_TAKEN_OVER. Off: a
 * colleague's sample is read-only again (only its holder types on it).
 */
export const TAKE_OVER_COLLEAGUE = true;

/**
 * Re-ask 2.16 (Q92 « avoir les deux options », plan D3 + D4) — (a) and (d)
 * CONFIRMED on 28/10 (« Oui, d'accord avec la proposition »; (b) and (c)
 * changed: `COMMERCIAL_RESENDS_REPORTS` below, and the alert setting
 * `LabSettings.alertAfterTechnicalValidation`, S2): validate a
 * whole série at once — the technical validation, then the administrative
 * one (« Valider » / « Valider et envoyer ») — and send all its validated
 * reports at once, IN ADDITION to sample by sample. Each sample goes through
 * the per-sample rules and journal (`validation-server.ts`); one not eligible
 * is listed with its reason and left untouched. Off: the série actions leave
 * /validation and their routes answer 404 — sample by sample only, as before.
 */
export const SERIES_VALIDATION = true;

// ————— Lot 3A — réception, comptoir, rapport (RETOUR-LABO-28-10.md §5) —————

/**
 * Re-ask 2.16 (b) / R-13 (b) — the answer of 28/10 struck « le gestionnaire
 * commercial » from those who SEND a report (lot 3A, K2): the first send of
 * a version is the validator's, the Direction's or the administrator's
 * (`SEND_REPORT_ROLES`, src/lib/report-actions.ts). Whether the
 * gestionnaire keeps the RESEND of a report already sent (V11,
 * finalversion.md:116) was not asked: kept by default — hypothèse, à
 * confirmer par R-13. Off: the gestionnaire neither sends nor resends (the
 * route refuses it, its client fiche no longer offers « Renvoyer »).
 */
export const COMMERCIAL_RESENDS_REPORTS = true;

/**
 * Re-ask 2.6 / R-15 — C1 of a série whose « Prélevé le » was left empty
 * (allowed since 28/10 when the client or a third party sampled — I3,
 * `samplingTimeRequired` in serie-input.ts): the delay sampling →
 * laboratory cannot be evaluated. ON (the plan's proposal, hypothèse, à
 * confirmer par R-15): C1 reads « sans objet — délai non évaluable » and no
 * « Observation de réception » is required for it. Off: C1 is « à vérifier »
 * (« Heure de prélèvement non déclarée ») and the observation is required to
 * accept the sample conform, as before 01/11.
 */
export const UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE = true;

/**
 * Q71 — « Oui, voir les critères » (answer of 28/10, lot 3A I7): the
 * « Observation de réception » is required to accept a sample conform only
 * for the doubts that matter — the temperature out of range (rule (6) and
 * C2) and the delay (C1: exceeded, or the sampling time not declared while
 * `UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE` is off). A quantity not weighed,
 * the DLC (C7) and the molluscs between 25 and 50 g are warnings only: the
 * row stays « à vérifier », its motif at hand, nothing to write. ON (our
 * reading of the answer; the « critères » of the plan — hypothèse, à
 * confirmer par R-28). Off: every « à vérifier » row needs the
 * observation again (A7, as before 01/11).
 */
export const OBSERVATION_ONLY_DELAY_AND_TEMPERATURE = true;

// ————— Lot 3D — Achat & Stock (RETOUR-LABO-28-10.md §5, M1–M8) —————

/**
 * Lot 3D, M6 (R-23 « des paiements partiels ? »): a supplier invoice may be
 * paid in several payments, each with its day, method and reference; it is
 * « Partiellement payée » until they reach the net à payer — hypothèse, à
 * confirmer par R-23. Off: a payment always settles the whole remaining
 * amount (the screen hides the amount, the route refuses another figure).
 */
export const PURCHASE_PARTIAL_PAYMENTS = true;

/**
 * Lot 3D, M7 (the NB of 28/10, R-24): a supplier invoice that no valid
 * attestation de régularité fiscale covers is WARNED about on the list, the
 * form and the payment (« avertissement ») — the payment is NOT blocked,
 * as the plan proposes; hypothèse, à confirmer par R-24. On: the payment of
 * such an invoice is refused until an attestation is recorded (on the
 * invoice or on the supplier).
 */
export const PAYMENT_REQUIRES_TAX_CERTIFICATE = false;
