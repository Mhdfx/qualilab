import { normalizeLabel } from "./serie-input";

/**
 * « Vouliez-vous dire … ? » — the corrector the laboratory asked for on
 * 29/09 (RETOUR-LABO-29-09.md, slice A). Pure, shared by the forms and the
 * server.
 *
 * Labels are compared once normalised (case, accents, punctuation, spaces:
 * `normalizeLabel`), with an edit distance that tolerates the usual typing
 * errors — a letter missing, one too many, a wrong one, two swapped. The
 * tolerance grows with the length: a short word allows one error, a long
 * designation up to three. Two genuinely different products stay apart.
 */

/** Damerau–Levenshtein distance (optimal string alignment): insertions,
 *  deletions, substitutions and adjacent transpositions each cost 1. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1);
      }
      cur.push(value);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** How many typing errors a normalised label of this length may carry. */
export function tolerance(length: number): number {
  if (length < 4) return 0;
  return Math.min(3, Math.max(1, Math.floor(length / 5)));
}

/**
 * The known labels that look like a typing error of `input`, closest first.
 * An exact match once normalised is not a suggestion (the form already
 * rewrites it to the known spelling), and a very short input proposes
 * nothing — « riz » must not become « rix ».
 */
export function similarLabels(input: string, candidates: string[], max = 3): string[] {
  const key = normalizeLabel(input);
  const allowed = tolerance(key.length);
  if (allowed === 0) return [];
  const seen = new Set<string>();
  const scored: { label: string; distance: number }[] = [];
  for (const candidate of candidates) {
    const candidateKey = normalizeLabel(candidate);
    if (!candidateKey || candidateKey === key || seen.has(candidateKey)) continue;
    seen.add(candidateKey);
    if (Math.abs(candidateKey.length - key.length) > allowed) continue;
    const distance = editDistance(key, candidateKey);
    if (distance <= allowed) scored.push({ label: candidate, distance });
  }
  return scored
    .sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label, "fr"))
    .slice(0, max)
    .map((s) => s.label);
}

/**
 * Filtering a long list as the user types (the product type picker): every
 * word typed must appear in the label, or be one typing error away from one
 * of its words.
 */
export function matchesQuery(label: string, query: string): boolean {
  const words = normalizeLabel(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const labelWords = normalizeLabel(label).split(" ").filter(Boolean);
  const whole = labelWords.join(" ");
  return words.every(
    (word) =>
      whole.includes(word) ||
      labelWords.some((lw) => {
        const allowed = tolerance(Math.max(word.length, lw.length));
        return allowed > 0 && Math.abs(lw.length - word.length) <= allowed && editDistance(word, lw) <= allowed;
      })
  );
}
