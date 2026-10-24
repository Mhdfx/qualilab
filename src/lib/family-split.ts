import type { Family, LimitKind, SampleStatus, SampleType } from "@/generated/prisma/enums";
import { toleranceApplies } from "./criteria-input";
import { fingerprint } from "./fingerprint";
import { SAMPLE_TYPE_LABELS } from "./labels";
import { RECLASSIFY_FAMILY_LABELS } from "./parameter-reclassify";
import { normalizeLabel } from "./serie-input";
import { similarLabels } from "./similar";

/**
 * « Scinder par domaine » — one famille de produits split in two by the
 * domain of its criteria' parameters (backups/famille-AUTRES-ancienne-base-
 * 2026-10-23.md §5.3, « voie B »). Pure: the route reads the database, this
 * decides.
 *
 * Why: the import of the old software's catalogue grouped its families by
 * normalised name, so pairs it kept apart — « AUTRES » (n° 549, microbiology)
 * and « AUTRES_ » (n° 550, physico-chemistry), HUILE, FARINE DE POISSON and
 * three families named after a client (names kept out of this public
 * repository) — became ONE family holding the criteria of both domains. On
 * a micro sample, choosing « AUTRES » ticks 293 physico-chemical analyses
 * under « autre domaine que l'échantillon ».
 *
 * The rule is mechanical: the family's domain is its type d'analyse's
 * (`ProductType.natureId` → `AnalysisNature.family`); every ACTIVE criterion
 * whose parameter is of the other of the two domains the old software kept
 * apart — microbiology or physico-chemistry (`AnalysisParameter.family`) —
 * belongs elsewhere. « Autres analyses » (goût, odeur, corps étranger…)
 * never leaves: those rows are the family's own tests, programmed on the
 * same sample (Q129), not leftovers of a merge. The split creates the other
 * family (same client, same regulation, a type d'analyse of that domain and
 * of the same category), COPIES those criteria into it and DEACTIVATES them
 * on the source — never deletes: the inactive rows keep the old software's
 * import from planning them again (`planLegacyCatalogue` counts every row,
 * active or not, as present), and the journal entry it writes on the
 * source's grid marks it « modifiée à la main », so the reprise never adds
 * the other domain back.
 *
 * What the samples read, checked in the code (bench-plan.ts, results route):
 * the programme freezes the analyses and their norm version
 * (`SampleParameter`), NOT the plan. The bench grid, the results API and the
 * bench sheet read the family's ACTIVE criteria live (`loadBenchPlans`) until
 * a result is saved — `Result.criterion` freezes the plan then, and every
 * re-save reads it again. So a sample still open on the source family
 * (`CORRECTABLE_STATUSES`) that carries an analysis of the domain leaving
 * would lose its criterion: the split is refused, with the list. Samples
 * keep their family (`Sample.productTypeId` is never touched); validated
 * reports print the frozen copy — but one reopened for amendment is read
 * live again, so the preview names them (`closedSamples`, a warning), and
 * the open samples of the leaving domain's type d'analyse that carry none
 * of its analyses yet (`openOtherDomain`), which stay under the source.
 */

/**
 * The domains that may leave a family — the protocol's two boxes, the two
 * kinds of family the old software kept apart (« AUTRES » n° 549 / « AUTRES_ »
 * n° 550, backups/famille-AUTRES-ancienne-base-2026-10-23.md §5.3). Never
 * « Autres analyses ».
 */
export const SPLIT_DOMAINS: readonly Family[] = ["MICRO", "CHIMIE"];

/** What the new family's proposed name ends with: « AUTRES — physico-chimie ». */
export const SPLIT_NAME_SUFFIX: Record<Family, string> = {
  MICRO: "microbiologie",
  CHIMIE: "physico-chimie",
  AUTRE: "autres analyses",
};

/** The longest family name the database holds (`ProductType.name`, VARCHAR(191)). */
export const SPLIT_NAME_MAX = 191;

/** The 409 when the family changed between the preview and the confirmation. */
export const SPLIT_STALE_ERROR =
  "La famille a changé depuis l'aperçu (critères, paramètres ou en-tête) : rouvrez « Scinder par domaine ». Rien n'a été modifié.";

/** The 409 when another write held the family's rows through the whole attempt. */
export const SPLIT_BUSY_ERROR =
  "Une autre opération sur cette famille était en cours. Rien n'a été modifié : réessayez.";

export type SplitNature = {
  id: string;
  code: string;
  label: string;
  family: Family;
  /** The category of parameters its samples load. */
  legacyType: SampleType;
  active: boolean;
  sortOrder: number;
};

/** The family to split, as the route reads it. */
export type SplitSource = {
  id: string;
  name: string;
  clientId: string | null;
  regulationId: string | null;
  active: boolean;
  /** Its type d'analyse, archived or not; null = « à préciser ». */
  nature: SplitNature | null;
};

/** Every criterion row of the family, active or not, with its parameter's domain and category. */
export type SplitCriterion = {
  id: string;
  parameterId: string;
  parameterName: string;
  parameterFamily: Family;
  parameterCategory: SampleType;
  normVersionId: string | null;
  unit: string | null;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
  active: boolean;
};

/**
 * A sample of the family, with its type d'analyse's domain and the analyses
 * of a leaving domain it carries — programmed or with a result for an open
 * one (`CORRECTABLE_STATUSES`), with a result for a validated one.
 */
export type SplitSample = { id: string; reference: string; status: SampleStatus; natureFamily: Family; parameterIds: readonly string[] };

/** A sample the split would leave without the criteria of some of its analyses. */
export type SplitBlockingSample = { id: string; reference: string; status: SampleStatus; parameters: string[] };

/** A sample named in the preview, nothing more. */
export type SplitSampleRef = { id: string; reference: string; status: SampleStatus };

/** One domain that may leave the family. */
export type SplitGroup = {
  domain: Family;
  /** « Physico-chimie » — the reclassification's words. */
  label: string;
  /** Active criterion rows of that domain (one per germ and norm version). */
  rows: number;
  /** Its germs, by name, with their rows. */
  parameters: { id: string; name: string; rows: number }[];
  /** « AUTRES — physico-chimie ». */
  proposedName: string;
  /** The type d'analyse proposed — the first of `natures`; null when none fits. */
  natureId: string | null;
  /** The types d'analyse the new family may take: active, of that domain, of the source's category, the closest first. */
  natures: { id: string; label: string }[];
  /** Germs of a category other than the type d'analyse's: the new family could not offer them. */
  foreignCategory: string[];
  /** Open samples of the source that carry one of these germs: they would lose its criterion. */
  blockingSamples: SplitBlockingSample[];
  /**
   * Validated reports of the source (VALIDE, RAPPORT_ENVOYE) with a result for
   * one of these germs: reopened for amendment, the bench would read them
   * without criterion (no limits, no verdict). A warning, not a refusal.
   */
  closedSamples: SplitBlockingSample[];
  /**
   * Open samples of the source whose type d'analyse is of this domain and
   * that carry none of its germs yet: they stay under the source, and are
   * to be moved to the new family at their programme. A warning.
   */
  openOtherDomain: SplitSampleRef[];
  /** Why this domain may not leave now; null = it may. */
  refusal: string | null;
};

export type SplitPreview = {
  source: {
    id: string;
    name: string;
    /** Its type d'analyse's domain; null while « à préciser ». */
    domain: Family | null;
    natureLabel: string | null;
    activeRows: number;
    /** Active rows of its own domain — what stays. */
    ownRows: number;
  };
  /** The fingerprint the confirmation sends back (`splitVersion`). */
  version: string;
  groups: SplitGroup[];
  /** Why nothing may be split at all; null otherwise. */
  refusal: string | null;
};

/**
 * The family as the preview read it: its header, its type d'analyse and
 * every criterion row with its parameter's domain and category. A grid
 * saved, a parameter reclassified (D-19), a row reactivated or the type
 * d'analyse changed since the preview gives another version — the
 * confirmation is then refused, nothing written.
 */
export function splitVersion(source: SplitSource, criteria: readonly SplitCriterion[]): string {
  const rows = [...criteria]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => [c.id, c.parameterId, c.parameterFamily, c.parameterCategory, c.normVersionId, c.unit, c.n, c.c, c.mKind, c.m, c.bigM, c.active]);
  const nature = source.nature ? [source.nature.id, source.nature.family, source.nature.legacyType] : null;
  return fingerprint(JSON.stringify([source.id, source.name, source.clientId, source.regulationId, source.active, nature, rows]));
}

/** « AUTRES — physico-chimie », cut to what the database holds. */
export function proposedSplitName(name: string, domain: Family): string {
  const suffix = ` — ${SPLIT_NAME_SUFFIX[domain]}`;
  return `${name.trim().slice(0, SPLIT_NAME_MAX - suffix.length).trim()}${suffix}`;
}

/** « MICRO_ALIMENTS » → ["ALIMENTS"], « PC_COMPLEMENTS_COSMETIQUES » → ["COMPLEMENTS", "COSMETIQUES"]. */
function natureStem(code: string): string[] {
  return code.toUpperCase().replace(/^(MICRO|PC)_/, "").split("_").filter(Boolean);
}

/**
 * The types d'analyse the part leaving may take: active, of that domain,
 * and of the source's category — a food family's half stays food (the
 * import's rattachement would otherwise re-plan its rows). The closest
 * first: the same subject (« Microbiologie des aliments » →
 * « Physico-chimie des aliments »), then the most words shared
 * (« … des compléments » → « … des compléments alimentaires, cosmétiques »),
 * then the screens' order.
 */
export function splitNatureOptions(sourceNature: SplitNature, domain: Family, natures: readonly SplitNature[]): SplitNature[] {
  const stem = natureStem(sourceNature.code);
  const score = (nature: SplitNature) => {
    const other = natureStem(nature.code);
    const same = other.length === stem.length && other.every((token, i) => token === stem[i]) ? 1 : 0;
    const shared = other.filter((token) => stem.includes(token)).length;
    return { same, shared };
  };
  return natures
    .filter((nature) => nature.active && nature.family === domain && nature.legacyType === sourceNature.legacyType)
    .map((nature) => ({ nature, ...score(nature) }))
    .sort(
      (a, b) =>
        b.same - a.same ||
        b.shared - a.shared ||
        a.nature.sortOrder - b.nature.sortOrder ||
        a.nature.label.localeCompare(b.nature.label, "fr")
    )
    .map((entry) => entry.nature);
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/** « « A », « B » et 2 autres » — a short list of names inside a sentence. */
function nameList(names: readonly string[], max = 3): string {
  const quoted = names.slice(0, max).map((name) => `« ${name} »`);
  const rest = names.length - quoted.length;
  if (rest > 0) return `${quoted.join(", ")} et ${rest} autre${rest > 1 ? "s" : ""}`;
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} et ${quoted[quoted.length - 1]}` : quoted[0] ?? "";
}

/** The active rows that leave with `domain`. */
export function movedCriteria(criteria: readonly SplitCriterion[], domain: Family): SplitCriterion[] {
  return criteria.filter((criterion) => criterion.active && criterion.parameterFamily === domain);
}

/**
 * The preview: for each domain other than the family's own, its active
 * rows, its germs, the name and the type d'analyse proposed, and what
 * forbids the split now. Nothing here writes; the confirmation runs the
 * same plan again under the rows' locks (`decideSplit`).
 */
export function planFamilySplit(input: {
  source: SplitSource;
  criteria: readonly SplitCriterion[];
  natures: readonly SplitNature[];
  /** Its open samples (`CORRECTABLE_STATUSES`). */
  samples: readonly SplitSample[];
  /** Its validated reports carrying a result of a leaving domain. */
  closedSamples: readonly SplitSample[];
}): SplitPreview {
  const { source, criteria, natures, samples, closedSamples } = input;
  const version = splitVersion(source, criteria);
  const active = criteria.filter((criterion) => criterion.active);
  const nature = source.nature;
  const domain = nature?.family ?? null;
  const head = {
    id: source.id,
    name: source.name,
    domain,
    natureLabel: nature?.label ?? null,
    activeRows: active.length,
    ownRows: domain ? active.filter((criterion) => criterion.parameterFamily === domain).length : 0,
  };

  if (!nature) {
    return {
      source: head,
      version,
      groups: [],
      refusal:
        "Cette famille n'a pas de type d'analyse (« à préciser ») : choisissez-le d'abord dans l'en-tête — c'est lui qui dit le domaine de la famille.",
    };
  }

  const groups: SplitGroup[] = [];
  for (const other of SPLIT_DOMAINS) {
    if (other === nature.family) continue;
    const rows = movedCriteria(criteria, other);
    if (rows.length === 0) continue;

    const byParameter = new Map<string, { id: string; name: string; rows: number }>();
    for (const row of rows) {
      const entry = byParameter.get(row.parameterId) ?? { id: row.parameterId, name: row.parameterName, rows: 0 };
      entry.rows += 1;
      byParameter.set(row.parameterId, entry);
    }
    const parameters = [...byParameter.values()].sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
    const options = splitNatureOptions(nature, other, natures);
    const foreignCategory = [
      ...new Set(rows.filter((row) => row.parameterCategory !== nature.legacyType).map((row) => row.parameterName)),
    ].sort((a, b) => a.localeCompare(b, "fr"));
    const byReference = (a: SplitSampleRef, b: SplitSampleRef) => a.reference.localeCompare(b.reference, "fr") || a.id.localeCompare(b.id);
    /** The samples carrying one of these germs, each with the germs it carries. */
    const carrying = (list: readonly SplitSample[]): SplitBlockingSample[] =>
      list
        .map((sample) => ({
          id: sample.id,
          reference: sample.reference,
          status: sample.status,
          parameters: parameters.filter((parameter) => sample.parameterIds.includes(parameter.id)).map((parameter) => parameter.name),
        }))
        .filter((sample) => sample.parameters.length > 0)
        .sort(byReference);
    const blockingSamples = carrying(samples);
    const blocking = new Set(blockingSamples.map((sample) => sample.id));
    const openOtherDomain = samples
      .filter((sample) => sample.natureFamily === other && !blocking.has(sample.id))
      .map((sample) => ({ id: sample.id, reference: sample.reference, status: sample.status }))
      .sort(byReference);

    const label = RECLASSIFY_FAMILY_LABELS[other];
    const category = SAMPLE_TYPE_LABELS[nature.legacyType];
    let refusal: string | null = null;
    if (options.length === 0) {
      refusal = `Aucun type d'analyse actif du domaine « ${label} » pour la catégorie « ${category} » : la nouvelle famille n'aurait pas de type d'analyse.`;
    } else if (foreignCategory.length > 0) {
      refusal = `${foreignCategory.length > 1 ? "Les germes" : "Le germe"} ${nameList(foreignCategory)} ${foreignCategory.length > 1 ? "ne sont pas" : "n'est pas"} de la catégorie « ${category} » : la nouvelle famille ne pourrait pas ${foreignCategory.length > 1 ? "les" : "le"} proposer. Corrigez d'abord ${foreignCategory.length > 1 ? "ces lignes" : "cette ligne"} dans la grille.`;
    } else if (blockingSamples.length > 0) {
      refusal = `${plural(blockingSamples.length, "échantillon")} en cours ${blockingSamples.length > 1 ? "portent" : "porte"} des analyses de ce domaine sous cette famille : la paillasse lit ${blockingSamples.length > 1 ? "leurs critères sur la famille jusqu'à la saisie, ils les perdraient" : "ses critères sur la famille jusqu'à la saisie, il les perdrait"}. Scindez une fois ${blockingSamples.length > 1 ? "qu'ils sont validés ou annulés, ou retirez-leur" : "qu'il est validé ou annulé, ou retirez-lui"} ces analyses.`;
    }

    groups.push({
      domain: other,
      label,
      rows: rows.length,
      parameters,
      proposedName: proposedSplitName(source.name, other),
      natureId: options[0]?.id ?? null,
      natures: options.map((option) => ({ id: option.id, label: option.label })),
      foreignCategory,
      blockingSamples,
      closedSamples: carrying(closedSamples),
      openOtherDomain,
      refusal,
    });
  }

  // « Autres analyses » rows may remain: they are the family's own, not another domain to take out.
  const others = SPLIT_DOMAINS.filter((candidate) => candidate !== nature.family).map((candidate) => `« ${RECLASSIFY_FAMILY_LABELS[candidate]} »`);
  const refusal =
    groups.length === 0
      ? `Aucun critère actif de « ${source.name} » n'est du domaine ${others.join(" ou ")} : rien à scinder (domaine de son type d'analyse : « ${RECLASSIFY_FAMILY_LABELS[nature.family]} » ; les « Autres analyses » restent avec la famille).`
      : null;
  return { source: head, version, groups, refusal };
}

/** What the confirmation sends. */
export type SplitRequest = {
  /** The domain that leaves the family. */
  domain: Family;
  name: string;
  natureId: string;
  /** The preview's `version`. */
  version: string;
  /** The admin read the near-identical names and confirms it is another family. */
  confirmSimilar: boolean;
};

export function validateSplitRequest(body: unknown): { ok: true; value: SplitRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Requête invalide." };
  const input = body as Record<string, unknown>;
  const domain = input.domain as Family;
  if (typeof domain !== "string" || !SPLIT_DOMAINS.includes(domain)) {
    return { ok: false, error: "Domaine invalide : microbiologie ou physico-chimie." };
  }
  if (typeof input.version !== "string" || input.version.trim() === "" || input.version.length > 64) {
    return { ok: false, error: "Ouvrez d'abord l'aperçu de la scission : la confirmation renvoie sa version." };
  }
  if (typeof input.natureId !== "string" || input.natureId.trim() === "" || input.natureId.length > 191) {
    return { ok: false, error: "Choisissez le type d'analyse de la nouvelle famille." };
  }
  if (typeof input.name !== "string") return { ok: false, error: "Le nom de la nouvelle famille est obligatoire." };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Le nom de la nouvelle famille est obligatoire." };
  if (name.length > SPLIT_NAME_MAX) return { ok: false, error: `Nom trop long (${SPLIT_NAME_MAX} caractères au plus).` };
  if (!normalizeLabel(name)) return { ok: false, error: "Le nom de la nouvelle famille doit contenir des lettres ou des chiffres." };
  // A confirmation asked in any other form (« "true" », 1) must not pass for one.
  if (input.confirmSimilar !== undefined && typeof input.confirmSimilar !== "boolean") {
    return { ok: false, error: "Requête invalide." };
  }
  return {
    ok: true,
    value: { domain, name, natureId: input.natureId.trim(), version: input.version, confirmSimilar: input.confirmSimilar === true },
  };
}

export type SplitDecision =
  | { ok: true; group: SplitGroup; moved: SplitCriterion[]; natureId: string }
  | { ok: false; status: 400 | 409; error: string; blockingSamples?: SplitBlockingSample[] };

/**
 * The confirmation, decided against the plan read under the locks: refused
 * (nothing written) when the family changed since the preview, when it has
 * no type d'analyse, when the domain asked for is its own, when no active
 * row is of that domain, when the domain may not leave (no type d'analyse
 * for it, a germ of another category, open samples carrying its analyses)
 * or when the type d'analyse chosen is not one of those offered.
 */
export function decideSplit(preview: SplitPreview, request: SplitRequest, criteria: readonly SplitCriterion[]): SplitDecision {
  if (request.version !== preview.version) return { ok: false, status: 409, error: SPLIT_STALE_ERROR };
  if (preview.source.domain === null) return { ok: false, status: 409, error: preview.refusal ?? SPLIT_STALE_ERROR };
  const label = RECLASSIFY_FAMILY_LABELS[request.domain];
  if (request.domain === preview.source.domain) {
    return {
      ok: false,
      status: 409,
      error: `« ${label} » est le domaine du type d'analyse de la famille : ses critères y restent. Choisissez le domaine qui doit en sortir.`,
    };
  }
  const group = preview.groups.find((candidate) => candidate.domain === request.domain);
  if (!group) {
    return { ok: false, status: 409, error: `Aucun critère actif du domaine « ${label} » dans « ${preview.source.name} » : rien à scinder.` };
  }
  if (group.refusal) return { ok: false, status: 409, error: group.refusal, blockingSamples: group.blockingSamples };
  if (!group.natures.some((nature) => nature.id === request.natureId)) {
    return {
      ok: false,
      status: 400,
      error: `Type d'analyse refusé : choisissez-en un du domaine « ${label} », actif, de la même catégorie que la famille.`,
    };
  }
  return { ok: true, group, moved: movedCriteria(criteria, request.domain), natureId: request.natureId };
}

/** A family the new name is checked against. */
export type SplitNameCandidate = { id: string; name: string; normalizedName: string; clientId: string | null };

/**
 * The new name against the catalogue, by the rules of « Nouvelle famille »
 * (`POST /api/product-types`): the same normalised name for the same client
 * (or both common) is a duplicate, refused; a name one typing error away
 * from a common family or one of the client's asks for a confirmation. The
 * source itself is left out of the look-alikes — the new name is made from
 * it on purpose.
 */
export function splitNameCheck(
  name: string,
  clientId: string | null,
  families: readonly SplitNameCandidate[],
  sourceId: string
): { taken: boolean; similar: string[] } {
  const key = normalizeLabel(name);
  const taken = families.some((family) => family.normalizedName === key && family.clientId === clientId);
  const candidates = families
    .filter((family) => family.id !== sourceId && (family.clientId === null || family.clientId === clientId))
    .map((family) => family.name);
  return { taken, similar: taken ? [] : similarLabels(name, candidates, 5) };
}

/**
 * A criterion as the new family receives it: every column of the source
 * row, active. A tolerance c an earlier import left where it means nothing
 * (an absence test, a limitless row — F2) is not copied, as the import's
 * own copies do: the new grid saves back as it is shown, and the reprise
 * finds nothing to tidy on it.
 */
export function copiedCriterion(row: SplitCriterion): {
  parameterId: string;
  normVersionId: string | null;
  unit: string | null;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
  active: true;
} {
  return {
    parameterId: row.parameterId,
    normVersionId: row.normVersionId,
    unit: row.unit,
    n: row.n,
    c: toleranceApplies(row.mKind, row.m !== null, row.bigM !== null) ? row.c : null,
    mKind: row.mKind,
    m: row.m,
    bigM: row.bigM,
    active: true,
  };
}

/** How many rows are listed by id in a journal entry: its metadata is a TEXT column. */
export const SPLIT_JOURNAL_LIST_MAX = 50;

/** The new family as written. */
export type SplitCreated = {
  id: string;
  name: string;
  normalizedName: string;
  family: Family;
  natureId: string;
  clientId: string | null;
  active: boolean;
  regulationId: string | null;
};

/**
 * The three journal entries of a split, written in its transaction:
 * - `PRODUCT_TYPE_CREATED` on the new family — the fields `POST
 *   /api/product-types` journals, its regulation, and where it comes from;
 * - `CRITERIA_UPDATED` on the source — its rows before / after (unchanged:
 *   nothing is deleted), the rows deactivated, the active counts before /
 *   after. Read by the import as a hand change of the grid
 *   (`criteriaEditedByHand`): the reprise then never adds a row of the old
 *   software to the source again;
 * - `CRITERIA_UPDATED` on the new family — 0 rows before, the copies after.
 * Lists stop at `SPLIT_JOURNAL_LIST_MAX`; the counts are complete.
 */
export function splitJournal(input: {
  source: { id: string; name: string };
  created: SplitCreated;
  domain: Family;
  moved: readonly SplitCriterion[];
  /** Every row of the source, active or not — before and after alike. */
  sourceRows: number;
  sourceActiveBefore: number;
  sourceActiveAfter: number;
}): {
  created: Record<string, unknown>;
  sourceCriteria: Record<string, unknown>;
  newCriteria: Record<string, unknown>;
} {
  const { source, created, domain, moved } = input;
  const copies = moved.map(copiedCriterion);
  const split = { domain, from: { id: source.id, name: source.name }, to: { id: created.id, name: created.name }, criteria: moved.length };
  return {
    created: {
      name: created.name,
      normalizedName: created.normalizedName,
      family: created.family,
      natureId: created.natureId,
      clientId: created.clientId,
      active: created.active,
      regulationId: created.regulationId,
      split,
    },
    sourceCriteria: {
      name: source.name,
      before: input.sourceRows,
      after: input.sourceRows,
      changed: moved.slice(0, SPLIT_JOURNAL_LIST_MAX).map((row) => ({
        id: row.id,
        parameterId: row.parameterId,
        normVersionId: row.normVersionId,
        active: false,
      })),
      removed: [],
      tidied: 0,
      active: { before: input.sourceActiveBefore, after: input.sourceActiveAfter },
      split,
    },
    newCriteria: {
      name: created.name,
      before: 0,
      after: moved.length,
      changed: copies.slice(0, SPLIT_JOURNAL_LIST_MAX).map((copy) => ({ id: null, ...copy })),
      removed: [],
      tidied: moved.filter((row, index) => row.c !== copies[index].c).length,
      active: { before: 0, after: moved.length },
      split,
    },
  };
}
