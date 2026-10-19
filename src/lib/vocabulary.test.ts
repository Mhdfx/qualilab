import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The laboratory's words on screen (16/10, Q120 — RETOUR-LABO-16-10.md F7):
 * what the screens called « Type de produit » is the laboratory's
 * « Famille de produits » (« Familles du client » in the pickers), and
 * Microbiologie / Physico-chimie / Autre is the « Domaine ». Labels only:
 * `ProductType`, `/admin/types-produits` and the `Family` enum keep their
 * names, and the family is never printed for the client (Q34).
 *
 * The old words came back easily (a new hint, a copied message), so this
 * reads every source file the screens and the API are built from, the
 * technique of programmation-guards.test.ts, and fails on the first one.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : walk(path);
    return [path];
  });
}

/** Every screen, route and helper — the tests quote the old words on purpose and are left out. */
const sources = walk(SRC)
  .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.ts$/.test(path))
  .map((path) => ({ rel: relative(SRC, path).split(sep).join("/"), source: readFileSync(path, "utf8") }));

/** The file:line of each match, so a failure names the place to change. */
function hits(pattern: RegExp, among = sources): string[] {
  return among.flatMap(({ rel, source }) =>
    source.split(/\r?\n/).flatMap((line, index) => (pattern.test(line) ? [`${rel}:${index + 1}: ${line.trim()}`] : []))
  );
}

describe("the words of the screens (Q120)", () => {
  it("reads the whole source tree", () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.some(({ rel }) => rel === "components/programmation/ProgrammeSheet.tsx")).toBe(true);
  });

  it("never says « Type de produit », « Types de produits » or « Types du client »", () => {
    expect(hits(/\btypes? de produits?\b|\btypes? du client\b/i)).toEqual([]);
  });

  it("calls Microbiologie / Physico-chimie a « domaine », never a « famille d'analyses »", () => {
    expect(hits(/\bfamilles? d(?:'|&apos;|’)analyses?\b/i)).toEqual([]);
  });

  it("never puts « Famille : » before a domain's label (the read-only sheet said « Famille : analyses microbiologiques »)", () => {
    expect(hits(/Famille\s*:\s*\$\{\s*(?:familyLabel|(?:ANALYSIS_)?FAMILY(?:_SHORT)?_LABELS)\b/)).toEqual([]);
    // The rule reads the sheet itself: its read-only hint names the domain.
    const sheet = sources.filter(({ rel }) => rel === "components/programmation/ProgrammeSheet.tsx");
    expect(hits(/`Domaine : \$\{familyLabel\}\.`/, sheet)).toHaveLength(1);
  });

  it("keeps « Autres analyses » for the AUTRE domain: the sheet's panel outside the family is « Analyses hors famille »", () => {
    const sheet = sources.filter(({ rel }) => rel === "components/programmation/ProgrammeSheet.tsx");
    expect(hits(/^\s*Autres analyses\s*$/, sheet)).toEqual([]);
    expect(hits(/^\s*Analyses hors famille\s*$/, sheet)).toHaveLength(1);
  });

  it("keeps the product family off the printed documents (Q34)", () => {
    const printed = sources.filter(({ rel }) =>
      ["lib/document-html.ts", "lib/report-html.ts", "lib/bench-sheet-html.ts", "lib/labels-html.ts"].includes(rel)
    );
    expect(printed).toHaveLength(4);
    expect(hits(/famille|productType/i, printed)).toEqual([]);
  });
});
