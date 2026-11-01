/**
 * Our proposals of the re-ask of 18/10 (RETOUR-LABO-16-10.md §7), built
 * before the laboratory answered them — the owner's decision of 23/10,
 * exactly as « Heure de prélèvement inconnue du client »
 * (`SAMPLING_TIME_UNKNOWN.allowed`, 2.6) and the hands' state
 * (`HANDS_STATE_CHOICES`, 2.1) were.
 *
 * One switch per point, ON by default (= the proposal the laboratory read).
 * Should the laboratory answer otherwise, set its switch to `false`: the
 * screens and the API go back to the behaviour before the proposal —
 * nothing else changes, no row is rewritten. Pure constants, so the server,
 * the screens and the tests read the same value.
 */

/**
 * Re-ask 2.15 (Q55, plan C2): « aucun nom de client ni de site à l'écran du
 * technicien », like the bench sheet already (C1). The technician's bench
 * lists, their sheet and their search name neither the client nor the site
 * (nor the client's person who agreed to analyse a non-conform line), and
 * their search does not match them. Every other role still reads them.
 * Off: the technician's screens name the client again.
 */
export const BLIND_BENCH_SCREENS = true;

/**
 * Re-ask 2.13 (Q107, plan C3): any technician may « Reprendre » a sample a
 * colleague holds — one button, one confirmation, no reason to write; the
 * readings already saved stay, each with its author (D-09), and the one who
 * takes over finishes and submits. Journalled SAMPLE_TAKEN_OVER. Off: a
 * colleague's sample is read-only again (only its holder types on it).
 */
export const TAKE_OVER_COLLEAGUE = true;

/**
 * Re-ask 2.16 (Q92 « avoir les deux options », plan D3 + D4): validate a
 * whole série at once — the technical validation, then the administrative
 * one (« Valider » / « Valider et envoyer ») — and send all its validated
 * reports at once, IN ADDITION to sample by sample. Each sample goes through
 * the per-sample rules and journal (`validation-server.ts`); one not eligible
 * is listed with its reason and left untouched. Off: the série actions leave
 * /validation and their routes answer 404 — sample by sample only, as before.
 */
export const SERIES_VALIDATION = true;

// ─── Lot 3C (RETOUR-LABO-28-10.md §5) — built on 01/11 before the re-ask ────
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
