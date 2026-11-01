import type { Interpretation, OnssaDomain } from "@/generated/prisma/enums";
import { labDayStart } from "./lab-day-range";
import { labDayOf } from "./lab-time";
import { ONSSA_COLUMNS, matchText, onssaColumn, resolveOnssaColumn, type OnssaColumnKey } from "./onssa-canevas";

/**
 * Lot 3E, N3 — the ONSSA monthly activity report (RETOUR-LABO-28-10.md
 * §3.2): the pure aggregation behind the « Rapport ONSSA » screen and its
 * Excel (`onssa-workbook.ts`). The server reads the month's samples
 * (`onssa-report-server.ts`), this counts them.
 *
 * Counting rules — hypothèses, à confirmer par R-22 (RETOUR-LABO-28-10.md §5):
 * - the samples of the month (`ONSSA_COUNT_BY`: received in it, proposed —
 *   or validated in it) whose administrative validation is signed; a
 *   cancelled sample never counts;
 * - one « analyse » = one parameter of one sample with a result (the n
 *   units of a 3-class plan count once);
 * - « NC » = the parameter's verdict « Non satisfaisant »; where no plan
 *   gave a verdict — none, or « Incomplet » — the result's « non conforme »
 *   or its indicative verdict « Non satisfaisant » (fewer units than the
 *   plan's n), as the contamination alert reads them
 *   (`raisesContaminationAlert`); « Acceptable » counts as conforme;
 * - a result is an analysis done when it holds a value, a verdict or an
 *   indicative verdict;
 * - a sample's group is its family's ONSSA group, else its type
 *   d'analyse's; a parameter's column is its ONSSA column (the method
 *   choosing among the yeasts' and moulds' columns). Only the analyses with
 *   a group AND a column are declared — the others are listed apart on the
 *   screen and in the workbook's « Notes », never silently dropped;
 * - « Contrôle officiel » / « Autocontrôle » is the série's box (N1);
 * - Feuil1's rows group the bodies, establishments and origins as typed,
 *   case, accents and spaces aside (« Local » = « local »): the first
 *   spelling met is the one shown.
 */

// ---- The month -------------------------------------------------------------

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export type OnssaMonth = {
  /** « 2026-10 ». */
  month: string;
  /** « Octobre 2026 ». */
  label: string;
  /** Midnight opening the month on the laboratory's clock, and the next month's. */
  from: Date;
  until: Date;
};

/** « 2026-10 » → the month on the laboratory's clock; null when it is not a real month. */
export function onssaMonth(value: string | null | undefined): OnssaMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  if (year < 2000 || year > 2999 || index < 0 || index > 11) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = index === 11 ? `${year + 1}-01` : `${year}-${pad(index + 2)}`;
  const from = labDayStart(`${year}-${pad(index + 1)}-01`);
  const until = labDayStart(`${next}-01`);
  if (!from || !until) return null;
  const name = MONTHS[index];
  return {
    month: `${year}-${pad(index + 1)}`,
    label: `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`,
    from,
    until,
  };
}

/** The month before the laboratory's today (the report is made at the start of the next one). */
export function previousOnssaMonth(now: Date): string {
  const [year, month] = labDayOf(now).split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

// ---- The input -------------------------------------------------------------

export type OnssaGroupRef = {
  id: string;
  name: string;
  domain: OnssaDomain;
  sortOrder: number;
  active: boolean;
};

export type OnssaResultInput = {
  parameterName: string;
  /** The parameter's ONSSA column (`AnalysisParameter.onssaColumn`). */
  parameterColumn: string | null;
  /** The norm the result was read under, else the one programmed (« NM ISO 21527-1 »). */
  normCode: string | null;
  value: string | null;
  interpretation: Interpretation | null;
  /** The indicative verdict of a result read on fewer units than the plan's n (`Result.informalInterpretation`). */
  informalInterpretation: Interpretation | null;
  conform: boolean | null;
};

export type OnssaSampleInput = {
  id: string;
  /** « 1234/26 » — the N° de contrôle, else the field code. */
  reference: string;
  clientName: string;
  siteName: string | null;
  natureLabel: string;
  familyName: string | null;
  /** The family's group, else the nature's (`onssaGroupOf`). */
  groupId: string | null;
  controleOfficiel: boolean;
  organismePreleveur: string | null;
  etablissement: string | null;
  origine: string | null;
  results: OnssaResultInput[];
};

/** The group a sample is counted in: its family's, else its type d'analyse's. */
export function onssaGroupOf(sample: {
  productType: { onssaGroupId: string | null } | null;
  nature: { onssaGroupId: string | null };
}): string | null {
  return sample.productType?.onssaGroupId ?? sample.nature.onssaGroupId ?? null;
}

/** A result is an analysis done when it holds a value, a verdict or an indicative verdict. */
export function isDoneResult(
  result: Pick<OnssaResultInput, "value" | "interpretation"> & Partial<Pick<OnssaResultInput, "informalInterpretation">>
): boolean {
  return Boolean(result.value?.trim()) || result.interpretation !== null || Boolean(result.informalInterpretation);
}

/**
 * « NC »: the verdict Non satisfaisant; without an official verdict (none,
 * or Incomplet), non conforme or the indicative verdict Non satisfaisant —
 * the contamination alert's reading (`raisesContaminationAlert`), so the
 * report never counts fewer NC than the alerts sent. Acceptable = conforme.
 * Hypothèse, à confirmer par R-22.
 */
export function isNonConformResult(
  result: Pick<OnssaResultInput, "interpretation" | "conform"> & Partial<Pick<OnssaResultInput, "informalInterpretation">>
): boolean {
  if (result.interpretation === "NON_SATISFAISANT") return true;
  if (result.interpretation === null || result.interpretation === "INCOMPLET") {
    return result.conform === false || result.informalInterpretation === "NON_SATISFAISANT";
  }
  return false;
}

// ---- The output ------------------------------------------------------------

export type OnssaCount = { realisees: number; nonConformes: number };

export type OnssaOfficialRow = {
  organisme: string;
  etablissement: string;
  origine: string;
  analyses: number;
  samples: number;
};

export type OnssaSelfRow = { origine: string; analyses: number; samples: number };

export type OnssaGroupBlock = {
  group: OnssaGroupRef;
  samples: number;
  columns: Record<OnssaColumnKey, OnssaCount>;
  total: OnssaCount;
  official: OnssaOfficialRow[];
  self: OnssaSelfRow[];
  officialAnalyses: number;
  selfAnalyses: number;
};

export type OnssaSynthesisColumn = { samples: number; analyses: number; nonConformes: number };

export type OnssaReport = {
  groups: OnssaGroupBlock[];
  columnTotals: Record<OnssaColumnKey, OnssaCount>;
  total: OnssaCount;
  /** Feuil3: microbiologie alimentaire / des eaux, chimie alimentaire. */
  synthesis: { ALIMENTAIRE: OnssaSynthesisColumn; EAU: OnssaSynthesisColumn; CHIMIE: OnssaSynthesisColumn };
  /** Samples with at least one declared analysis. */
  declaredSamples: number;
  officialAnalyses: number;
  selfAnalyses: number;
  unmapped: {
    /** Samples without a group, by type d'analyse and family. */
    samples: { label: string; samples: number; analyses: number }[];
    /** Analyses of grouped samples whose parameter has no column. */
    parameters: { name: string; analyses: number }[];
  };
};

export const NO_ORIGIN = "Non précisée";

function emptyColumns(): Record<OnssaColumnKey, OnssaCount> {
  return Object.fromEntries(ONSSA_COLUMNS.map((column) => [column.key, { realisees: 0, nonConformes: 0 }])) as Record<
    OnssaColumnKey,
    OnssaCount
  >;
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** The grouping key of a typed text: case, accents and spaces aside (« DR Onssa » = « dr ONSSA »). */
export function onssaFold(text: string): string {
  return matchText(text);
}

/** The establishment as declared: the one typed, else the client and its site. */
export function onssaEstablishment(sample: Pick<OnssaSampleInput, "etablissement" | "clientName" | "siteName">): string {
  const typed = sample.etablissement?.trim();
  if (typed) return typed;
  return sample.siteName ? `${sample.clientName} — ${sample.siteName}` : sample.clientName;
}

/**
 * The month's figures. `groups` is the administrator's list (archived
 * groups too: one still named by a family keeps its counts); every active
 * group gets its rows, even at zero — the canevas lists them all.
 */
export function buildOnssaReport(samples: OnssaSampleInput[], groups: OnssaGroupRef[]): OnssaReport {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const blocks = new Map<string, OnssaGroupBlock>();
  const blockOf = (group: OnssaGroupRef) => {
    let block = blocks.get(group.id);
    if (!block) {
      block = {
        group,
        samples: 0,
        columns: emptyColumns(),
        total: { realisees: 0, nonConformes: 0 },
        official: [],
        self: [],
        officialAnalyses: 0,
        selfAnalyses: 0,
      };
      blocks.set(group.id, block);
    }
    return block;
  };
  for (const group of groups) if (group.active) blockOf(group);

  const columnTotals = emptyColumns();
  const total: OnssaCount = { realisees: 0, nonConformes: 0 };
  const synthesis = {
    ALIMENTAIRE: { samples: 0, analyses: 0, nonConformes: 0 },
    EAU: { samples: 0, analyses: 0, nonConformes: 0 },
    CHIMIE: { samples: 0, analyses: 0, nonConformes: 0 },
  };
  const unmappedSamples = new Map<string, { label: string; samples: number; analyses: number }>();
  const unmappedParameters = new Map<string, { name: string; analyses: number }>();
  const official = new Map<string, Map<string, OnssaOfficialRow>>();
  const self = new Map<string, Map<string, OnssaSelfRow>>();
  let declaredSamples = 0;
  let officialAnalyses = 0;
  let selfAnalyses = 0;

  for (const sample of samples) {
    const done = sample.results.filter(isDoneResult);
    const group = sample.groupId ? byId.get(sample.groupId) : undefined;
    if (!group) {
      const label = sample.familyName ? `${sample.natureLabel} — ${sample.familyName}` : sample.natureLabel;
      const entry = unmappedSamples.get(label) ?? { label, samples: 0, analyses: 0 };
      entry.samples += 1;
      entry.analyses += done.length;
      unmappedSamples.set(label, entry);
      continue;
    }

    let declared = 0;
    const domains = new Set<"ALIMENTAIRE" | "EAU" | "CHIMIE">();
    const block = blockOf(group);
    for (const result of done) {
      const key = resolveOnssaColumn(result.parameterColumn, result.normCode);
      if (!key) {
        const entry = unmappedParameters.get(result.parameterName) ?? { name: result.parameterName, analyses: 0 };
        entry.analyses += 1;
        unmappedParameters.set(result.parameterName, entry);
        continue;
      }
      const nc = isNonConformResult(result) ? 1 : 0;
      declared += 1;
      for (const count of [block.columns[key], columnTotals[key], block.total, total]) {
        count.realisees += 1;
        count.nonConformes += nc;
      }
      const domain = onssaColumn(key)?.kind === "CHIMIE" ? "CHIMIE" : group.domain;
      synthesis[domain].analyses += 1;
      synthesis[domain].nonConformes += nc;
      domains.add(domain);
    }
    if (declared === 0) continue;

    declaredSamples += 1;
    block.samples += 1;
    for (const domain of domains) synthesis[domain].samples += 1;
    const origine = sample.origine?.trim() || NO_ORIGIN;
    if (sample.controleOfficiel) {
      officialAnalyses += declared;
      block.officialAnalyses += declared;
      const organisme = sample.organismePreleveur?.trim() || "Non précisé";
      const etablissement = onssaEstablishment(sample);
      const key = JSON.stringify([onssaFold(organisme), onssaFold(etablissement), onssaFold(origine)]);
      const rows = official.get(group.id) ?? new Map<string, OnssaOfficialRow>();
      const row = rows.get(key) ?? { organisme, etablissement, origine, analyses: 0, samples: 0 };
      row.analyses += declared;
      row.samples += 1;
      rows.set(key, row);
      official.set(group.id, rows);
    } else {
      selfAnalyses += declared;
      block.selfAnalyses += declared;
      const rows = self.get(group.id) ?? new Map<string, OnssaSelfRow>();
      const key = onssaFold(origine);
      const row = rows.get(key) ?? { origine, analyses: 0, samples: 0 };
      row.analyses += declared;
      row.samples += 1;
      rows.set(key, row);
      self.set(group.id, rows);
    }
  }

  const ordered = [...blocks.values()].sort(
    (a, b) => a.group.sortOrder - b.group.sortOrder || collator.compare(a.group.name, b.group.name)
  );
  for (const block of ordered) {
    block.official = [...(official.get(block.group.id)?.values() ?? [])].sort(
      (a, b) =>
        collator.compare(a.organisme, b.organisme) ||
        collator.compare(a.etablissement, b.etablissement) ||
        collator.compare(a.origine, b.origine)
    );
    block.self = [...(self.get(block.group.id)?.values() ?? [])].sort((a, b) => collator.compare(a.origine, b.origine));
  }

  return {
    groups: ordered,
    columnTotals,
    total,
    synthesis,
    declaredSamples,
    officialAnalyses,
    selfAnalyses,
    unmapped: {
      samples: [...unmappedSamples.values()].sort((a, b) => b.samples - a.samples || collator.compare(a.label, b.label)),
      parameters: [...unmappedParameters.values()].sort(
        (a, b) => b.analyses - a.analyses || collator.compare(a.name, b.name)
      ),
    },
  };
}

/** « Rapport-ONSSA-2026-10.xlsx ». */
export function onssaFileName(month: string): string {
  return `Rapport-ONSSA-${month}.xlsx`;
}
