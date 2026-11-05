import type { AccreditationStatus } from "@/generated/prisma/enums";
import { ACCREDITATION_LOGO_BY_HAND, ACCREDITATION_LOGO_ON_MIXED_REPORT } from "./lab-proposals";

/**
 * The accreditation of the analyses (RETOUR-LABO-28-10.md K4 — Q14 : « Logo
 * → paramètre accrédité ; pas de logo → paramètre (analyses) non
 * accrédité(s) »). Pure, shared by /admin/parametres, its route and the report.
 *
 * Each parameter is accredited, not accredited, or subcontracted (accredited
 * or not) — the four cases of the report's legend: « * Paramètres non
 * accrédité », « SA Paramètre sous-traité accrédité », « SN Paramètre
 * sous-traité non accrédité ». Null = « à préciser »: no mark is printed and
 * the analysis never brings the logo.
 */

export const ACCREDITATION_STATUSES: readonly AccreditationStatus[] = [
  "ACCREDITE",
  "NON_ACCREDITE",
  "SOUS_TRAITE_ACCREDITE",
  "SOUS_TRAITE_NON_ACCREDITE",
];

export const ACCREDITATION_LABELS: Record<AccreditationStatus, string> = {
  ACCREDITE: "Accrédité",
  NON_ACCREDITE: "Non accrédité (*)",
  SOUS_TRAITE_ACCREDITE: "Sous-traité accrédité (SA)",
  SOUS_TRAITE_NON_ACCREDITE: "Sous-traité non accrédité (SN)",
};

/** The legend's mark printed after the analysis's name; none for an accredited one. */
export const ACCREDITATION_MARKS: Record<AccreditationStatus, string | null> = {
  ACCREDITE: null,
  NON_ACCREDITE: "*",
  SOUS_TRAITE_ACCREDITE: "(SA)",
  SOUS_TRAITE_NON_ACCREDITE: "(SN)",
};

export function isAccreditationStatus(value: unknown): value is AccreditationStatus {
  return typeof value === "string" && (ACCREDITATION_STATUSES as readonly string[]).includes(value);
}

/**
 * The status the old software's name says (« Plomb (SA) », « Vibrio … (SA) »,
 * « Levures * »): a proposal only, applied from /admin/parametres and read
 * again by the laboratory. Null when the name carries no mark — the name
 * never proves an analysis accredited.
 */
export function accreditationFromLegacyName(name: string): AccreditationStatus | null {
  const text = name.trim();
  if (/\(\s*SA\s*\)\s*\*?$/i.test(text)) return "SOUS_TRAITE_ACCREDITE";
  if (/\(\s*SN\s*\)\s*\*?$/i.test(text)) return "SOUS_TRAITE_NON_ACCREDITE";
  if (/\*\s*$/.test(text)) return "NON_ACCREDITE";
  return null;
}

/** A trailing mark of the old software in a name: « * », « (SA) », « (SN) ». */
const LEGACY_MARK = /\s*(?:\(\s*S[AN]\s*\)|\*)\s*$/i;

/** The name without the old software's trailing marks (« Chlore (SA) » → « Chlore »). */
export function nameWithoutLegacyMark(name: string): string {
  let text = name.trimEnd();
  while (LEGACY_MARK.test(text)) {
    const next = text.replace(LEGACY_MARK, "").trimEnd();
    if (!next) break; // a name made only of a mark stays as it is
    text = next;
  }
  return text;
}

/**
 * The name as the report prints it: « Levures * », « Plomb (SA) ». Once a
 * status is recorded, it alone decides the mark (ISO 17025 §7.8): a mark
 * of the old software left in the name (« Chlore (SA) ») is removed first,
 * so an analysis set « accrédité » prints « Chlore » and one set « non
 * accrédité » prints « Chlore * » — never a mark contradicting its status.
 * « À préciser » prints the name as it is.
 */
export function markedParameterName(name: string, status: AccreditationStatus | null | undefined): string {
  if (!status) return name;
  const bare = nameWithoutLegacyMark(name);
  const mark = ACCREDITATION_MARKS[status];
  return mark ? `${bare} ${mark}` : bare;
}

/**
 * The name the report's conclusion gives a parameter (K4 × J3): once its
 * status is saved, without the old software's mark — the name the tables
 * print (`markedParameterName`) minus the status's own mark, which belongs
 * to the table and its legend. No status yet: the name as typed, as the
 * tables print it too. Frozen with the conclusion (`Report.conclusion`).
 */
export function conclusionParameterName(parameter: { name: string; accreditation: AccreditationStatus | null | undefined }): string {
  return parameter.accreditation ? nameWithoutLegacyMark(parameter.name) : parameter.name;
}

/**
 * The status recorded contradicts the mark the name still carries from the
 * old software (« Chlore (SA) » set « accrédité »): /admin/parametres warns,
 * the report prints the status's mark only (`markedParameterName`).
 */
export function accreditationContradictsName(name: string, status: AccreditationStatus | null | undefined): boolean {
  if (!status) return false;
  const legacy = accreditationFromLegacyName(name);
  return legacy !== null && legacy !== status;
}

/**
 * Whether the report prints the accreditation logo: at least one analysis
 * accredited by the laboratory itself; with the switch off (a mixed report,
 * R-18), only when every analysis is accredited (its own or subcontracted).
 * A report with an analysis « à préciser » counts it as not accredited.
 */
export function reportCarriesAccreditationLogo(
  statuses: readonly (AccreditationStatus | null | undefined)[],
  mixed: boolean = ACCREDITATION_LOGO_ON_MIXED_REPORT
): boolean {
  if (!statuses.some((status) => status === "ACCREDITE")) return false;
  if (mixed) return true;
  return statuses.every((status) => status === "ACCREDITE" || status === "SOUS_TRAITE_ACCREDITE");
}

/**
 * K10 (lot 4A — Q13 of 04/11, « mettre le logo par défaut mais de laisser la
 * main pour modifier »): what the rule says about ONE report, and why.
 * `byRule`: `reportCarriesAccreditationLogo`; `addable`: the signer may
 * ADD the logo the rule leaves out — only on a report carrying at least one
 * analysis « accréditée » by the laboratory itself (ISO 17025 §7.8: never
 * the logo on a report without an accredited analysis; hypothèse, à
 * confirmer par C-4 — a subcontracted « SA » analysis does not count until
 * the laboratory says so). Removing it is always allowed. `reason` picks
 * the line under the box.
 */
export type AccreditationLogoReason =
  /** The rule prints it: at least one analysis accredited (every one, switch `ACCREDITATION_LOGO_ON_MIXED_REPORT` off). */
  | "ACCREDITED"
  /** Some analysis accredited, but the switch `ACCREDITATION_LOGO_ON_MIXED_REPORT` is off and the report is mixed. */
  | "MIXED"
  /** No analysis « accréditée », some still « à préciser » in /admin/parametres. */
  | "TO_SPECIFY"
  /** Every status recorded, none « accréditée ». */
  | "NONE_ACCREDITED";

export type AccreditationLogoRule = { byRule: boolean; addable: boolean; reason: AccreditationLogoReason };

export function accreditationLogoRule(
  statuses: readonly (AccreditationStatus | null | undefined)[],
  mixed: boolean = ACCREDITATION_LOGO_ON_MIXED_REPORT
): AccreditationLogoRule {
  const byRule = reportCarriesAccreditationLogo(statuses, mixed);
  const addable = statuses.some((status) => status === "ACCREDITE");
  const reason: AccreditationLogoReason = byRule
    ? "ACCREDITED"
    : addable
      ? "MIXED"
      : statuses.some((status) => !status)
        ? "TO_SPECIFY"
        : "NONE_ACCREDITED";
  return { byRule, addable, reason };
}

/**
 * K10: the logo of ONE version, as its administrative validation decides
 * it. `uploaded`: the file exists (and was archived) at the issue;
 * `byRule` / `addable`: `accreditationLogoRule` (`addable` absent = the
 * rule's own answer — never wider than the rule); `choice`: the box « Logo
 * d'accréditation » as the signer posted it — null when it was not shown,
 * not changed, or not posted (the rule alone), ignored while `byHand` (the
 * switch `ACCREDITATION_LOGO_BY_HAND`) is off. Without the file nothing
 * prints, whatever was ticked; a tick on a report without any accredited
 * analysis is not followed (`addable`).
 */
export type AccreditationLogoDecision = {
  /** The logo prints on this version. */
  printed: boolean;
  /** What the rule alone would have printed (the file existing). */
  byRule: boolean;
  /** The signer changed what the rule said. */
  byHand: boolean;
};

export function accreditationLogoDecision(
  input: { uploaded: boolean; byRule: boolean; addable?: boolean; choice: boolean | null },
  byHand: boolean = ACCREDITATION_LOGO_BY_HAND
): AccreditationLogoDecision {
  if (!input.uploaded) return { printed: false, byRule: false, byHand: false };
  const byRule = input.byRule;
  const addable = byRule || input.addable === true;
  const choice = byHand ? input.choice : null;
  const printed = choice === null ? byRule : choice && addable;
  return { printed, byRule, byHand: printed !== byRule };
}

/**
 * What the validation panel posts for the box (K10): null — the rule, read
 * again at the issue — while the box shows what the rule said when the page
 * loaded (untouched, or ticked back); the box's state only when the signer
 * changed it. An untouched box never freezes a stale rule as a hand choice
 * (an accredited list typed in /admin/parametres meanwhile).
 */
export function accreditationLogoPosted(rule: Pick<AccreditationLogoRule, "byRule"> | null, checked: boolean): boolean | null {
  if (!rule) return null;
  return checked === rule.byRule ? null : checked;
}

/** The box may be ticked: the rule prints the logo, or the report carries an accredited analysis (K10). */
export function accreditationLogoTickable(rule: Pick<AccreditationLogoRule, "byRule" | "addable">): boolean {
  return rule.byRule || rule.addable;
}

const LOGO_REASON_TEXT: Record<AccreditationLogoReason, string> = {
  ACCREDITED: "Par défaut, le logo s'imprime : le rapport porte au moins une analyse accréditée.",
  MIXED: "Par défaut, pas de logo : rapport mixte, le logo n'est imprimé que si toutes les analyses sont accréditées.",
  TO_SPECIFY:
    "Pas de logo : aucune analyse de ce rapport n'est marquée « accréditée » (statuts à préciser dans /admin/parametres).",
  NONE_ACCREDITED: "Pas de logo : aucune analyse de ce rapport n'est accréditée.",
};

/** The line under the box « Logo d'accréditation » (K10): the rule and its reason, and whether the hand changed it. */
export function accreditationLogoHint(rule: AccreditationLogoRule, checked: boolean): string {
  const line = LOGO_REASON_TEXT[rule.reason];
  if (!accreditationLogoTickable(rule)) return `${line} Le logo ne peut pas être ajouté à ce rapport.`;
  if (checked === rule.byRule) return `${line} Décochez ou cochez pour ce rapport seulement ; le choix est figé avec le rapport émis.`;
  return `${line} Modifié à la main pour ce rapport : le logo ${checked ? "sera imprimé" : "ne sera pas imprimé"} (choix tracé dans le journal).`;
}

/**
 * The série's box « Logo d'accréditation » (K10, « Valider la série »): one
 * choice for every report of the série — the rule report by report (the
 * default, posted as null), or the logo on every report carrying an
 * accredited analysis (never on one without: `accreditationLogoDecision`),
 * or on none.
 */
export const SERIE_LOGO_CHOICES = [
  { key: "RULE", value: null, label: "Selon la règle, rapport par rapport (par défaut) : le logo sur chaque rapport portant au moins une analyse accréditée" },
  { key: "ALL", value: true, label: "Sur chaque rapport de la série portant au moins une analyse accréditée, même mixte (jamais sur un rapport sans analyse accréditée)" },
  { key: "NONE", value: false, label: "Sur aucun rapport de la série" },
] as const satisfies readonly { key: string; value: boolean | null; label: string }[];

export type SerieLogoChoice = (typeof SERIE_LOGO_CHOICES)[number]["key"];

/** The journal's words for a decision (SAMPLE_APPROVED `accreditationLogo`). */
export function accreditationLogoJournal(decision: AccreditationLogoDecision): string {
  if (!decision.byHand) return decision.printed ? "imprimé (règle par défaut)" : "non imprimé (règle par défaut)";
  return decision.printed ? "ajouté à la main" : "retiré à la main";
}

/**
 * The choice an approval asked for (SAMPLE_APPROVED
 * `accreditationLogoRequested`, journalled even when the report failed to
 * issue), read back by the send that issues the report afterwards
 * (`sendReport`'s repair) — null when the approval left it to the rule or
 * the metadata is unreadable.
 */
export function requestedAccreditationLogo(metadata: string | null | undefined): boolean | null {
  if (!metadata) return null;
  try {
    const value = (JSON.parse(metadata) as { accreditationLogoRequested?: unknown } | null)?.accreditationLogoRequested;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

export type AccreditationUpdate = { id: string; accreditation: AccreditationStatus | null };

export type AccreditationUpdatesRead = { ok: true; value: AccreditationUpdate[] } | { ok: false; error: string };

/** At most this many parameters per save — the catalogue holds a few hundred. */
export const ACCREDITATION_BATCH_MAX = 2000;

/**
 * `{ updates: [{ id, accreditation }] }` as /admin/parametres sends it: each
 * id once, the status one of the four or null (« à préciser »).
 */
export function parseAccreditationUpdates(body: unknown): AccreditationUpdatesRead {
  const updates = (body as { updates?: unknown } | null)?.updates;
  if (!Array.isArray(updates) || updates.length === 0) return { ok: false, error: "Aucun paramètre à enregistrer." };
  if (updates.length > ACCREDITATION_BATCH_MAX) return { ok: false, error: "Trop de paramètres en une fois." };
  const seen = new Set<string>();
  const value: AccreditationUpdate[] = [];
  for (const raw of updates) {
    const entry = raw as { id?: unknown; accreditation?: unknown } | null;
    if (!entry || typeof entry.id !== "string" || !entry.id) return { ok: false, error: "Paramètre invalide." };
    if (seen.has(entry.id)) return { ok: false, error: "Un paramètre figure deux fois." };
    seen.add(entry.id);
    const status = entry.accreditation === "" || entry.accreditation === undefined ? null : entry.accreditation;
    if (status !== null && !isAccreditationStatus(status)) return { ok: false, error: "Statut d'accréditation inconnu." };
    value.push({ id: entry.id, accreditation: status });
  }
  return { ok: true, value };
}
