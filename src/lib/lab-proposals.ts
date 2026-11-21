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
 * `ALERTS_AT_VALIDATION` R-13, `BON_WITHOUT_FAX` R-17); lot 3E those of the
 * ONSSA report (`ONSSA_OFFICIAL_CONTROL` O-6; `ONSSA_COUNT_BY` R-22, a
 * choice of two values rather than an on / off); lot 3D those of
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
 * Superseded while `COLLEAGUE_SAMPLES_HIDDEN` (lot 5A, J7 — 2.14 of 20/11,
 * « pas visible », hypothèse D-1) is on: the colleague's sample is no longer
 * reached, « Reprendre » is refused, the administrator's « Libérer » is the
 * way to hand a sample over; this switch decides again once J7 is off.
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
 * (`SEND_REPORT_ROLES`, src/lib/report-actions.ts). Turned OFF by lot 4A,
 * K8 — confirmé le 04/11 (Q9: « pas de renvoi par le commercial », « il ne
 * doit pas envoyer de rapport », « seul le validateur technique ou
 * l'administration »). OFF (now): the gestionnaire neither sends nor
 * resends (the route refuses it with a 403, its client fiche no longer
 * offers « Renvoyer »). Confirmé le 20/11 (C-6, « Oui, d'accord »: send the
 * technical validator, the Direction and the administrator — `SEND_REPORT_ROLES`
 * — never the gestionnaire commercial). On (the way back): the gestionnaire resends a
 * version already sent (V11, finalversion.md:116), as from 01/11 to lot 4A.
 */
export const COMMERCIAL_RESENDS_REPORTS = false;

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
 * the limit, the technician's choice). « Le critère c'est la limite » —
 * confirmé le 04/11 (Q6 (a), RETOUR-LABO-04-11.md §1). A sensitive germ left without any
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
 * Since lot 5A (C-1 of 20/11: « l'interprétation se fait par rapport aux
 * résultats et non pas par rapport à l'unité »), the AIR ONLY — a surface is
 * judged by its value while `SURFACE_JUDGED_WHATEVER_UNIT` is on; for the
 * air, hypothèse, à confirmer par D-4 (the air's limit, RETOUR-LABO-20-11.md
 * §8: the line of the air's limit was left empty on 20/11).
 * Off: such a criterion or limit judges the line again, as before lot 3B;
 * the unit printed stays the one of J1 / J2.
 */
export const UNIT_MISMATCH_NOT_JUDGED = true;

// ————— Lot 4A — paillasse (RETOUR-LABO-04-11.md §5) —————
// The answers of 04/11 confirm or change switches of lot 3: K7, K8 below
// (`ALERTS_AT_VALIDATION`, `COMMERCIAL_RESENDS_REPORTS` turned off), K9
// (`SAMPLING_MEANS_AIR_ONLY`), K10 (`ACCREDITATION_LOGO_BY_HAND`) and J5 here.

/**
 * Lot 4A, J5 — confirmé le 04/11 (Q8 / Q131, « Autre (une seule unité
 * au-dessus = « Non satisfaisant », avec alerte) », RETOUR-LABO-04-11.md §1
 * and the worked example C-5 in §7). ON (now): a criterion with ONE limit
 * (m alone, M alone, m = M) and n = 1 no longer tolerates c units above it —
 * one unit above is « Non satisfaisant » (so `conform = false`, and the
 * contamination alert of a germ under alert); n ≥ 2 unchanged (answer to
 * Q31 of 30/09). Confirmé le 20/11 (C-5, « Juste »: one limit at 100 and
 * n = 1, a reading of 150 is « Non satisfaisant »; m = 100 / M = 1 000 and
 * n = 1, 500 stays « Acceptable » — two limits unchanged). The criteria grid says « c sans effet quand n = 1 ». A
 * result already saved keeps its verdict until it is typed again; issued
 * reports are frozen. Off: c units above the limit are « Acceptable »
 * whatever n, as from 19/10 to lot 4A.
 */
export const SINGLE_UNIT_NO_TOLERANCE = true;

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
 * validator. Confirmé le 04/11 (Q3, « Oui » — RETOUR-LABO-04-11.md §1).
 * Off: the agreement is written at the reception, the counter or
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
 * Superseded while `SAMPLING_MEANS_AIR_ONLY` (below) is on: it then decides
 * nothing; it says again what the line reads if that switch is turned off.
 */
export const SAMPLING_MEANS_BY_KIND = true;

/**
 * Lot 4A, K9 — confirmé le 04/11 (Q14, R-27: « le moyen de prélèvement ne
 * doit s'afficher dans le rapport que dans le cas de l'air »). ON (now): the
 * line « Moyen de prélèvement » prints on an AIR report only (its method,
 * « Boîte exposée N min », « Biocollecteur »); every other report leaves it
 * out — whoever sampled, no « Écouvillon », no « N/A ». « Référence
 * prélèvement » is unchanged. Reports issued from now on only
 * (`samplingMeansText` freezes `null` in `ReportData.samplingMeans`); a
 * version issued before keeps its print. Off: the line comes back on every
 * report, as `SAMPLING_MEANS_BY_KIND` says (K6, lot 3C).
 */
export const SAMPLING_MEANS_AIR_ONLY = true;

/**
 * K4 (Q14, « Logo → paramètre accrédité » — a mixed report: R-18): the
 * accreditation logo prints on a report carrying at least one accredited
 * analysis, the non-accredited ones marked « * ». Off: only on a report
 * whose analyses are all accredited (own or subcontracted). Confirmé comme
 * défaut le 04/11 (Q13: « mettre le logo par défaut mais de laisser la main
 * pour modifier ») — the hand is `ACCREDITATION_LOGO_BY_HAND` below.
 */
export const ACCREDITATION_LOGO_ON_MIXED_REPORT = true;

/**
 * Lot 4A, K10 (Q13 of 04/11, R-18: « mettre le logo par défaut mais de
 * laisser la main pour modifier »). ON (now): the administrative validation
 * (« Valider », « Valider et envoyer », per sample and for the série) shows
 * a box « Logo d'accréditation » when the logo is uploaded, ticked as the
 * rule above says (`reportCarriesAccreditationLogo`); the signer may untick
 * it for this report, or tick it — only on a report carrying an analysis
 * « accréditée » by the laboratory (`accreditationLogoRule`, `addable`:
 * hypothèse, à confirmer par C-4). An untouched box posts nothing (the rule,
 * read again at the issue). The choice is frozen with the version issued
 * (`ReportData.accreditationLogo`, `accreditationLogoByHand`) and journalled
 * (SAMPLE_APPROVED `accreditationLogo`); an amendment starts from the rule
 * again. WHO may change it — the signer of the administrative validation
 * (Direction, administrateur) —, the tick added only on a report with an
 * accredited analysis, and « SA » (sous-traité accrédité) not counting as
 * the laboratory's own: confirmé le 20/11 (C-4, « Oui, d'accord »; the list
 * of accredited analyses is their « portée d'accréditation », still to be
 * received — D-6, then S12). Off: the box
 * leaves the screens, the routes ignore the field, the rule alone decides.
 */
export const ACCREDITATION_LOGO_BY_HAND = true;

/**
 * K3 (2.16 (c), « Non » — R-13), turned OFF by lot 4A, K7: the answer of
 * 04/11 to Q9 (RETOUR-LABO-04-11.md §1) — « Autre (alerte seulement avec
 * l'envoi du rapport) » — confirmé le 04/11. OFF (now): no validation sends
 * the contamination alerts; they leave once, with the first send of the
 * report — « Valider et envoyer », « Envoyer au client », the série's send
 * (the claim `alertsSentAt` still sends each one once). The setting
 * `alertAfterTechnicalValidation` (S2) no longer applies; /admin/reglages
 * says so under it. On (the way back): they leave at the validation the
 * settings name, as from 01/11 to the lot 4A deployment.
 */
export const ALERTS_AT_VALIDATION = false;

/**
 * I8 (Q105, one word read « Annulé » — R-17): the bon de réception no longer
 * prints the « N° de fax : » line of the client's box. Off: the line comes
 * back, empty, to be filled by hand.
 */
export const BON_WITHOUT_FAX = true;

// ————— Lot 3E — rapport mensuel ONSSA (RETOUR-LABO-28-10.md §3.2 et §5) —————
// The owner's go of 01/11 (O-6 taken as yes): built before the laboratory
// answered R-22, each rule written as an « hypothèse, à confirmer par R-22 »
// in RETOUR-LABO-28-10.md §5.

/**
 * O-6 / N1: the série carries a « Contrôle officiel » box (unticked =
 * autocontrôle), the « DR ONSSA / Organisme préleveur agréé », the
 * « Nom de l'établissement » and the « Origine » of its products — at the
 * visit, at the counter and at the reception, separate from the commercial
 * cadre (V1 of 07/10 is not undone). Printed nowhere: the ONSSA report reads
 * them. Off: the fields leave the screens, the API ignores them, nothing is
 * rewritten — and the report counts every série as an autocontrôle.
 */
export const ONSSA_OFFICIAL_CONTROL = true;

/**
 * R-22 « l'unité et la date de comptage »: which day puts a sample in a
 * month of the ONSSA report. "RECEPTION" (proposed): the day it was
 * received — the month's activity, counted once its results are validated
 * (the screen lists those still waiting). "VALIDATION": the day of its
 * administrative validation — every sample counted in the month it was
 * completed. "RECEPTION" confirmé le 04/11 (Q16, « Oui » — with
 * « Conforme / non conforme » only: an « Acceptable » counts conform,
 * RETOUR-LABO-04-11.md §1 and §4). « Acceptable » = conforme (N3,
 * `isNonConformResult`, `onssa-report.ts`): confirmé le 20/11 (C-7,
 * « Satisfaisant et acceptable = Conforme »); the analysis reports keep
 * printing « Acceptable ».
 */
export const ONSSA_COUNT_BY: "RECEPTION" | "VALIDATION" = "RECEPTION";

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
 * invoice or on the supplier). C-3 of 20/11 answered the rates (75 % of the
 * VAT with an attestation, 100 % without, supplier by supplier: a setting,
 * S13 — `scripts/lot5a-owner-steps.mts`), not the warning or the block nor
 * the attestation's duration (4 or 6 months): still open, D-3.
 */
export const PAYMENT_REQUIRES_TAX_CERTIFICATE = false;

// ————— Lot 4H — H5, la reprise des prix clients (RETOUR-LABO-04-11.md §5, §7 C-8) —————
// Built before the laboratory answered C-8; each rule written « hypothèse, à
// confirmer par C-8 » in RETOUR-LABO-04-11.md §5 « H5 — tel que construit ».

/**
 * C-8 (e): a client price of the old software equal to the old software's
 * own tariff for the analysis (PARAMETRES.PRIX, the file's « tarifAncien »)
 * is no negotiated price — 3 007 of the 3 490 non-zero prices with a tariff
 * (05/11). On (proposed): « Importer les prix clients » counts them apart
 * (« Égaux à l'ancien tarif ») and does not take them — those clients follow
 * the catalogue like any other. Off: they are taken over like the others,
 * and stay frozen at the old tariff when the catalogue changes. Confirmé le
 * 20/11 (C-8, « Oui, d'accord avec ces cinq règles » — (a) to (e), (d) the
 * equivalences « E. coli » = « Escherichia coli » and « Coliformes totaux » =
 * « Coliformes à 36 °C » for the water: aliases, S14).
 */
export const CLIENT_PRICE_SKIP_LEGACY_TARIFF = true;

/**
 * C-8 (c): two prices of the old software for the same client and analysis
 * (a site's price going to the client billed for it, two types d'analyse of
 * the same domain): on (proposed), the client's own price wins over a
 * site's, then the most recently changed; off: the most recently changed
 * only. Every conflict is listed on the import's analysis screen. Confirmé
 * le 20/11 (C-8 (c), « Oui, d'accord avec ces cinq règles »).
 */
export const CLIENT_PRICE_OWN_BEFORE_SITE = true;

// ————— Lot 5A — réponses du 20/11 (RETOUR-LABO-20-11.md §5) —————
// The owner's « execute the plan » of 21/11. ON = the answer of 20/11 (or,
// where the answer leaves a point open, the plan's default — « hypothèse, à
// confirmer par D-x », RETOUR-LABO-20-11.md §8); OFF = the behaviour before
// lot 5A. The way back of each is pinned by `lab-proposals-5a-back.test.ts`.

/**
 * Lot 5A, J6 (a) — C-1 of 20/11 (« l'interprétation se fait par rapport aux
 * résultats et non pas par rapport à l'unité »). ON (now): a SURFACE line is
 * judged by its value against its criterion or its limit WHATEVER their unit
 * — « 120 UFC/couteau » against « ≤ 100 UFC/100 cm² » is non conforme (and
 * alerts, for a germ under alert); no conversion, the numbers are compared
 * as the laboratory reads them (`unitJudges`, `result-unit.ts`). The air
 * keeps `UNIT_MISMATCH_NOT_JUDGED`. Off: a surface described in words is
 * read « sans interprétation » against a « /cm² » criterion again (lot 3B).
 */
export const SURFACE_JUDGED_WHATEVER_UNIT = true;

/**
 * Lot 5A, J6 — the n proposed for a surface described in words (review of
 * lot 5A). Hypothèse, à confirmer par D-4: C-1 says how a surface is JUDGED,
 * not how many units a single object (« couteau ») is read in. OFF (now):
 * the programme sheet proposes n as before lot 5A — a criterion whose unit
 * names an area (« UFC/cm² ») does not raise the n of a described surface
 * (`typeUnitCount`, `programme-sheet-logic.ts`), while J6 still judges the
 * reading against it: a « couteau » programmed n = 1 under an n = 5
 * criterion is read in indicative (« Non satisfaisant » above the limit,
 * and the contamination alert still leaves — indicative verdicts alert).
 * ON: the criterion's n is proposed for a described surface too (n = 5 on
 * a couteau under most « /cm² » criteria), and the sheet warns below it.
 * A surface given in cm² and the air are not concerned.
 */
export const SURFACE_DESCRIBED_N_FROM_CRITERION = false;

/**
 * Lot 5A, J6 (b) — C-1 of 20/11 (« laisser la possibilité de modifier
 * l'unité »). ON (now): on a SURFACE line counted in UFC, the bench sheet
 * offers the unit of each result — « UFC/100 cm² », « UFC/<objet> » (the
 * object prefilled from the surface's description, editable), the
 * criterion's — prefilled as computed (`resultUnit`); `PUT …/results`
 * stores the one chosen (`surfaceUnitChoice`, `result-unit.ts`) and the
 * report, the alert and the validation print it. Off: the unit is computed,
 * never chosen (a posted unit is ignored), as before lot 5A.
 */
export const SURFACE_UNIT_CHOSEN_AT_ENTRY = true;

/**
 * Lot 5A, I10 — 2.8 (Q70) of 20/11, « Autre (seulement « à vérifier ») ».
 * ON (now): C5 « Identification » answered « Non » makes the row « à
 * vérifier » (motif `IDENTIFICATION` at hand), no longer « non conforme »:
 * the sample may be accepted conform; with
 * `OBSERVATION_ONLY_DELAY_AND_TEMPERATURE` on, no observation is required for
 * it (a warning, as the DLC). The reception may still declare the sample non
 * conform by hand, motif « Identification » or « Emballage ». Off: « Non » is
 * non conforme, motif « Identification incomplète », as before lot 5A.
 */
export const IDENTIFICATION_TO_VERIFY = true;

/**
 * Lot 5A, J7 — 2.14 (Q108) of 20/11: « ceux des collègues restent visibles en
 * lecture sur la paillasse » struck out, « pas visible ». Hypothèse, à
 * confirmer par D-1 (the answer contradicts 2.13 of 28/10, `TAKE_OVER_COLLEAGUE`).
 * ON (now): a technician no longer sees a sample a colleague holds — « Pris
 * par un collègue » leaves /technicien, its sheet answers 404 like a sample
 * that does not exist, « Reprendre » is refused (403) even though
 * `TAKE_OVER_COLLEAGUE` stays on; a sample held by the sample's holder and
 * by a legacy parameter technician stays visible to each of them. The
 * take-over goes through the administrator: « Libérer » — allowed to the
 * ADMIN even on a sample that carries readings (they keep their author,
 * D-09; journal SAMPLE_UNTAKEN with how many) — puts it back in « À
 * prendre », where any technician takes it; the holder still cannot free a
 * sample once a reading is typed. Off: the colleagues' samples are listed
 * read-only with « Reprendre », and « Libérer » waits for an empty sheet, as
 * before lot 5A.
 */
export const COLLEAGUE_SAMPLES_HIDDEN = true;

/**
 * Lot 5A, J8 — Q106 of 20/11 (« par n° de série ou code d'échantillon »).
 * ON (now): « À prendre » is listed by N° de série (the série's draw, then
 * the sample's line), with a choice « N° de contrôle » (`?tri=controle`); the
 * urgent samples keep their badge but no longer lead — hypothèse, à
 * confirmer par D-2 (`bench-order.ts`). Off: the urgent first, then the
 * oldest receptions, no choice, as before lot 5A.
 */
export const TAKE_LIST_BY_NUMBER = true;

/**
 * Lot 5A, K11 — Q132 of 20/11, « Autre (corriger sans amendement : même
 * numéro, sans « annule et remplace ») ». ON (now): a validated report never
 * sent is corrected in place — « Corriger avant envoi » (the roles of
 * « Rouvrir pour amendement », a reason required): the sample goes back to
 * RESULTATS_SAISIS, both validations again, and the same version is issued
 * again — same printed number, no « Annule et remplace », no « Rapport
 * amendé »; the frozen version replaced is kept as an internal trace
 * (`ReportVersion.correctedBeforeSend`, never printed nor sent). An amendment
 * not sent yet (`-A1`) is corrected in place too and keeps its number and its
 * « Annule et remplace » of the version that left. A report already sent is
 * amended, as before. Off: every reopening is an amendment (`-A1`), as before
 * lot 5A (`report-amendment.ts`).
 */
export const UNSENT_REPORT_CORRECTED_IN_PLACE = true;
