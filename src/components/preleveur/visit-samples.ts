import type { Family } from "@/generated/prisma/enums";
import type { LineFamily } from "@/lib/nature-family";
import type { SampleTwin } from "@/lib/sample-code";

/**
 * How the préleveur's screens name the samples of a saved série
 * (RETOUR-LABO-06-10.md §5, V2 + V3) — pure, no Prisma client, so the
 * success screen and the visit page share it.
 *
 * « Échantillon N » is the line of the protocol. A line whose two families
 * were ticked became two samples under the same number (codes « …-1M » and
 * « …-1P »): they are shown together, as « Échantillon 1 · micro » and
 * « Échantillon 1 · physico-chimie ». Samples saved before V3 have one sample
 * per number and a bare code: they read exactly as before.
 */

/** The families as the préleveur's lists say them (short). */
export const FAMILY_SHORT_LABELS: Record<LineFamily, string> = {
  MICRO: "micro",
  CHIMIE: "physico-chimie",
};

/** « micro et physico-chimie », « micro », or « aucune analyse cochée ». */
export function familiesLabel(families: readonly LineFamily[]): string {
  if (families.length === 0) return "aucune analyse cochée";
  return families.map((family) => FAMILY_SHORT_LABELS[family]).join(" et ");
}

/** The twin letter of a sample code: « 1/26-3M » → « M »; null for a single
 * sample (« 1/26-3 ») or a code older than the série numbering. */
export function twinOfCode(code: string | null | undefined): SampleTwin | null {
  const match = /-\d+([MP])$/.exec(code ?? "");
  return match ? (match[1] as SampleTwin) : null;
}

type SampleLike = {
  lineNumber: number;
  code?: string | null;
  nature?: { family?: Family | null } | null;
};

/** The family a sample stands for within its line: its code's letter first,
 * otherwise its nature's family (MICRO / CHIMIE only). */
export function sampleFamily(sample: SampleLike): LineFamily | null {
  const twin = twinOfCode(sample.code);
  if (twin) return twin === "M" ? "MICRO" : "CHIMIE";
  const family = sample.nature?.family;
  return family === "MICRO" || family === "CHIMIE" ? family : null;
}

/** The samples of one protocol line; `twinned` when the line became two. */
export type SampleGroup<S> = { lineNumber: number; twinned: boolean; samples: S[] };

/**
 * The samples grouped by their number, in protocol order; within a number,
 * microbiology before physico-chemistry (as the boxes on the form).
 */
export function groupByLine<S extends SampleLike>(samples: readonly S[]): SampleGroup<S>[] {
  const byLine = new Map<number, S[]>();
  for (const sample of samples) {
    const list = byLine.get(sample.lineNumber);
    if (list) list.push(sample);
    else byLine.set(sample.lineNumber, [sample]);
  }
  const rank = (sample: S) => (sampleFamily(sample) === "CHIMIE" ? 1 : 0);
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lineNumber, list]) => ({
      lineNumber,
      twinned: list.length > 1 || list.some((sample) => twinOfCode(sample.code) !== null),
      samples: [...list].sort((a, b) => rank(a) - rank(b)),
    }));
}

/** « Échantillon 3 », or « Échantillon 3 · micro » / « Échantillon 3 ·
 * physico-chimie » for one of the two samples of a two-family line. */
export function sampleHeading(sample: SampleLike, twinned: boolean): string {
  const base = `Échantillon ${sample.lineNumber}`;
  if (!twinned) return base;
  const family = sampleFamily(sample);
  return family ? `${base} · ${FAMILY_SHORT_LABELS[family]}` : base;
}
