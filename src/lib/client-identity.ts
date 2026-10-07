import { editDistance, tolerance } from "./similar";
import { normalizeSiteName } from "./sites-import";

/**
 * « Ce client existe peut-être déjà » (CLIENTS-FUSION.md §5) — pure, shared
 * by the client form and the server.
 *
 * The analysis of 07/10 (RETOUR-LABO-06-10.md §7) found the same company
 * recorded twice under spellings the exact-name refusal does not catch:
 * « Client Démo SARL » and « STE CLIENT DEMO », « Chaîne Test » and
 * « Chaine Tset ». Names are compared on their core — the name without its
 * legal form, articles, accents, punctuation and spaces — then with the
 * typing tolerance of `src/lib/similar.ts`; the ICE, when both records have
 * one, identifies the company whatever its spelling.
 */

/** Legal forms and the words that announce one, as `normalizeSiteName` writes them. */
const LEGAL_FORMS = new Set([
  "SA",
  "SARL",
  "SARLAU",
  "SAS",
  "SASU",
  "SNC",
  "SCS",
  "EURL",
  "STE",
  "STES",
  "SOCIETE",
  "SOCIETES",
  "CIE",
  "COMPAGNIE",
  "ETS",
  "ETABLISSEMENT",
  "ETABLISSEMENTS",
]);

/** Articles and prepositions that say nothing about the company. */
const ARTICLES = new Set(["LA", "LE", "LES", "DE", "DU", "DES", "L", "D"]);

/**
 * « S.A.R.L. » → « SARL. »: the dots between single letters are dropped so
 * that an abbreviation written with dots is read as one word.
 */
function joinAbbreviations(value: string): string {
  return value.replace(/(?<![\p{L}\p{N}])(\p{L})\.(?=\p{L}(?![\p{L}\p{N}]))/gu, "$1");
}

/**
 * The words of the name that identify the company: legal forms (« SARL »,
 * « SARL AU », « STE », « ET CIE »…) and articles removed, in order.
 */
function coreWords(name: string): string[] {
  const words = normalizeSiteName(joinAbbreviations(name)).split(" ").filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = words[i + 1];
    // « SARL AU » (associé unique) and « ET CIE » / « & CIE » go as a pair.
    if (word === "SARL" && next === "AU") {
      i += 1;
      continue;
    }
    if (word === "ET" && next === "CIE") {
      i += 1;
      continue;
    }
    if (LEGAL_FORMS.has(word) || ARTICLES.has(word)) continue;
    kept.push(word);
  }
  return kept;
}

/**
 * The name used to recognise a company under another spelling: upper case,
 * accents, punctuation, spaces, legal forms and articles removed.
 * « Société Client Démo S.A.R.L. » and « CLIENT-DEMO » give « CLIENTDEMO ».
 * A name made only of such words keeps them (« La Société » stays
 * « LASOCIETE ») rather than becoming empty.
 */
export function clientCoreName(name: string): string {
  const core = coreWords(name).join("");
  return core || normalizeSiteName(name).replace(/ /g, "");
}

/**
 * The ICE as compared: digits only. A placeholder made of zeros (an ICE the
 * old software required and nobody knew) is no ICE.
 */
export function normalIce(ice: string | null | undefined): string {
  const digits = (ice ?? "").replace(/\D/g, "");
  return /^0*$/.test(digits) ? "" : digits;
}

/**
 * The comparison the existing refusal « Un client porte déjà cette raison
 * sociale » makes in the database (case and accents ignored, MySQL
 * collation): that name is refused outright, never offered as a suggestion.
 */
export function sameClientName(a: string, b: string): boolean {
  const key = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  return key(a) === key(b);
}

export type SimilarReason = "même nom" | "même ICE" | "orthographe proche";

export type SimilarClient = { id: string; name: string; reason: SimilarReason };

export type IdentityCandidate = { id: string; name: string; ice: string | null };

/** Cores shorter than this propose nothing by spelling: « ABC » must not find « ABD ». */
const MIN_CORE_FOR_TYPOS = 4;

const RANK: Record<SimilarReason, number> = { "même ICE": 0, "même nom": 1, "orthographe proche": 2 };

/**
 * The clients that may be the one being entered, strongest reason first
 * (same ICE, same core name, then a typing error away, closest first), at
 * most `max`. `input.id` — the client being renamed — is never proposed, nor
 * is a client of exactly the same name (the hard refusal covers it).
 */
export function findSimilarClients(
  input: { id?: string | null; name: string; ice?: string | null },
  candidates: IdentityCandidate[],
  max = 5
): SimilarClient[] {
  const core = clientCoreName(input.name);
  const ice = normalIce(input.ice);
  const allowed = core.length >= MIN_CORE_FOR_TYPOS ? tolerance(core.length) : 0;
  const found = new Map<string, { candidate: IdentityCandidate; reason: SimilarReason; distance: number }>();

  for (const candidate of candidates) {
    if (candidate.id === input.id || found.has(candidate.id)) continue;
    if (!candidate.name.trim() || sameClientName(candidate.name, input.name)) continue;
    let reason: SimilarReason | null = null;
    let distance = 0;
    if (ice && normalIce(candidate.ice) === ice) {
      reason = "même ICE";
    } else if (core) {
      const other = clientCoreName(candidate.name);
      if (other === core) {
        reason = "même nom";
      } else if (allowed > 0 && other.length >= MIN_CORE_FOR_TYPOS && Math.abs(other.length - core.length) <= allowed) {
        distance = editDistance(core, other);
        if (distance <= allowed) reason = "orthographe proche";
      }
    }
    if (reason) found.set(candidate.id, { candidate, reason, distance });
  }

  return [...found.values()]
    .sort(
      (a, b) =>
        RANK[a.reason] - RANK[b.reason] ||
        a.distance - b.distance ||
        a.candidate.name.localeCompare(b.candidate.name, "fr")
    )
    .slice(0, max)
    .map(({ candidate, reason }) => ({ id: candidate.id, name: candidate.name, reason }));
}
