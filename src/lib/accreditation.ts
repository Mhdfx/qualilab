import type { AccreditationStatus } from "@/generated/prisma/enums";
import { ACCREDITATION_LOGO_ON_MIXED_REPORT } from "./lab-proposals";

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
