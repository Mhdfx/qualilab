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
 * `OBSERVATION_ONLY_DELAY_AND_TEMPERATURE` Q71 / R-30); lot 3B those of
 * the bench (`NO_CRITERION_NO_INTERPRETATION` R-28,
 * `UNIT_MISMATCH_NOT_JUDGED` R-29); lot 3C those of the reception, the
 * report and the exploitation (`CONSULTATION_AFTER_RECEPTION` R-8,
 * `SAMPLING_MEANS_BY_KIND` R-27, `ACCREDITATION_LOGO_ON_MIXED_REPORT` R-18,
 * `ALERTS_AT_VALIDATION` R-13, `BON_WITHOUT_FAX` R-17); lot 3D those of
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
 * confirmer par R-30). Off: every « à vérifier » row needs the
 * observation again (A7, as before 01/11).
 */
export const OBSERVATION_ONLY_DELAY_AND_TEMPERATURE = true;

// ————— Lot 3B — paillasse et rapport (RETOUR-LABO-28-10.md §5) —————

/**
 * Lot 3B, J3 (28/10, 2.11 : « si on n'a pas de critère, nous ne faisons pas
 * d'interprétation »). A line with neither a criterion of the sample's
 * family nor a limit in the catalogue (`AnalysisParameter.limitValue`) is
 * no longer judged: the bench asks no « Conforme / Non conforme » for it
 * (« Présence », « Indénombrable », a text), the submission no longer waits
 * for one, and the report says « Sans interprétation » in the annex and in
 * the conclusion. The catalogue's limit still counts as a criterion
 * (hypothèse, à confirmer par R-28, RETOUR-LABO-28-10.md §6 — a line with a limit
 * keeps its computed conformity and, for « Présence » or a « > x » below
 * the limit, the technician's choice). A sensitive germ left without any
 * verdict alerts on its presence (rule O-12, `contamination-alert.ts`),
 * whichever way this switch is set.
 * Off: the bench asks the technician's choice again on those lines, the
 * submission waits for it, the report prints as before.
 */
export const NO_CRITERION_NO_INTERPRETATION = true;

/**
 * Lot 3B, J1 / J2 (28/10, 2.3 and 2.17 — the laboratory answered on the
 * unit only: « UFC/couteau », « UFC/m³ », « UFC/boîte »). A criterion of the
 * family or a limit of the catalogue expressed per another basis than what
 * was sampled — « UFC/cm² » on a surface described in words (« couteau »),
 * « ufc/m3 » on an exposed plate, « ufc/boite » on a biocollecteur, « /cm² »
 * on the air — no longer judges the line: the bench, the save, the
 * submission and the programme sheet read it without them, « sans
 * interprétation » (J3), rather than against a limit it was never expressed
 * in (`unitJudges`, `result-unit.ts`). Hypothèse, à confirmer par R-29
 * (RETOUR-LABO-28-10.md §6).
 * Off: such a criterion or limit judges the line again, as before lot 3B;
 * the unit printed stays the one of J1 / J2.
 */
export const UNIT_MISMATCH_NOT_JUDGED = true;

// ————— Lot 3C — réception, rapport, exports, exploitation (RETOUR-LABO-28-10.md §5) —————
// The owner's decision of 01/11: everything is built now; what still waits
// for an answer of the laboratory (R-x) gets its switch here, ON = the
// reading the plan proposes (« hypothèse, à confirmer par R-x »).

/**
 * I6 (Q75, « Modifiable pouvant le [r]ajouter par la suite ? » — R-8): the
 * client's agreement to analyse a non-conform sample may be added or
 * corrected after the reception, until the validation, by the reception and
 * the administrator — « Accord du client » on the received série's page,
 * journalled (CLIENT_CONSULTATION_UPDATED, before → after) and shown to the
 * validator. Off: the agreement is written at the reception, the counter or
 * the release of a held sample only, as before; the route answers 404.
 */
export const CONSULTATION_AFTER_RECEPTION = true;

/**
 * K6 (Q104 (d), « 2 cas : le prélèvement effectué par nous ou par le
 * client » — R-27): « Moyen de prélèvement » on the report when the
 * laboratory sampled — « Écouvillon » (surfaces, mains), « Flacon stérile »
 * (eaux), « Sachet stérile ou emballage d'origine » (aliments), the air's
 * method as before; « N/A » when the client or a third party sampled. Reports
 * issued from now on only (`samplingMeansText`); a version issued before
 * keeps its print. Off: « N/A » outside the air, as before.
 */
export const SAMPLING_MEANS_BY_KIND = true;

/**
 * K4 (Q14, « Logo → paramètre accrédité » — a mixed report: R-18): the
 * accreditation logo prints on a report carrying at least one accredited
 * analysis, the non-accredited ones marked « * ». Off: only on a report
 * whose analyses are all accredited (own or subcontracted).
 */
export const ACCREDITATION_LOGO_ON_MIXED_REPORT = true;

/**
 * K3 (2.16 (c), « Non » — R-13): the contamination alerts leave at the
 * validation, as the settings say (`alertAfterTechnicalValidation`, S2: the
 * administrative one once the owner switches it off). Off: they no longer
 * leave at any validation, only with the report — « Valider et envoyer »,
 * « Envoyer au client » (the claim `alertsSentAt` still sends each one once).
 */
export const ALERTS_AT_VALIDATION = true;

/**
 * I8 (Q105, one word read « Annulé » — R-17): the bon de réception no longer
 * prints the « N° de fax : » line of the client's box. Off: the line comes
 * back, empty, to be filled by hand.
 */
export const BON_WITHOUT_FAX = true;

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
