import type { Family, LimitKind, SampleStatus, SampleType } from "@/generated/prisma/enums";
import { catalogueKey } from "./billing";
import { parameterKey, parameterLabel, parseNorm } from "./criteria-import";
import { toleranceApplies } from "./criteria-input";
import type { Plan } from "./interpretation";
import { normalizeLabel } from "./serie-input";
import { similarLabels } from "./similar";

/**
 * The old software's catalogue, read from the CSV files that
 * `scripts/legacy/extract-legacy.py` writes (RETOUR-LABO-30-09.md, slice J)
 * — pure: parsing, the derivation of each criterion's plan, and the import
 * plan against a snapshot of the database (`planLegacyCatalogue`, extended
 * by the reprise of RETOUR-LABO-16-10.md F3). The route reads and writes.
 *
 * What the old base holds (TYPENOURITURE_PARAMS × INTERVAL_PETITM):
 *   TYPE_PM        1 absent · 2 non spécifiée · 3 spécifiée · 4 (rare)
 *   TYPE_RESULTAT  11 quantitatif · 12 qualitatif
 *   CLASS          3 = three-class plan, else two-class
 *   NBR            n (null on most rows — the units are the sample's)
 *   CONTROL        c
 *   intervals      one line per class: conclusion 2 (satisfaisant) up to m,
 *                  1 (acceptable) up to M, 0 (non satisfaisant) beyond;
 *                  value = MAXVAL × 10^EXP_MAX
 */

export type LegacyRegulation = { legacyId: number; title: string; text: string; active: boolean };

export type LegacyType = {
  legacyId: number;
  name: string;
  group: string;
  description: string;
  regulationLegacyId: number | null;
  /**
   * The old software's « type d'analyse » (`TYPE_NOURITURE.ECHANTILLION`,
   * column `echantillon`): matches `AnalysisNature.legacyId` — 1 micro des
   * aliments, 5 micro des surfaces, 3 micro des eaux, 30 PC des surfaces,
   * 27 analyse sensorielle… Null when empty.
   */
  natureLegacyId: number | null;
  obsolete: boolean;
  visible: boolean;
  lastUse: Date | null;
  /** Q39 default: still used since 2025, not obsolete, visible. */
  active: boolean;
};

export type LegacyCriterion = {
  legacyId: number;
  typeLegacyId: number;
  parameterName: string;
  norm: string;
  unit: string | null;
  plan: Plan | null;
  /** Why no plan could be derived (the row is listed, not imported). */
  reason: string | null;
};

export const USED_SINCE = new Date("2025-01-01T00:00:00");

type Row = Record<string, string>;

/** Rows as objects keyed by the header, headers compared case-insensitively. */
export function rowsByHeader(rows: string[][], required: string[]): { rows: Row[]; error: string | null } {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = required.filter((r) => !header.includes(r.toLowerCase()));
  if (missing.length > 0) return { rows: [], error: `Colonnes manquantes : ${missing.join(", ")}.` };
  const out = rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const o: Row = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
  return { rows: out, error: null };
}

const int = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};
const num = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** A short name for the picker, cut from the regulation's text. */
export function regulationTitle(text: string, fallback: string): string {
  // The old base often starts a text with « - » or « • ».
  const flat = text.replace(/\s+/g, " ").replace(/^[\s\-–—•·]+/, "").trim();
  if (!flat) return fallback.trim();
  const cut = flat.split(/\s[:(–—-]\s|:\s|\s\(/)[0].replace(/[\s.;,]+$/, "");
  const title = cut.length >= 8 ? cut : flat;
  return title.length > 100 ? `${title.slice(0, 97).trimEnd()}…` : title;
}

export function parseLegacyRegulations(rows: string[][]): { items: LegacyRegulation[]; skipped: number; error: string | null } {
  const { rows: data, error } = rowsByHeader(rows, ["id", "titre", "texte", "obsolete"]);
  if (error) return { items: [], skipped: 0, error };
  const items: LegacyRegulation[] = [];
  let skipped = 0;
  for (const r of data) {
    const legacyId = int(r.id);
    const text = r.texte.replace(/\s+/g, " ").replace(/^[\s\-–—•·]+/, "").trim();
    if (legacyId === null || !text) {
      skipped += 1;
      continue;
    }
    items.push({ legacyId, title: regulationTitle(text, r.titre), text, active: int(r.obsolete) !== 1 });
  }
  return { items, skipped, error: null };
}

export function parseLegacyTypes(rows: string[][], now = new Date()): { items: LegacyType[]; error: string | null } {
  const { rows: data, error } = rowsByHeader(rows, ["id", "nom", "id_critere", "echantillon", "obsolete", "visible", "derniere_utilisation"]);
  if (error) return { items: [], error };
  void now;
  const items: LegacyType[] = [];
  for (const r of data) {
    const legacyId = int(r.id);
    const name = r.nom.replace(/\s+/g, " ").trim();
    if (legacyId === null || !name) continue;
    const lastUse = r.derniere_utilisation ? new Date(r.derniere_utilisation.slice(0, 10)) : null;
    const obsolete = int(r.obsolete) !== 0;
    const visible = int(r.visible) !== 0;
    items.push({
      legacyId,
      name,
      group: r.groupe ?? "",
      description: r.famille ?? "",
      regulationLegacyId: int(r.id_critere),
      natureLegacyId: int(r.echantillon),
      obsolete,
      visible,
      lastUse: lastUse && !Number.isNaN(lastUse.getTime()) ? lastUse : null,
      active: !obsolete && visible && lastUse !== null && lastUse >= USED_SINCE,
    });
  }
  return { items, error: null };
}

/** MAXVAL × 10^EXP_MAX of an interval line, or null. */
function bound(r: Row, line: number): number | null {
  const max = num(r[`l${line}_max`]);
  if (max === null) return null;
  const exp = int(r[`l${line}_exp_max`]) ?? 0;
  return Math.round(max * 10 ** exp * 1e6) / 1e6;
}

/**
 * The plan of one legacy criterion, or the reason there is none. The old
 * software's CONTROL column is kept as c only where c means something
 * (`toleranceApplies`): on an absence test or a limitless « non spécifiée »
 * row it is dropped, so the import writes only what the grid saves back
 * (`validateCriterion`) — the verdict never read it there.
 */
export function derivePlan(r: Row): { plan: Plan | null; reason: string | null } {
  const derived = deriveRawPlan(r);
  if (!derived.plan) return derived;
  const { plan } = derived;
  return { plan: { ...plan, c: toleranceApplies(plan.mKind, plan.m !== null, plan.bigM !== null) ? plan.c : null }, reason: null };
}

function deriveRawPlan(r: Row): { plan: Plan | null; reason: string | null } {
  if (int(r.obsolete) === 1) return { plan: null, reason: "obsolète" };
  const typePm = int(r.type_pm);
  const qualitative = int(r.type_resultat) === 12;
  const nbr = int(r.nbr);
  const n = nbr !== null && nbr > 0 ? nbr : 1;
  const c = int(r.control);
  const base = { n, c };

  if (typePm === 1) return { plan: { ...base, mKind: "ABSENCE" as LimitKind, m: null, bigM: null }, reason: null };

  // The limit of each class, read from the interval lines.
  let m: number | null = null;
  let bigM: number | null = null;
  for (const line of [1, 2, 3]) {
    const concl = int(r[`l${line}_concl`]);
    const value = bound(r, line);
    if (value === null) continue;
    if (concl === 2 && m === null) m = value;
    else if (concl === 1 && bigM === null) bigM = value;
  }
  if (m === null && bigM === null) {
    const value = num(r.valeur_pm);
    if (value !== null) m = Math.round(value * 10 ** (int(r.exp_pm) ?? 0) * 1e6) / 1e6;
  }

  if (qualitative || typePm === 2) {
    // « Non spécifiée »: at most one limit, above which the result fails.
    const limit = m ?? bigM;
    return { plan: { ...base, mKind: "UNSPECIFIED", m: null, bigM: limit }, reason: null };
  }
  if (m === null && bigM === null) return { plan: null, reason: "aucune limite" };
  if (m === null) return { plan: { ...base, mKind: "UNSPECIFIED", m: null, bigM }, reason: null };
  return { plan: { ...base, mKind: "VALUE", m, bigM: bigM !== null && bigM > m ? bigM : bigM === m ? m : null }, reason: null };
}

export function parseLegacyCriteria(rows: string[][]): { items: LegacyCriterion[]; error: string | null } {
  const { rows: data, error } = rowsByHeader(rows, ["id", "id_type", "parametre", "norme", "unite", "type_pm", "type_resultat", "nbr", "control", "obsolete"]);
  if (error) return { items: [], error };
  const items: LegacyCriterion[] = [];
  for (const r of data) {
    const legacyId = int(r.id);
    const typeLegacyId = int(r.id_type);
    if (legacyId === null || typeLegacyId === null) continue;
    const parameterName = r.parametre.replace(/\s+/g, " ").trim();
    const { plan, reason } = parameterName ? derivePlan(r) : { plan: null, reason: "paramètre sans nom" };
    items.push({
      legacyId,
      typeLegacyId,
      parameterName,
      norm: r.norme,
      unit: r.unite || null,
      plan,
      reason,
    });
  }
  return { items, error: null };
}

/** The norm string of the old software, when it names a versioned norm. */
export function usableNorm(norm: string): boolean {
  const flat = norm.trim();
  return flat.length > 3 && /\d{4}/.test(flat) && !/^\(?MI\)?$/i.test(flat);
}

// ---- The import plan (RETOUR-LABO-16-10.md F3) ----------------------------------
//
// The whole « Catalogue de l'ancien logiciel » import, planned against what
// the database holds — pure, so the analysis and the validation say the same
// thing, and a second plan after a validation writes nothing. On top of slice
// J's first import (families, regulations, criteria), the reprise of 16/10:
//
//   (a) each family gets its type d'analyse (`natureId`) from the old
//       software's `echantillon`, only where it has none; its domain follows
//       the nature only where it is still the default MICRO and was never
//       changed by hand. Unknown values and families without a legacy match
//       stay « à préciser » and are listed;
//   (b) N2 / OLD31: an active criterion of a hands, surface, water or air
//       family bound to a parameter of another category is copied onto the
//       same germ in the nature's category (the parameter created when
//       missing, with the criterion's unit and the nature's domain), then the
//       old row is deactivated — never re-pointed. Collisions are skipped and
//       listed;
//   (c) Q43: a family of the September workbook without any active criterion
//       takes the old software's (the workbook wins when it says something);
//   (d) Q56 / Q129: a germ is looked up — and, when asked, created — in the
//       category and domain of its family's nature, no longer always as a
//       food microbiology parameter;
//   (e) F2 (19/10): the tolerance c an earlier import wrote where it means
//       nothing (absence tests, limitless rows) is cleared (`PlannedTidy`),
//       so every imported grid saves back as it is shown.
//
// What a person changed is never undone (« jamais sur une modification
// manuelle »): a family whose criteria grid was saved by hand
// (`CRITERIA_UPDATED`) gets no criterion of the old software unless it holds
// no criterion row at all, and one whose regulation was changed by hand
// (`PRODUCT_TYPE_UPDATED`) is not linked again — both listed. A parameter
// created here is the twin of the germ it copies (contamination alert,
// limit, threshold, factor); one that looks like an existing parameter of
// its category is listed, and the commit waits for an alias or a
// confirmation. The samples still in progress on the families whose criteria
// change are counted, by status, before anything is written.

/** The database as the planner needs it; read by the route, never written here. */
export type CatalogueNature = {
  id: string;
  code: string;
  label: string;
  legacyId: number | null;
  family: Family;
  /** The category of parameters its samples load. */
  legacyType: SampleType;
  active: boolean;
};

export type CatalogueParameter = {
  id: string;
  name: string;
  category: SampleType;
  family: Family;
  unit: string | null;
  /** Other spellings, one per line. */
  aliases: string | null;
  /** Its settings, copied onto the twin created for another category (the contamination alert first). */
  alertOnExceed: boolean;
  limitValue: number | null;
  threshold: string | null;
  calcFactor: number;
};

export type CatalogueType = {
  id: string;
  name: string;
  normalizedName: string;
  clientId: string | null;
  legacyId: number | null;
  natureId: string | null;
  family: Family;
  active: boolean;
  regulationId: string | null;
  /** The domain was changed by hand (`familyEditedByHand` over its journal). */
  familyEdited: boolean;
  /** Its criteria grid was saved by hand (`criteriaEditedByHand` over its journal). */
  criteriaEdited: boolean;
  /** Its regulation was changed by hand (`regulationEditedByHand` over its journal). */
  regulationEdited: boolean;
};

export type CatalogueCriterion = {
  id: string;
  productTypeId: string;
  parameterId: string;
  normVersionId: string | null;
  /** `normKey` of that version; null without one. */
  normKey: string | null;
  active: boolean;
  unit: string | null;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
};

/** The statuses of a sample whose criteria the bench still reads (before validation). */
export const IN_FLIGHT_STATUSES = ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as const satisfies readonly SampleStatus[];
export type InFlightStatus = (typeof IN_FLIGHT_STATUSES)[number];

export type CatalogueSnapshot = {
  natures: CatalogueNature[];
  parameters: CatalogueParameter[];
  types: CatalogueType[];
  criteria: CatalogueCriterion[];
  /** Every norm version already known, as `normKey` writes it. */
  normKeys: string[];
  /** The old software's regulations the import can link: the database's legacy ids and the file's. */
  regulationLegacyIds: number[];
  /** `catalogueKey(name, category)` of each active LabService — a parameter without one has no price. */
  pricedKeys: string[];
  /** The samples still in progress, counted per family, category and status. */
  inFlight: { productTypeId: string; type: SampleType; status: InFlightStatus; count: number }[];
};

/** What happens to one name of the old software (its duplicates included). */
export type TypeDecision =
  | { kind: "legacy-existing" | "workbook"; type: LegacyType; id: string; regulationId: string | null }
  | { kind: "create"; type: LegacyType; ref: string };

export type PlannedType = {
  /** Stands for the new row's id in the rows planned for it. */
  ref: string;
  legacyId: number;
  name: string;
  normalizedName: string;
  active: boolean;
  regulationLegacyId: number | null;
  natureId: string | null;
  family: Family;
};

export type PlannedParameter = {
  /** Stands for the new row's id in the copies and rows planned for it. */
  ref: string;
  name: string;
  aliases: string | null;
  category: SampleType;
  family: Family;
  unit: string | null;
  /** The twin's settings (`CatalogueParameter`); the defaults for a germ only the old software knows. */
  alertOnExceed: boolean;
  limitValue: number | null;
  threshold: string | null;
  calcFactor: number;
  /** An active LabService of its name and category: false = « sans prix ». */
  priced: boolean;
  /** The existing parameters of its category it looks like: an alias or a confirmation is needed. */
  similar: string[];
  /**
   * « rattachement »: the germ a hands, surface, water or air criterion moves
   * to — always created; « ancien logiciel »: a germ the catalogue does not
   * know — created only when the admin asks (`createMissing`).
   */
  reason: "rattachement" | "ancien logiciel";
  keys: string[];
};

export type NatureUpdate = {
  typeId: string;
  name: string;
  natureId: string;
  natureLabel: string;
  /** The new domain; null = unchanged. */
  family: Family | null;
  familyBefore: Family;
};

/** N2 / OLD31: a copy on the right category; `criterionId` is deactivated. */
export type PlannedCopy = {
  criterionId: string;
  productTypeId: string;
  fromParameter: string;
  parameterRef: string;
  toParameter: string;
  normVersionId: string | null;
  unit: string | null;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
};

export type PlannedNorm = { key: string; code: string; version: string; label: string };

export type PlannedRow = {
  productTypeRef: string;
  parameterRef: string;
  norm: PlannedNorm | null;
  unit: string | null;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
};

/** An existing family without a regulation, linked to the old software's. */
export type PlannedLink = { typeId: string; name: string; regulationLegacyId: number };

/**
 * A stored row whose tolerance c means nothing (`toleranceApplies`): an
 * absence test or a limitless row an earlier import wrote with the old
 * software's CONTROL column. Its c is cleared — no verdict ever read it — so
 * the grid saves back as it is shown.
 */
export type PlannedTidy = { criterionId: string; productTypeId: string };

/** One line of the journal per existing family the import changes (`LEGACY_CATALOGUE_REPRISE`). */
export type RepriseJournalEntry = {
  typeId: string;
  metadata: {
    name: string;
    natureId?: { before: null; after: string };
    family?: { before: Family; after: Family };
    /** The regulation linked: the old software's id here; the route adds the row's (`after`). */
    regulation?: { before: null; legacyId: number; after?: string };
    /** The deactivated rows, and the germ each one was copied onto. */
    rebound?: { criterionId: string; from: string; to: string }[];
    /** Criteria of the old software added (a family filled, Q43). */
    added?: number;
    /** Rows whose meaningless tolerance c was cleared (`PlannedTidy`). */
    toleranceCleared?: number;
  };
};

/** The samples in progress whose verdicts the import changes, by status. */
export type InFlightImpact = {
  /** Of the family's category: its new criteria apply from the import on, mid-bench included. */
  startJudged: number;
  /** Of another category, on the rows the import deactivates: they lose their criteria. */
  loseCriteria: number;
  byStatus: { status: InFlightStatus; startJudged: number; loseCriteria: number }[];
};

export type CataloguePlanSummary = {
  types: { total: number; distinct: number; workbook: number; legacyExisting: number; toCreate: number; inactive: number };
  criteria: {
    rows: number;
    usable: number;
    missingC: number;
    skipped: { reason: string; count: number }[];
    /** Germs the catalogue does not know in their family's category; `created` when they will be. */
    unmatchedParameters: { label: string; category: SampleType; count: number; created: boolean }[];
    unmatchedRows: number;
    /** Rows to insert, and usable rows already there (or under the same germ). */
    toInsert: number;
    alreadyPresent: number;
  };
  /** Norm versions recognised in the usable rows, and those to create. */
  norms: number;
  normsToCreate: number;
  reprise: {
    natures: {
      /** Existing families given their type d'analyse. */
      assigned: number;
      /** New families created with one. */
      created: number;
      /** Among `assigned`, those whose domain follows the nature. */
      familyChanged: number;
      unknown: { name: string; values: string }[];
      conflicts: { name: string; domain: Family; nature: string }[];
      unclassified: { name: string; active: boolean }[];
    };
    rebinding: {
      families: number;
      copies: number;
      deactivated: number;
      collisions: { family: string; parameter: string; target: string }[];
    };
    parameters: {
      name: string;
      category: SampleType;
      domain: Family;
      unit: string | null;
      reason: PlannedParameter["reason"];
      alert: boolean;
      priced: boolean;
      similar: string[];
    }[];
    /** Planned parameters that look like an existing one (`similar` not empty). */
    nearDuplicates: number;
    fill: { families: number; criteria: number };
    stillEmpty: { active: { name: string; nature: string | null; lastUse: string | null }[]; inactive: number };
    /** Existing families linked to the old software's regulation. */
    links: number;
    /** Families changed by hand that the reprise leaves alone: criteria rows not imported, regulation not linked. */
    handEdited: { id: string; name: string; criteria: number; regulation: boolean }[];
    /** Food parameters left without any active criterion once their rows are copied (D-13: to fix in /admin/parametres). */
    orphanedSources: { name: string; category: SampleType }[];
    inFlight: InFlightImpact;
    /** Stored rows whose meaningless tolerance c is cleared (`PlannedTidy`). */
    tolerances: { rows: number; families: number };
  };
};

export type CataloguePlan = {
  decisions: TypeDecision[];
  typesToCreate: PlannedType[];
  parameters: PlannedParameter[];
  natureUpdates: NatureUpdate[];
  links: PlannedLink[];
  copies: PlannedCopy[];
  tolerances: PlannedTidy[];
  rows: PlannedRow[];
  normsToCreate: PlannedNorm[];
  journal: RepriseJournalEntry[];
  summary: CataloguePlanSummary;
};

const CATEGORIES: SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

export const SKIP_WORKBOOK = "famille du classeur qui a des critères (critères de septembre conservés)";
export const SKIP_UNKNOWN_TYPE = "famille absente de types.csv";
export const SKIP_EDITED = "famille dont les critères ont été modifiés à la main (non reprise)";

/** The matching keys of a parameter: its name's, then each alias's (one per line). */
export function parameterKeys(name: string, aliases: string | null): string[] {
  const keys = [name, ...(aliases ?? "").split("\n")].map((label) => parameterKey(label).key);
  return [...new Set(keys.filter(Boolean))];
}

/** How a norm version is compared across the database and the old software. */
export function normKey(code: string, version: string): string {
  return `${code}|${version}`;
}

/** The versioned norm a criterion of the old software cites, or null. */
export function legacyNorm(norm: string): PlannedNorm | null {
  if (!usableNorm(norm)) return null;
  const parsed = parseNorm(norm);
  return parsed.version ? { key: normKey(parsed.code, parsed.version), ...parsed } : null;
}

/**
 * Whether one `PRODUCT_TYPE_UPDATED` of the journal changed the family's
 * domain — the rule « jamais sur une modification manuelle » of F3 (a). Its
 * metadata is `{ before, after }`; anything unreadable counts as a manual
 * change, so the reprise never overrides a choice it cannot see.
 */
export function familyEditedByHand(metadata: string | null): boolean {
  try {
    const parsed = JSON.parse(metadata ?? "") as { before?: { family?: unknown }; after?: { family?: unknown } } | null;
    const before = parsed?.before?.family;
    const after = parsed?.after?.family;
    return typeof before !== "string" || typeof after !== "string" || before !== after;
  } catch {
    return true;
  }
}

/**
 * Whether one `CRITERIA_UPDATED` of the journal changed the family's grid —
 * the same rule for its criteria: a save that moved, added or removed a row
 * counts; only a save readable as « nothing changed » does not.
 */
export function criteriaEditedByHand(metadata: string | null): boolean {
  try {
    const parsed = JSON.parse(metadata ?? "") as { before?: unknown; after?: unknown; changed?: unknown; removed?: unknown } | null;
    if (!parsed || !Array.isArray(parsed.changed) || !Array.isArray(parsed.removed)) return true;
    return parsed.before !== parsed.after || parsed.changed.length > 0 || parsed.removed.length > 0;
  } catch {
    return true;
  }
}

/**
 * Whether one `PRODUCT_TYPE_UPDATED` changed the family's regulation
 * (`regulationId`, slice I). An edit journalled before slice I, without that
 * key, cannot have; anything unreadable counts as a change.
 */
export function regulationEditedByHand(metadata: string | null): boolean {
  try {
    const parsed = JSON.parse(metadata ?? "") as { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
    const before = parsed?.before;
    const after = parsed?.after;
    if (!before || !after || typeof before !== "object" || typeof after !== "object") return true;
    if (!("regulationId" in after)) return false;
    return (before.regulationId ?? null) !== (after.regulationId ?? null);
  } catch {
    return true;
  }
}

/** A unit written for hands (« UFC/mains »): never the unit of a parameter shared with surfaces and air. */
const HANDS_UNIT = /mains?\b/i;

/**
 * The unit a parameter created here carries — what a sample read without a
 * family shows (the criterion's own unit wins otherwise, Q40). In water and
 * ambiance the families of one category read the same germ per hand, per
 * cm², per plate…: the unit only when every criterion that is not a hands
 * one agrees, else none. In food, slice J's rule: the most frequent.
 */
function plannedUnit(category: SampleType, units: (string | null)[]): string | null {
  if (category === "ALIMENTAIRE") return mostFrequent(units);
  const kept = [...new Set(units.filter((unit): unit is string => !!unit && !HANDS_UNIT.test(unit)))];
  return kept.length === 1 ? kept[0] : null;
}

/** A germ's key without the sample it is read on (« salmonelles surfaces » → « salmonelles »). */
const bareKey = (key: string) => key.replace(/\s+(?:des\s+|de\s+l\s+)?(?:surfaces?|mains|air|ambiance|eaux?)$/, "");

/**
 * The existing parameters of a category a planned one looks like — a near
 * spelling (`similarLabels`) or the same germ named after its sample
 * (« Salmonelles » next to « Salmonelles surfaces »). Created as is, it would
 * stand beside it: no price, no alert, the same germ analysed twice.
 */
function lookalikes(planned: { name: string; keys: string[] }, candidates: { name: string; keys: string[] }[]): string[] {
  const bare = new Set(planned.keys.map(bareKey));
  const found: string[] = [];
  for (const candidate of candidates) {
    const labels = candidate.keys;
    const near =
      labels.some((key) => bare.has(bareKey(key))) ||
      planned.keys.some((key) => similarLabels(key, labels, 1).length > 0);
    if (near && !found.includes(candidate.name)) found.push(candidate.name);
  }
  return found.sort((a, b) => a.localeCompare(b, "fr"));
}

/** The most frequent value (the earliest on a tie), or null. */
function mostFrequent(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let max = 0;
  for (const [value, count] of counts) {
    if (count > max) {
      best = value;
      max = count;
    }
  }
  return best;
}

const lastUseTime = (t: LegacyType) => t.lastUse?.getTime() ?? 0;
const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

type PlannedParameterDraft = PlannedParameter & { units: (string | null)[] };
type Resolution = { ref: string; name: string; keys: string[]; planned: PlannedParameterDraft | null };

/**
 * Where a germ goes in a category: a parameter of the catalogue (its name,
 * then its aliases; the nature's domain first), one already planned, or —
 * when allowed — a new one. A germ the catalogue knows under another
 * category is created as its twin (same name, same spellings), so every
 * family of the category shares one parameter per germ.
 */
class ParameterResolver {
  private readonly keysOf: Map<string, string[]>;
  private readonly byCategory = new Map<SampleType, Map<string, CatalogueParameter[]>>(CATEGORIES.map((c) => [c, new Map()]));
  private readonly planned = new Map<SampleType, Map<string, PlannedParameterDraft>>(CATEGORIES.map((c) => [c, new Map()]));
  readonly created: PlannedParameterDraft[] = [];

  constructor(parameters: CatalogueParameter[]) {
    this.keysOf = new Map(parameters.map((p) => [p.id, parameterKeys(p.name, p.aliases)]));
    // Names before aliases: a germ named « Levures » wins over another's alias.
    for (const aliases of [false, true]) {
      for (const p of parameters) {
        const keys = this.keysOf.get(p.id)!;
        const index = this.byCategory.get(p.category)!;
        for (const key of aliases ? keys.slice(1) : keys.slice(0, 1)) {
          const list = index.get(key) ?? [];
          if (!list.includes(p)) list.push(p);
          index.set(key, list);
        }
      }
    }
  }

  keys(parameterId: string): string[] {
    return this.keysOf.get(parameterId) ?? [];
  }

  private existing(category: SampleType, family: Family, keys: string[]): CatalogueParameter | null {
    for (const key of keys) {
      const list = this.byCategory.get(category)!.get(key);
      if (list && list.length > 0) return list.find((p) => p.family === family) ?? list[0];
    }
    return null;
  }

  private lookup(category: SampleType, family: Family, keys: string[], unit: string | null): Resolution | null {
    const found = this.existing(category, family, keys);
    if (found) return { ref: found.id, name: found.name, keys: this.keys(found.id), planned: null };
    for (const key of keys) {
      const p = this.planned.get(category)!.get(key);
      if (p) {
        p.units.push(unit);
        return { ref: p.ref, name: p.name, keys: p.keys, planned: p };
      }
    }
    return null;
  }

  resolve(
    category: SampleType | null,
    family: Family,
    from: { source: CatalogueParameter } | { label: string },
    create: { allowed: boolean; unit: string | null; reason: PlannedParameter["reason"] }
  ): Resolution | null {
    let source = "source" in from ? from.source : null;
    const label = "label" in from ? from.label : "";
    let keys = source ? this.keys(source.id) : [parameterKey(label).key].filter(Boolean);
    if (keys.length === 0) return null;
    if (category === null) {
      // No type d'analyse: slice J's rule, food first, created as food micro.
      for (const c of CATEGORIES) {
        const found = this.existing(c, "MICRO", keys);
        if (found) return { ref: found.id, name: found.name, keys: this.keys(found.id), planned: null };
      }
      category = "ALIMENTAIRE";
      family = "MICRO";
    }
    const hit = this.lookup(category, family, keys, create.unit);
    if (hit) return hit;
    if (!source) {
      for (const c of CATEGORIES) {
        if (c === category) continue;
        const twin = this.existing(c, family, keys);
        if (!twin) continue;
        source = twin;
        keys = [...new Set([...this.keys(twin.id), ...keys])];
        const again = this.lookup(category, family, keys, create.unit);
        if (again) return again;
        break;
      }
    }
    if (!create.allowed) return null;
    // The twin carries the germ's settings: without its alert a positive
    // Salmonella on a surface would raise none (contamination-alert.ts).
    const p: PlannedParameterDraft = {
      ref: `nouveau-parametre:${category}:${keys[0]}`,
      name: source ? source.name : parameterLabel(label) || label.trim(),
      aliases: source ? source.aliases : null,
      category,
      family,
      unit: null,
      alertOnExceed: source?.alertOnExceed ?? false,
      limitValue: source?.limitValue ?? null,
      threshold: source?.threshold ?? null,
      calcFactor: source?.calcFactor ?? 1,
      priced: false,
      similar: [],
      reason: create.reason,
      keys,
      units: [create.unit],
    };
    const index = this.planned.get(category)!;
    for (const key of keys) if (!index.has(key)) index.set(key, p);
    this.created.push(p);
    return { ref: p.ref, name: p.name, keys: p.keys, planned: p };
  }
}

export function planLegacyCatalogue(input: {
  legacyTypes: LegacyType[];
  legacyCriteria: LegacyCriterion[];
  snapshot: CatalogueSnapshot;
  createMissing: boolean;
}): CataloguePlan {
  const { legacyTypes, legacyCriteria, snapshot, createMissing } = input;
  const resolver = new ParameterResolver(snapshot.parameters);
  const natureById = new Map(snapshot.natures.map((n) => [n.id, n]));
  const natureByLegacy = new Map(snapshot.natures.filter((n) => n.active && n.legacyId !== null).map((n) => [n.legacyId!, n]));
  const parameterById = new Map(snapshot.parameters.map((p) => [p.id, p]));
  const typeById = new Map(snapshot.types.map((t) => [t.id, t]));
  const typeByLegacy = new Map(snapshot.types.filter((t) => t.legacyId !== null).map((t) => [t.legacyId!, t]));
  const commonByName = new Map<string, CatalogueType>();
  for (const t of snapshot.types) if (t.clientId === null && !commonByName.has(t.normalizedName)) commonByName.set(t.normalizedName, t);
  const types = [...snapshot.types].sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));

  // ---- the families: one decision per name of the old software --------------
  // One group per name, the most recently used first (it names the family).
  const groups = new Map<string, LegacyType[]>();
  for (const t of [...legacyTypes].sort((a, b) => lastUseTime(b) - lastUseTime(a))) {
    const key = normalizeLabel(t.name);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const natureOfGroup = (group: LegacyType[]): CatalogueNature | null => {
    for (const t of group) {
      const nature = t.natureLegacyId !== null ? natureByLegacy.get(t.natureLegacyId) : undefined;
      if (nature) return nature;
    }
    return null;
  };

  const decisions: TypeDecision[] = [];
  const typesToCreate: PlannedType[] = [];
  const legacyIdToRef = new Map<number, string>();
  /** The old software's types behind each family (database id or planned ref). */
  const legacyOf = new Map<string, LegacyType[]>();
  const kindOf = new Map<string, TypeDecision["kind"]>();
  for (const [name, group] of groups) {
    const winner = group[0];
    const byLegacy = group.map((t) => typeByLegacy.get(t.legacyId)).find((t) => t !== undefined);
    const existing = byLegacy ?? commonByName.get(name);
    let ref: string;
    if (existing) {
      ref = existing.id;
      const kind = byLegacy ? "legacy-existing" : "workbook";
      decisions.push({ kind, type: winner, id: existing.id, regulationId: existing.regulationId });
      if (kindOf.get(ref) !== "legacy-existing") kindOf.set(ref, kind);
    } else {
      ref = `nouvelle-famille:${winner.legacyId}`;
      const nature = natureOfGroup(group);
      decisions.push({ kind: "create", type: winner, ref });
      kindOf.set(ref, "create");
      typesToCreate.push({
        ref,
        legacyId: winner.legacyId,
        name: winner.name,
        normalizedName: name,
        active: winner.active,
        regulationLegacyId: winner.regulationLegacyId,
        natureId: nature?.id ?? null,
        family: nature?.family ?? "MICRO",
      });
    }
    for (const t of group) legacyIdToRef.set(t.legacyId, ref);
    legacyOf.set(ref, [...(legacyOf.get(ref) ?? []), ...group]);
  }

  // ---- (a) the type d'analyse of each family -----------------------------------
  const natureOf = new Map<string, CatalogueNature | null>();
  const natureUpdates: NatureUpdate[] = [];
  const natures: CataloguePlanSummary["reprise"]["natures"] = { assigned: 0, created: 0, familyChanged: 0, unknown: [], conflicts: [], unclassified: [] };
  const unknownValues = (group: LegacyType[]) =>
    [...new Set(group.map((g) => (g.natureLegacyId === null ? "vide" : String(g.natureLegacyId))))].join(", ");
  for (const p of typesToCreate) {
    natureOf.set(p.ref, p.natureId ? natureById.get(p.natureId) ?? null : null);
    if (!p.natureId) natures.unknown.push({ name: p.name, values: unknownValues(legacyOf.get(p.ref) ?? []) });
  }
  for (const t of types) {
    if (t.natureId !== null) {
      natureOf.set(t.id, natureById.get(t.natureId) ?? null);
      continue;
    }
    natureOf.set(t.id, null);
    const group = legacyOf.get(t.id);
    if (!group) {
      natures.unclassified.push({ name: t.name, active: t.active });
      continue;
    }
    const nature = natureOfGroup(group);
    if (!nature) {
      natures.unknown.push({ name: t.name, values: unknownValues(group) });
      continue;
    }
    const follows = t.family === nature.family;
    if (!follows && (t.family !== "MICRO" || t.familyEdited)) {
      // A domain chosen by hand that disagrees: the family stays « à préciser »
      // rather than carry the nature of another domain.
      natures.conflicts.push({ name: t.name, domain: t.family, nature: nature.label });
      continue;
    }
    natureUpdates.push({ typeId: t.id, name: t.name, natureId: nature.id, natureLabel: nature.label, family: follows ? null : nature.family, familyBefore: t.family });
    natureOf.set(t.id, nature);
  }

  // ---- (b) N2 / OLD31: criteria bound to another category's parameter -------
  const criteriaOf = new Map<string, CatalogueCriterion[]>();
  for (const c of [...snapshot.criteria].sort((a, b) => a.id.localeCompare(b.id))) {
    criteriaOf.set(c.productTypeId, [...(criteriaOf.get(c.productTypeId) ?? []), c]);
  }
  const rowKey = (typeRef: string, parameterRef: string, norm: string | null) => `${typeRef}|${parameterRef}|${norm ?? ""}`;
  /** Every (family, parameter, norm version) held or planned, active or not. */
  const taken = new Set(snapshot.criteria.map((c) => rowKey(c.productTypeId, c.parameterId, c.normKey)));
  const copies: PlannedCopy[] = [];
  const collisions: CataloguePlanSummary["reprise"]["rebinding"]["collisions"] = [];
  const reboundFamilies = new Set<string>();
  /** Per family, the categories whose samples gain criteria, and those whose rows the import deactivates. */
  const judgedCategories = new Map<string, Set<SampleType>>();
  const lostCategories = new Map<string, Set<SampleType>>();
  const mark = (index: Map<string, Set<SampleType>>, typeId: string, category: SampleType) =>
    index.set(typeId, (index.get(typeId) ?? new Set<SampleType>()).add(category));
  for (const t of types) {
    const nature = natureOf.get(t.id);
    if (!nature || nature.legacyType === "ALIMENTAIRE") continue;
    for (const criterion of criteriaOf.get(t.id) ?? []) {
      const parameter = parameterById.get(criterion.parameterId);
      if (!criterion.active || !parameter || parameter.category === nature.legacyType) continue;
      const target = resolver.resolve(nature.legacyType, nature.family, { source: parameter }, {
        allowed: true,
        unit: criterion.unit ?? parameter.unit,
        reason: "rattachement",
      })!;
      const key = rowKey(t.id, target.ref, criterion.normKey);
      if (taken.has(key)) {
        collisions.push({ family: t.name, parameter: parameter.name, target: target.name });
        continue;
      }
      taken.add(key);
      reboundFamilies.add(t.id);
      mark(judgedCategories, t.id, nature.legacyType);
      mark(lostCategories, t.id, parameter.category);
      copies.push({
        criterionId: criterion.id,
        productTypeId: t.id,
        fromParameter: parameter.name,
        parameterRef: target.ref,
        toParameter: target.name,
        normVersionId: criterion.normVersionId,
        unit: criterion.unit,
        n: criterion.n,
        // A c an earlier import left where it means nothing is not copied.
        c: toleranceApplies(criterion.mKind, criterion.m !== null, criterion.bigM !== null) ? criterion.c : null,
        mKind: criterion.mKind,
        m: criterion.m,
        bigM: criterion.bigM,
      });
    }
  }

  // ---- (c) + slice J: the old software's criteria ---------------------------
  const activeCount = new Map<string, number>();
  const rowCount = new Map<string, number>();
  /** The germs (every key of their parameter) × norm version each family holds. */
  const germs = new Map<string, Set<string>>();
  for (const c of snapshot.criteria) {
    if (c.active) activeCount.set(c.productTypeId, (activeCount.get(c.productTypeId) ?? 0) + 1);
    rowCount.set(c.productTypeId, (rowCount.get(c.productTypeId) ?? 0) + 1);
    const set = germs.get(c.productTypeId) ?? new Set<string>();
    for (const key of resolver.keys(c.parameterId)) set.add(`${key}|${c.normKey ?? ""}`);
    germs.set(c.productTypeId, set);
  }
  // A grid saved by hand is the laboratory's word: its rows deleted, re-pointed
  // or deactivated by hand (the PUT deletes for good, so the dedupe below
  // cannot see them) never come back, and no germ is created for it — the
  // family is filled only when it holds no criterion row at all, active or not.
  const editedByHand = (ref: string) => typeById.get(ref)?.criteriaEdited === true && (rowCount.get(ref) ?? 0) > 0;
  // A family the old software alone knows takes all its criteria; a family of
  // the September workbook only when it has no active one (Q39, refined by Q43).
  const owned = (ref: string) => kindOf.get(ref) !== "workbook" || (activeCount.get(ref) ?? 0) === 0;
  /** Per family changed by hand, the old software's rows left out. */
  const leftOut = new Map<string, number>();

  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const unmatched = new Map<string, CataloguePlanSummary["criteria"]["unmatchedParameters"][number]>();
  const drafts: { row: PlannedRow; target: Resolution }[] = [];
  const usableNorms = new Set<string>();
  let usable = 0;
  let missingC = 0;
  let alreadyPresent = 0;
  for (const c of legacyCriteria) {
    const ref = legacyIdToRef.get(c.typeLegacyId);
    if (!ref) {
      skip(SKIP_UNKNOWN_TYPE);
      continue;
    }
    if (!owned(ref)) {
      skip(SKIP_WORKBOOK);
      continue;
    }
    if (!c.plan) {
      skip(c.reason ?? "?");
      continue;
    }
    const edited = editedByHand(ref);
    const nature = natureOf.get(ref) ?? null;
    const germ = parameterKey(c.parameterName).key;
    // Nothing is created for a family changed by hand: its rows stay out.
    const target = resolver.resolve(nature?.legacyType ?? null, nature?.family ?? "MICRO", { label: c.parameterName }, {
      allowed: createMissing && !edited,
      unit: c.unit,
      reason: "ancien logiciel",
    });
    const norm = legacyNorm(c.norm);
    // Already there — under this parameter, or under the same germ of another
    // category, imported before 16/10 (its copy is planned in (b)).
    const held = germs.get(ref);
    const present = !!held && [...(target?.keys ?? []), germ].some((key) => held.has(`${key}|${norm?.key ?? ""}`));
    if (edited && !present) {
      skip(SKIP_EDITED);
      leftOut.set(ref, (leftOut.get(ref) ?? 0) + 1);
      continue;
    }
    if (!target || target.planned?.reason === "ancien logiciel") {
      const category = target?.planned?.category ?? nature?.legacyType ?? "ALIMENTAIRE";
      const entry = unmatched.get(`${category}|${germ}`) ?? { label: c.parameterName, category, count: 0, created: target !== null };
      entry.count += 1;
      unmatched.set(`${category}|${germ}`, entry);
    }
    if (!target) continue;
    usable += 1;
    if (c.plan.mKind === "VALUE" && c.plan.bigM !== null && c.plan.bigM > (c.plan.m ?? 0) && c.plan.c === null) missingC += 1;
    if (norm) usableNorms.add(norm.key);
    if (present) {
      alreadyPresent += 1;
      continue;
    }
    const key = rowKey(ref, target.ref, norm?.key ?? null);
    if (taken.has(key)) continue;
    taken.add(key);
    drafts.push({
      row: { productTypeRef: ref, parameterRef: target.ref, norm, unit: c.unit, n: c.plan.n, c: c.plan.c, mKind: c.plan.mKind, m: c.plan.m, bigM: c.plan.bigM },
      target,
    });
  }

  // ---- what is created, and what stays empty ----------------------------------
  // A new parameter takes its criteria's unit (`plannedUnit`), its twin's
  // settings, and is checked against the parameters of its category.
  const priced = new Set(snapshot.pricedKeys);
  const candidatesOf = new Map<SampleType, { name: string; keys: string[] }[]>(CATEGORIES.map((c) => [c, []]));
  for (const p of snapshot.parameters) candidatesOf.get(p.category)!.push({ name: p.name, keys: resolver.keys(p.id) });
  for (const p of resolver.created) {
    p.unit = plannedUnit(p.category, p.units);
    p.priced = priced.has(catalogueKey(p.name, p.category));
    p.similar = lookalikes(p, candidatesOf.get(p.category)!);
  }
  const parameters: PlannedParameter[] = resolver.created.map((p) => ({
    ref: p.ref,
    name: p.name,
    aliases: p.aliases,
    category: p.category,
    family: p.family,
    unit: p.unit,
    alertOnExceed: p.alertOnExceed,
    limitValue: p.limitValue,
    threshold: p.threshold,
    calcFactor: p.calcFactor,
    priced: p.priced,
    similar: p.similar,
    reason: p.reason,
    keys: p.keys,
  }));
  // A row without its own unit takes its parameter's, as slice J did.
  const rows: PlannedRow[] = drafts.map(({ row, target }) => ({
    ...row,
    unit: row.unit ?? (target.planned ? target.planned.unit : parameterById.get(target.ref)?.unit ?? null),
  }));
  for (const { row, target } of drafts) {
    const category = target.planned?.category ?? parameterById.get(target.ref)?.category;
    if (category && typeById.has(row.productTypeRef)) mark(judgedCategories, row.productTypeRef, category);
  }

  const knownNorms = new Set(snapshot.normKeys);
  const normsToCreate = new Map<string, PlannedNorm>();
  for (const row of rows) if (row.norm && !knownNorms.has(row.norm.key)) normsToCreate.set(row.norm.key, row.norm);

  const added = new Map<string, number>();
  for (const row of rows) added.set(row.productTypeRef, (added.get(row.productTypeRef) ?? 0) + 1);
  const fill = { families: 0, criteria: 0 };
  const stillEmpty: CataloguePlanSummary["reprise"]["stillEmpty"] = { active: [], inactive: 0 };
  const lastUseOf = (ref: string) => isoDay(legacyOf.get(ref)?.[0]?.lastUse ?? null);
  const families = [
    ...types.map((t) => ({ ref: t.id, name: t.name, active: t.active, before: activeCount.get(t.id) ?? 0 })),
    ...typesToCreate.map((p) => ({ ref: p.ref, name: p.name, active: p.active, before: 0 })),
  ];
  for (const f of families) {
    const more = added.get(f.ref) ?? 0;
    if (f.before === 0 && more > 0 && typeById.has(f.ref)) {
      fill.families += 1;
      fill.criteria += more;
    }
    if (f.before + more > 0) continue;
    if (f.active) stillEmpty.active.push({ name: f.name, nature: natureOf.get(f.ref)?.label ?? null, lastUse: lastUseOf(f.ref) });
    else stillEmpty.inactive += 1;
  }
  stillEmpty.active.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // ---- the regulations of existing families (slice J) ------------------------
  // Only where the family has none and nobody changed it by hand; one per family.
  const knownRegulations = new Set(snapshot.regulationLegacyIds);
  const links: PlannedLink[] = [];
  const regulationLeftOut = new Set<string>();
  const linkedTypes = new Set<string>();
  for (const d of decisions) {
    if (d.kind === "create" || d.regulationId !== null || linkedTypes.has(d.id)) continue;
    const legacyId = d.type.regulationLegacyId;
    if (legacyId === null || !knownRegulations.has(legacyId)) continue;
    linkedTypes.add(d.id);
    if (typeById.get(d.id)?.regulationEdited) {
      regulationLeftOut.add(d.id);
      continue;
    }
    links.push({ typeId: d.id, name: typeById.get(d.id)?.name ?? d.type.name, regulationLegacyId: legacyId });
  }
  const handEdited = [...new Set([...leftOut.keys(), ...regulationLeftOut])]
    .map((id) => ({ id, name: typeById.get(id)?.name ?? id, criteria: leftOut.get(id) ?? 0, regulation: regulationLeftOut.has(id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));

  // ---- the parameters the copies empty (D-13) --------------------------------
  const activeOfParameter = new Map<string, number>();
  for (const c of snapshot.criteria) if (c.active) activeOfParameter.set(c.parameterId, (activeOfParameter.get(c.parameterId) ?? 0) + 1);
  const deactivatedOf = new Map<string, number>();
  const sourceOf = new Map(snapshot.criteria.map((c) => [c.id, c.parameterId]));
  for (const copy of copies) {
    const parameterId = sourceOf.get(copy.criterionId)!;
    deactivatedOf.set(parameterId, (deactivatedOf.get(parameterId) ?? 0) + 1);
  }
  for (const row of rows) if (deactivatedOf.has(row.parameterRef)) activeOfParameter.set(row.parameterRef, (activeOfParameter.get(row.parameterRef) ?? 0) + 1);
  const orphanedSources = [...deactivatedOf.entries()]
    .filter(([id, count]) => (activeOfParameter.get(id) ?? 0) - count <= 0)
    .map(([id]) => parameterById.get(id)!)
    .map((p) => ({ name: p.name, category: p.category }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // ---- the samples at the bench whose verdicts change -------------------------
  const byStatus = new Map<InFlightStatus, { startJudged: number; loseCriteria: number }>(
    IN_FLIGHT_STATUSES.map((status) => [status, { startJudged: 0, loseCriteria: 0 }])
  );
  for (const s of snapshot.inFlight) {
    const counts = byStatus.get(s.status);
    if (!counts) continue;
    if (judgedCategories.get(s.productTypeId)?.has(s.type)) counts.startJudged += s.count;
    else if (lostCategories.get(s.productTypeId)?.has(s.type)) counts.loseCriteria += s.count;
  }
  const inFlight: InFlightImpact = {
    startJudged: [...byStatus.values()].reduce((n, c) => n + c.startJudged, 0),
    loseCriteria: [...byStatus.values()].reduce((n, c) => n + c.loseCriteria, 0),
    byStatus: [...byStatus.entries()].filter(([, c]) => c.startJudged + c.loseCriteria > 0).map(([status, c]) => ({ status, ...c })),
  };

  // ---- the meaningless tolerances an earlier import left (F2) ------------------
  const tolerances: PlannedTidy[] = snapshot.criteria
    .filter((c) => c.c !== null && !toleranceApplies(c.mKind, c.m !== null, c.bigM !== null))
    .map((c) => ({ criterionId: c.id, productTypeId: c.productTypeId }));
  const tidiedOf = new Map<string, number>();
  for (const t of tolerances) tidiedOf.set(t.productTypeId, (tidiedOf.get(t.productTypeId) ?? 0) + 1);

  // ---- the journal: one line per existing family changed ----------------------
  const journal = new Map<string, RepriseJournalEntry>();
  const entryOf = (typeId: string) => {
    let entry = journal.get(typeId);
    if (!entry) {
      entry = { typeId, metadata: { name: typeById.get(typeId)!.name } };
      journal.set(typeId, entry);
    }
    return entry;
  };
  for (const u of natureUpdates) {
    const entry = entryOf(u.typeId);
    entry.metadata.natureId = { before: null, after: u.natureId };
    if (u.family) entry.metadata.family = { before: u.familyBefore, after: u.family };
  }
  for (const link of links) entryOf(link.typeId).metadata.regulation = { before: null, legacyId: link.regulationLegacyId };
  for (const copy of copies) {
    const entry = entryOf(copy.productTypeId);
    entry.metadata.rebound = [...(entry.metadata.rebound ?? []), { criterionId: copy.criterionId, from: copy.fromParameter, to: copy.toParameter }];
  }
  for (const [ref, count] of added) if (typeById.has(ref)) entryOf(ref).metadata.added = count;
  for (const [typeId, count] of tidiedOf) if (typeById.has(typeId)) entryOf(typeId).metadata.toleranceCleared = count;

  natures.assigned = natureUpdates.length;
  natures.created = typesToCreate.filter((t) => t.natureId !== null).length;
  natures.familyChanged = natureUpdates.filter((u) => u.family !== null).length;
  return {
    decisions,
    typesToCreate,
    parameters,
    natureUpdates,
    links,
    copies,
    tolerances,
    rows,
    normsToCreate: [...normsToCreate.values()],
    journal: [...journal.values()],
    summary: {
      types: {
        total: legacyTypes.length,
        distinct: groups.size,
        workbook: decisions.filter((d) => d.kind === "workbook").length,
        legacyExisting: decisions.filter((d) => d.kind === "legacy-existing").length,
        toCreate: typesToCreate.length,
        inactive: typesToCreate.filter((t) => !t.active).length,
      },
      criteria: {
        rows: legacyCriteria.length,
        usable,
        missingC,
        skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        unmatchedParameters: [...unmatched.values()].sort((a, b) => b.count - a.count),
        unmatchedRows: [...unmatched.values()].reduce((n, u) => n + u.count, 0),
        toInsert: rows.length,
        alreadyPresent,
      },
      norms: usableNorms.size,
      normsToCreate: normsToCreate.size,
      reprise: {
        natures,
        rebinding: { families: reboundFamilies.size, copies: copies.length, deactivated: copies.length, collisions },
        parameters: parameters.map((p) => ({
          name: p.name,
          category: p.category,
          domain: p.family,
          unit: p.unit,
          reason: p.reason,
          alert: p.alertOnExceed,
          priced: p.priced,
          similar: p.similar,
        })),
        nearDuplicates: parameters.filter((p) => p.similar.length > 0).length,
        fill,
        stillEmpty,
        links: links.length,
        handEdited,
        orphanedSources,
        inFlight,
        tolerances: { rows: tolerances.length, families: tidiedOf.size },
      },
    },
  };
}
