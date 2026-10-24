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
