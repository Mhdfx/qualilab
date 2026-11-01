import type { Interpretation, SampleStatus } from "@/generated/prisma/enums";
import { normalizeLabel } from "./serie-input";

/**
 * « Récapitulatif par site » (RETOUR-LABO-28-10.md L1 — Q115 « avoir la
 * possibilité par client et par site », and the empty workbook the
 * laboratory sent the same day, §3.1). Pure: the export route reads the
 * samples with the search's filters, this builds the table.
 *
 * One row per sample, grouped by site (« Siège » for a série without one),
 * then by reception: Site · Produit · one column per parameter present —
 * in the catalogue's order, a parameter's aliases and twins of another
 * category merged into one column — · Conformité. The date and the N° de
 * contrôle are optional columns (their workbook has neither). Without a
 * client chosen, the rows are grouped by client first and a « Client »
 * column names it — the sites of two clients are never mixed.
 *
 * A value is printed only once the sample is validated (the recap may be
 * handed to the client): before, its cells stay empty and « Conformité »
 * says where it stands. Each cell holds the value, coloured by its verdict
 * (the default), or « C » / « NC » — the choice R-21 will settle. A result
 * without any verdict (no criterion) keeps its value in both modes.
 */

export type RecapMode = "valeur" | "cnc";
export const RECAP_MODES: readonly RecapMode[] = ["valeur", "cnc"];
/** The reading proposed until R-21: the value, coloured by verdict. */
export const RECAP_DEFAULT_MODE: RecapMode = "valeur";

/**
 * Who reads the values (RETOUR-LABO-28-10.md §5 L1 — owner's decision, to
 * confirm with R-21): the recap is offered with the export's roles, but the
 * export gives only each sample's conclusion while the recap's values are
 * the report's content. So only the roles that may read a report
 * (`REPORT_READ_ROLES`, checked by the route with `canReadReports`) get the
 * values; the others (réception, programmation) get C / NC and « — » where a
 * result has no verdict — never a value.
 */
export function recapAccess(canReadValues: boolean, requested: RecapMode): { mode: RecapMode; withValues: boolean } {
  return canReadValues ? { mode: requested, withValues: true } : { mode: "cnc", withValues: false };
}

/** The « Siège » of a client: the séries without a site. */
export const RECAP_SIEGE = "Siège";

export type RecapCatalogueEntry = { id: string; name: string; aliases: string | null };

export type RecapResult = {
  parameterId: string;
  value: string | null;
  conform: boolean | null;
  interpretation: Interpretation | null;
};

export type RecapSample = {
  /** Read when the recap covers several clients (`byClient`). */
  clientName?: string | null;
  siteName: string | null;
  produit: string | null;
  receptionAt: Date | null;
  controlCode: string | null;
  code: string;
  status: SampleStatus;
  /** The conclusion every screen prints (`sampleConclusion`). */
  conclusion: { label: string; tone: "ok" | "mid" | "no" | "pending" | "muted" };
  results: RecapResult[];
};

export type RecapVerdict = "C" | "NC" | null;

export type RecapCell = { text: string; verdict: RecapVerdict; acceptable: boolean };

export type RecapTable = {
  columns: { key: string; label: string }[];
  rows: {
    /** The client's name; empty unless the recap is `byClient`. */
    client: string;
    site: string;
    produit: string;
    receptionAt: Date | null;
    controlCode: string;
    cells: (RecapCell | null)[];
    conformity: string;
    tone: RecapSample["conclusion"]["tone"];
  }[];
};

const VALIDATED: readonly SampleStatus[] = ["VALIDE", "RAPPORT_ENVOYE"];

/** The verdict of one result: the criterion's, else the old conform flag. */
export function resultVerdict(result: Pick<RecapResult, "conform" | "interpretation">): RecapVerdict {
  if (result.interpretation === "NON_SATISFAISANT" || (result.interpretation === null && result.conform === false)) return "NC";
  if (result.interpretation === "SATISFAISANT" || result.interpretation === "ACCEPTABLE") return "C";
  if (result.interpretation === null && result.conform === true) return "C";
  return null;
}

/**
 * The columns of the catalogue: parameters sharing a name or an alias
 * (normalised: accents, case, punctuation) are one column, named after the
 * first in the catalogue's order. Returns parameter id → column key, and
 * each key's label and rank.
 */
export function recapColumns(catalogue: readonly RecapCatalogueEntry[]): {
  columnOf: Map<string, string>;
  columns: Map<string, { label: string; rank: number }>;
} {
  const parent = catalogue.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  catalogue.forEach((entry, index) => {
    const keys = [entry.name, ...(entry.aliases ?? "").split(/\r?\n/)].map(normalizeLabel).filter(Boolean);
    for (const key of keys) {
      const seen = owner.get(key);
      if (seen === undefined) owner.set(key, index);
      else {
        const [a, b] = [find(seen), find(index)];
        // The earlier entry stays the root: it names the column.
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  });
  const columnOf = new Map<string, string>();
  const columns = new Map<string, { label: string; rank: number }>();
  catalogue.forEach((entry, index) => {
    const root = find(index);
    const key = catalogue[root].id;
    columnOf.set(entry.id, key);
    if (!columns.has(key)) columns.set(key, { label: catalogue[root].name, rank: root });
  });
  return { columnOf, columns };
}

/** By client (when several), then « Siège » first and the sites by name; within a site, by reception. */
function compareRows(a: RecapTable["rows"][number], b: RecapTable["rows"][number]): number {
  if (a.client !== b.client) return a.client.localeCompare(b.client, "fr", { sensitivity: "base" });
  if (a.site !== b.site) {
    if (a.site === RECAP_SIEGE) return -1;
    if (b.site === RECAP_SIEGE) return 1;
    return a.site.localeCompare(b.site, "fr", { sensitivity: "base" });
  }
  return (a.receptionAt?.getTime() ?? 0) - (b.receptionAt?.getTime() ?? 0);
}

export function buildSiteRecap(
  samples: readonly RecapSample[],
  catalogue: readonly RecapCatalogueEntry[],
  mode: RecapMode = RECAP_DEFAULT_MODE,
  byClient: boolean = false,
  /** False for a role that may not read reports (`recapAccess`): C / NC, never a value. */
  withValues: boolean = true
): RecapTable {
  if (!withValues) mode = "cnc";
  const { columnOf, columns } = recapColumns(catalogue);
  const present = new Set<string>();
  for (const sample of samples) {
    if (!VALIDATED.includes(sample.status)) continue;
    for (const result of sample.results) {
      const key = columnOf.get(result.parameterId);
      if (key) present.add(key);
    }
  }
  const ordered = [...present].sort((a, b) => columns.get(a)!.rank - columns.get(b)!.rank);
  const index = new Map(ordered.map((key, i) => [key, i]));

  const rows = samples.map((sample) => {
    const cells: (RecapCell | null)[] = ordered.map(() => null);
    if (VALIDATED.includes(sample.status)) {
      const grouped = new Map<number, RecapResult[]>();
      for (const result of sample.results) {
        const key = columnOf.get(result.parameterId);
        const at = key === undefined ? undefined : index.get(key);
        if (at === undefined) continue;
        grouped.set(at, [...(grouped.get(at) ?? []), result]);
      }
      for (const [at, results] of grouped) {
        const verdicts = results.map(resultVerdict);
        const verdict: RecapVerdict = verdicts.includes("NC") ? "NC" : verdicts.some((v) => v === "C") ? "C" : null;
        const values = results.map((r) => r.value?.trim()).filter((v): v is string => Boolean(v));
        const text = mode === "cnc" && verdict ? verdict : (withValues && values.join(" / ")) || "—";
        cells[at] = { text, verdict, acceptable: verdict === "C" && results.some((r) => r.interpretation === "ACCEPTABLE") };
      }
    }
    return {
      client: byClient ? (sample.clientName ?? "") : "",
      site: sample.siteName ?? RECAP_SIEGE,
      produit: sample.produit ?? "",
      receptionAt: sample.receptionAt,
      controlCode: sample.controlCode ?? sample.code,
      cells,
      conformity: sample.conclusion.label,
      tone: sample.conclusion.tone,
    };
  });
  rows.sort(compareRows);
  return { columns: ordered.map((key) => ({ key, label: columns.get(key)!.label })), rows };
}

/** « mode=cnc » and « details=1 » of the export's query, the rest as the search reads it. */
export function parseRecapOptions(params: URLSearchParams): { mode: RecapMode; details: boolean } {
  const mode = params.get("mode");
  return { mode: mode === "cnc" ? "cnc" : RECAP_DEFAULT_MODE, details: params.get("details") === "1" };
}
