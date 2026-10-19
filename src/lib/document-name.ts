/**
 * « Dénomination sur les documents » (lot 1b — RETOUR-LABO-14-10.md §8,
 * RETOUR-LABO-16-10.md D5 and D6, answer Q22 of 16/10): how the report's
 * « Préleveur » and the protocol's « Prélèvement effectué par » name a
 * Qualilab technician, in the form the laboratory's former software prints —
 * « Technicien de QUALILAB 'K.NOM' »: the function, the laboratory, then the
 * initial of the first given name and the family name in capitals between
 * apostrophes. It also keeps the full name off the client's documents.
 *
 * An account may carry its own (`User.documentName`, typed in
 * /admin/utilisateurs); otherwise the default below is computed from the
 * account's name at print time — never written to the database. Pure, so
 * the report, the protocol, the admin screen and the tests read one rule.
 */

/** The function and the laboratory, before the person. */
export const DOCUMENT_NAME_PREFIX = "Technicien de QUALILAB";

/** The column's width (`VARCHAR(191)`). */
export const DOCUMENT_NAME_MAX = 191;

/**
 * The particles that belong to the family name before its last word
 * (« Karim El Nom » → « EL NOM », « Jean de La Test » → « DE LA TEST »).
 * Compared in lower case, the typographic apostrophe read as the straight
 * one.
 */
const PARTICLES = new Set([
  "de", "du", "des", "d'", "l'", "le", "la", "les",
  "van", "von", "der", "den", "da", "di", "do", "dos", "das", "del", "della",
  "el", "al", "ben", "bent", "bel", "ibn", "ait", "aït", "ould", "abou", "abu",
]);

const LOCALE = "fr-FR";

function isParticle(word: string): boolean {
  return PARTICLES.has(word.toLocaleLowerCase(LOCALE).replace(/’/g, "'"));
}

/** A word typed in capitals (« NOM »): two letters at least, no lower case. */
function isCapitalized(word: string): boolean {
  return /\p{L}.*\p{L}/u.test(word) && word === word.toLocaleUpperCase(LOCALE) && word !== word.toLocaleLowerCase(LOCALE);
}

/** « K. » for « Karim », « J.-P. » for « Jean-Pierre », « É. » for « Éric ». */
function initials(givenName: string): string {
  const parts = givenName.split("-").filter(Boolean);
  return parts
    .map((part) => {
      const letter = [...part].find((char) => /\p{L}/u.test(char)) ?? part.charAt(0);
      return `${letter.toLocaleUpperCase(LOCALE)}.`;
    })
    .join("-");
}

/**
 * The family name and the first given name of a name as typed: « Prénom(s)
 * Nom » — the family name is the last word with the particles before it —
 * or « NOM Prénom(s) », a family name typed first in capitals and followed
 * by given names that are not. Null given name for a one-word name.
 */
function splitName(words: string[]): { given: string | null; family: string[] } {
  if (words.length === 1) return { given: null, family: words };
  // « NOM Karim », « EL NOM Fatima Zahra »: the leading capitals.
  const firstLower = words.findIndex((word) => !isCapitalized(word));
  if (firstLower > 0) return { given: words[firstLower], family: words.slice(0, firstLower) };
  // « Karim El Nom »: the last word and its particles — never the first
  // word, which stays a given name (« El Mehdi Nom » → « E.NOM »).
  let start = words.length - 1;
  while (start > 1 && isParticle(words[start - 1])) start -= 1;
  return { given: words[0], family: words.slice(start) };
}

/**
 * « Technicien de QUALILAB 'K.NOM' » from « Karim Nom »: the initial of
 * the first given name (« J.-P. » for a hyphenated one), the family name in
 * capitals with its particles, accents kept (« H.NOMÈ » for « Hélène
 * Nomè »). A one-word name prints that word in capitals; an empty name, the
 * function alone.
 */
export function defaultDocumentName(fullName: string | null | undefined): string {
  const words = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DOCUMENT_NAME_PREFIX;
  const { given, family } = splitName(words);
  const person = `${given ? initials(given) : ""}${family.join(" ").toLocaleUpperCase(LOCALE)}`;
  return `${DOCUMENT_NAME_PREFIX} '${person}'`;
}

/** What the documents print for an account: its own denomination, else the default from its name. */
export function userDocumentName(user: { name: string | null | undefined; documentName?: string | null }): string {
  return user.documentName?.trim() || defaultDocumentName(user.name);
}

export type DocumentNameReading = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * The denomination sent to PATCH /api/admin/users/[id]: trimmed, its inner
 * spaces collapsed (it prints on one line), at most 191 characters; empty or
 * null = back to the default (stored null).
 */
export function readDocumentName(value: unknown): DocumentNameReading {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Dénomination sur les documents invalide." };
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length > DOCUMENT_NAME_MAX) {
    return {
      ok: false,
      error: `La dénomination sur les documents ne peut pas dépasser ${DOCUMENT_NAME_MAX} caractères.`,
    };
  }
  return { ok: true, value: clean || null };
}

/** The fields of PATCH /api/admin/users/[id] the administrator never changes on their own account. */
const SELF_LOCKED_FIELDS = ["role", "clientId", "banned", "password"] as const;

/**
 * True when a PATCH of one's own account changes the denomination alone —
 * the one field an administrator may change on their own account (a role, a
 * ban or a password there could leave the laboratory without one).
 */
export function onlyDocumentNameChange(fields: Record<string, unknown>): boolean {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(fields, key);
  return has("documentName") && SELF_LOCKED_FIELDS.every((key) => !has(key));
}
