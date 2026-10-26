import type { CancelReason, Family, ProgrammePriority, SampleStatus } from "@/generated/prisma/enums";
import { BENCH_STATUSES, isUnclaimed } from "@/lib/bench-access";
import { pickCriterion } from "@/lib/interpretation";
import { ANALYSIS_FAMILY_LABELS, CANCEL_REASON_LABELS, formatDateTime } from "@/lib/labels";
import { roundMoney } from "@/lib/invoice-math";
import type { InvoiceFact } from "@/lib/billing";
import { normInForce } from "@/lib/parameter-caption";
import { programmeNatureFamilies } from "@/lib/programme-input";
import {
  parameterSpellings,
  receptionChecklist,
  type ChecklistRow,
  type ReceptionThresholds,
} from "@/lib/reception-rules";
import { complementaryChecklist, type ComplementarySerie } from "@/lib/reception-complementary";
import { reportTechnicianNames } from "@/lib/report-programme";
import type { Role } from "@/lib/roles";
import type { SampleTwin } from "@/lib/sample-code";
import { CORRECTABLE_STATUSES } from "@/lib/sample-status";
import { cancellersLabel, correctionLabel, correctionRights } from "@/lib/sample-verbs";
import { MAX_UNITS } from "@/lib/series";
import { matchesQuery } from "@/lib/similar";
import { fromLocalInput, toLocalInput } from "@/components/preleveur/visit-types";
import type {
  CriterionRef,
  ParameterRef,
  ProductTypeRef,
  ProfileRef,
  ProgrammeNatureData,
  ProgrammeReferentialData,
  ProgrammeSampleData,
  ProgrammeState,
} from "./programme-sheet-types";

/**
 * What the programme sheet decides without the server (PROGRAMME.md §4):
 * how a product type or a profile rewrites the draft, what the entry check
 * and the billing preview show. Pure, so the tests beside it pin the
 * behaviour the responsable des paramètres sees; the route validates
 * everything again (`programme-input.ts`).
 *
 * The sheet hands the line to nobody (« prise en charge libre », 13/10 —
 * PROGRAMME.md §10): a technician takes it at the bench. The draft and the
 * request carry no technician; the sheet only says who holds the line
 * (`benchHolder`).
 */

export type ParameterSetting = {
  /** "" = no explicit version (the bench then reads the criterion's, else the parameter's). */
  normVersionId: string;
  /** As typed (« 10 », « 2,5 »); "" = none. The server parses it. */
  dilutionFactor: string;
  note: string;
};

export type ProgrammeDraft = {
  /**
   * The nature the programme is written for (RETOUR-LABO-06-10.md §5, V3 —
   * Q49, Q129): the line's own until the sheet picks another one.
   * It is always the nature of the referential on screen.
   */
  natureId: string;
  productTypeId: string;
  parameterIds: string[];
  unitCount: number;
  testPortion: string;
  priority: ProgrammePriority;
  /**
   * LEGAL wall time ("YYYY-MM-DDTHH:mm", laboratory's clock); "" = none.
   * `LabDateTimeInput` shows it on the device's clock and hands back the legal one.
   */
  dueAt: string;
  programmeNote: string;
  /** Kept for every parameter, ticked or not: unticking then re-ticking loses nothing. */
  settings: Record<string, ParameterSetting>;
  /**
   * The analyses a change of family never removes (16/10, Q123 —
   * RETOUR-LABO-16-10.md F6): those ticked or unticked by hand on this
   * sheet (a profile counts), and those the line carried at opening that
   * were not germs of its stored family — the préleveur's requests. Never
   * sent: the sheet's memory only.
   */
  manualIds: string[];
  /** The n of the profile chosen on this sheet, 0 = none: a family's n never goes below it. Never sent. */
  profileUnitCount: number;
};

export const UNIT_CHOICES = [1, 3, 5, 9] as const;

const EMPTY_SETTING: ParameterSetting = { normVersionId: "", dilutionFactor: "", note: "" };

export function settingOf(draft: ProgrammeDraft, parameterId: string): ParameterSetting {
  return draft.settings[parameterId] ?? EMPTY_SETTING;
}

export function clampUnits(value: number): number {
  if (!Number.isInteger(value) || value < 1) return 1;
  return Math.min(value, MAX_UNITS);
}

export function typeOf(referential: ProgrammeReferentialData, id: string | null): ProductTypeRef | undefined {
  return id ? referential.productTypes.find((type) => type.id === id) : undefined;
}

/** The criteria of a type, one per germ: of several for one germ, the one under the norm version in force. */
export function criteriaOf(type: ProductTypeRef | undefined): CriterionRef[] {
  if (!type) return [];
  const byParameter = new Map<string, CriterionRef[]>();
  for (const criterion of type.criteria) {
    byParameter.set(criterion.parameterId, [...(byParameter.get(criterion.parameterId) ?? []), criterion]);
  }
  const picked: CriterionRef[] = [];
  for (const list of byParameter.values()) {
    const criterion = pickCriterion(list);
    if (criterion) picked.push(criterion);
  }
  return picked.sort((a, b) => a.parameterName.localeCompare(b.parameterName, "fr"));
}

/** The units the type's plans read: the largest n of its criteria, 0 without criteria. */
export function typeUnitCount(type: ProductTypeRef | undefined): number {
  return criteriaOf(type).reduce((max, criterion) => Math.max(max, criterion.n), 0);
}

/**
 * The germs of a family the nature on screen may programme, in the
 * family's order — the « Paramètres à rechercher » (F6). A criterion on a
 * parameter of another category is shown, never ticked.
 */
export function familyGermIds(type: ProductTypeRef | undefined, referential: ProgrammeReferentialData): string[] {
  const known = new Set(referential.parameters.map((parameter) => parameter.id));
  return criteriaOf(type).flatMap((criterion) => (known.has(criterion.parameterId) ? [criterion.parameterId] : []));
}

/** The version a type's criterion names for a parameter, when the parameter may use it. */
function criterionVersion(parameterId: string, type: ProductTypeRef | undefined, referential: ProgrammeReferentialData): string {
  const criterion = criteriaOf(type).find((candidate) => candidate.parameterId === parameterId);
  const options = referential.normVersions[parameterId] ?? [];
  return criterion?.normVersionId && options.some((option) => option.id === criterion.normVersionId)
    ? criterion.normVersionId
    : "";
}

/**
 * The version the sheet proposes for a parameter (PROGRAMME.md §4, Méthodes):
 * the criterion's when a type is chosen and names one, else the version in
 * force, else none.
 */
export function defaultNormVersionId(
  parameterId: string,
  type: ProductTypeRef | undefined,
  referential: ProgrammeReferentialData
): string {
  const fromCriterion = criterionVersion(parameterId, type, referential);
  if (fromCriterion) return fromCriterion;
  return (referential.normVersions[parameterId] ?? []).find((option) => option.current)?.id ?? "";
}

/** A parameter's settings with a version filled in when it has none yet. */
function withDefaults(
  settings: Record<string, ParameterSetting>,
  parameterId: string,
  type: ProductTypeRef | undefined,
  referential: ProgrammeReferentialData
): ParameterSetting {
  const current = settings[parameterId] ?? EMPTY_SETTING;
  if (current.normVersionId) return current;
  return { ...current, normVersionId: defaultNormVersionId(parameterId, type, referential) };
}

const dilutionText = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));

/**
 * The sheet as it opens: the stored programme, or what the préleveur ticked
 * before any programme. What the line carries beyond its stored family's
 * germs — the préleveur's requests, an analysis added by hand — is
 * remembered as asked for (`manualIds`): changing the family keeps it.
 */
export function initialDraft(
  programme: ProgrammeState,
  referential: ProgrammeReferentialData
): ProgrammeDraft {
  const known = new Set(referential.parameters.map((parameter) => parameter.id));
  const type = typeOf(referential, programme.productTypeId);
  const parameterIds = programme.parameterIds.filter((id) => known.has(id));
  // A family the client may no longer use brought nothing the sheet can tell apart: all asked for.
  const familyGerms = new Set(familyGermIds(type, referential));
  const settings: Record<string, ParameterSetting> = {};
  for (const entry of programme.parameters) {
    if (!known.has(entry.parameterId)) continue;
    settings[entry.parameterId] = {
      normVersionId: entry.normVersionId ?? "",
      dilutionFactor: dilutionText(entry.dilutionFactor),
      note: entry.note ?? "",
    };
  }
  for (const id of parameterIds) settings[id] = withDefaults(settings, id, type, referential);
  return {
    natureId: referential.natureId || programme.natureId,
    productTypeId: type?.id ?? "",
    parameterIds,
    unitCount: clampUnits(programme.unitCount),
    testPortion: programme.testPortion ?? "",
    priority: programme.priority,
    dueAt: programme.dueAt ? toLocalInput(new Date(programme.dueAt)) : "",
    programmeNote: programme.programmeNote ?? "",
    settings,
    manualIds: parameterIds.filter((id) => !familyGerms.has(id)),
    profileUnitCount: 0,
  };
}

/** The family's germs ticked, each with the criterion's norm version when it names one the parameter may use. */
function tickFamilyGerms(
  draft: ProgrammeDraft,
  germs: readonly string[],
  type: ProductTypeRef | undefined,
  referential: ProgrammeReferentialData,
  options: { criterionVersion: boolean }
): Pick<ProgrammeDraft, "parameterIds" | "settings"> {
  const settings = { ...draft.settings };
  for (const id of germs) {
    const current = withDefaults(settings, id, type, referential);
    const fromCriterion = options.criterionVersion ? criterionVersion(id, type, referential) : "";
    settings[id] = fromCriterion ? { ...current, normVersionId: fromCriterion } : current;
  }
  return { parameterIds: [...new Set([...draft.parameterIds, ...germs])], settings };
}

/**
 * Choosing a family REPLACES its list (16/10, Q123 — RETOUR-LABO-16-10.md
 * F6, as the old software did): the germs that came only from the previous
 * family leave the analyses, the new family's are ticked — each with its
 * criterion's norm version — and its n is proposed, never below the n of a
 * profile chosen on this sheet. What was asked for stays (`manualIds`):
 * the analyses ticked by hand, the préleveur's requests. « Aucune
 * famille » (typeId "") removes the previous family's germs the same way and
 * leaves n as it is (nothing to read it from) — likewise a family without
 * criteria.
 * `LineEditor` and `DepositForm` keep their additive choice.
 */
export function applyProductType(
  draft: ProgrammeDraft,
  typeId: string,
  referential: ProgrammeReferentialData
): ProgrammeDraft {
  const previous = new Set(familyGermIds(typeOf(referential, draft.productTypeId || null), referential));
  const type = typeOf(referential, typeId || null);
  const germs = familyGermIds(type, referential);
  const next = new Set(germs);
  const asked = new Set(draft.manualIds);
  const kept = draft.parameterIds.filter((id) => !previous.has(id) || next.has(id) || asked.has(id));
  const ticked = tickFamilyGerms({ ...draft, parameterIds: kept }, germs, type, referential, { criterionVersion: true });
  const needed = typeUnitCount(type);
  return {
    ...draft,
    ...ticked,
    productTypeId: type?.id ?? "",
    unitCount: needed > 0 ? clampUnits(Math.max(needed, draft.profileUnitCount)) : draft.unitCount,
  };
}

/**
 * What the sheet says after a change of family: the family chosen (or none),
 * the analyses that left with the previous one and the n it changed — a
 * replacement removes analyses and may lower n, never silently.
 */
export function familyChangeNotice(
  before: ProgrammeDraft,
  after: ProgrammeDraft,
  referential: ProgrammeReferentialData
): string {
  const type = typeOf(referential, after.productTypeId || null);
  const removed = before.parameterIds
    .filter((id) => !after.parameterIds.includes(id))
    .map((id) => referential.parameters.find((parameter) => parameter.id === id)?.name ?? id);
  const head = type ? `Famille « ${type.name} » choisie` : "Aucune famille : lecture en valeur simple";
  const tail =
    removed.length === 0
      ? ""
      : removed.length === 1
        ? ` ; l'analyse « ${removed[0]} », venue de la famille précédente, a été retirée`
        : ` ; ${removed.length} analyses venues de la famille précédente ont été retirées (${removed.map((name) => `« ${name} »`).join(", ")})`;
  const units = before.unitCount !== after.unitCount ? ` ; n : ${before.unitCount} → ${after.unitCount}` : "";
  return `${head}${tail}${units}. Enregistrez le programme pour l'appliquer.`;
}

/** Whether a change of family took something away the programmer may want back (amber, not a mere acknowledgement). */
export function familyChangeTookAway(before: ProgrammeDraft, after: ProgrammeDraft): boolean {
  return before.unitCount > after.unitCount || before.parameterIds.some((id) => !after.parameterIds.includes(id));
}

/** « Cocher tout »: every germ of the chosen family ticked — the other analyses untouched, nothing marked as asked for. */
export function checkAllOfType(draft: ProgrammeDraft, referential: ProgrammeReferentialData): ProgrammeDraft {
  const type = typeOf(referential, draft.productTypeId || null);
  return { ...draft, ...tickFamilyGerms(draft, familyGermIds(type, referential), type, referential, { criterionVersion: false }) };
}

/** « Décocher tout »: every germ of the chosen family unticked — the other analyses untouched, settings kept. */
export function uncheckAllOfType(draft: ProgrammeDraft, referential: ProgrammeReferentialData): ProgrammeDraft {
  const germs = new Set(familyGermIds(typeOf(referential, draft.productTypeId || null), referential));
  return { ...draft, parameterIds: draft.parameterIds.filter((id) => !germs.has(id)) };
}

/** How many of the chosen family's germs are ticked, of how many the nature on screen may programme. */
export function familyCheckCount(draft: ProgrammeDraft, referential: ProgrammeReferentialData): { checked: number; total: number } {
  const germs = familyGermIds(typeOf(referential, draft.productTypeId || null), referential);
  return { checked: germs.filter((id) => draft.parameterIds.includes(id)).length, total: germs.length };
}

/** « 3 paramètres cochés sur 5 » — « 0 paramètre coché sur 5 », as French counts. */
export function familyCheckLabel(count: { checked: number; total: number }): string {
  const plural = count.checked > 1 ? "s" : "";
  return `${count.checked} paramètre${plural} coché${plural} sur ${count.total}`;
}

/** One line of « Paramètres à rechercher »: the family's criterion as the bench will read it. */
export type FamilyParameterRow = {
  parameterId: string;
  name: string;
  criterion: CriterionRef;
  /** The criterion's norm version, else the parameter's version in force; null = none known. */
  normLabel: string | null;
  /** The criterion's unit — it wins at the bench and on the report (Q40: « /1g ») — else the parameter's. */
  unit: string | null;
  checked: boolean;
  /** False for a germ the nature on screen does not offer (another category): shown, never ticked. */
  available: boolean;
};

/** The unit an analysis is read in: the family's criterion's when it gives one (Q40), else the parameter's. */
export function criterionUnit(criterion: Pick<CriterionRef, "unit"> | undefined, parameter: Pick<ParameterRef, "unit"> | undefined): string | null {
  const fromCriterion = criterion?.unit?.trim();
  if (fromCriterion) return fromCriterion;
  const fromParameter = parameter?.unit?.trim();
  return fromParameter ? fromParameter : null;
}

/** The chosen family as « Paramètres à rechercher »: germ · norme · unité du critère · n / c / m / M (F6). */
export function familyParameterRows(draft: ProgrammeDraft, referential: ProgrammeReferentialData): FamilyParameterRow[] {
  return criteriaOf(typeOf(referential, draft.productTypeId || null)).map((criterion) => {
    const parameter = referential.parameters.find((candidate) => candidate.id === criterion.parameterId);
    return {
      parameterId: criterion.parameterId,
      name: parameter?.name ?? criterion.parameterName,
      criterion,
      normLabel: criterion.normVersion?.label ?? normInForce(referential.normVersions[criterion.parameterId] ?? []),
      unit: criterionUnit(criterion, parameter),
      checked: draft.parameterIds.includes(criterion.parameterId),
      available: parameter !== undefined,
    };
  });
}

/** A profile replaces the analyses and proposes its n — raised to the chosen type's when that reads more. */
export function applyProfile(
  draft: ProgrammeDraft,
  profile: ProfileRef,
  referential: ProgrammeReferentialData
): ProgrammeDraft {
  const known = new Set(referential.parameters.map((parameter) => parameter.id));
  const type = typeOf(referential, draft.productTypeId);
  const parameterIds = profile.parameterIds.filter((id) => known.has(id));
  const settings = { ...draft.settings };
  for (const id of parameterIds) settings[id] = withDefaults(settings, id, type, referential);
  return {
    ...draft,
    parameterIds,
    settings,
    // Chosen by hand: a later change of family keeps the profile's analyses and its n.
    manualIds: [...new Set([...draft.manualIds, ...parameterIds])],
    profileUnitCount: profile.unitCount,
    unitCount: clampUnits(Math.max(profile.unitCount, typeUnitCount(type))),
  };
}

/** What « Choisir une famille de produits » shows (16/10, Q124 — RETOUR-LABO-16-10.md F5). */
export type FamilyFilter = {
  /** The type d'analyse kept; null = « Tous ». */
  natureId: string | null;
  /** With a type d'analyse: the families still « à préciser » (no type yet) too — so no food family disappears. */
  includeUnclassified: boolean;
  /** Matched on the family's name, accents and one typo forgiven (`matchesQuery`). */
  query: string;
};

/**
 * The filter for one « Type d'analyse » choice: a food type also lists the
 * families still « à préciser » — one of them may be a food family, and
 * hiding it would leave it unpickable on a food line (F5); « Tous » (null)
 * lists everything anyway. The picker opens on the nature on screen
 * (`familyFilterFor(draft.natureId, referential)`), changeable.
 */
export function familyFilterFor(
  natureId: string | null,
  referential: Pick<ProgrammeReferentialData, "natureId" | "category" | "familyNatures">,
  query = ""
): FamilyFilter {
  const category =
    natureId === null
      ? null
      : (referential.familyNatures.find((nature) => nature.id === natureId)?.category ??
        (natureId === referential.natureId ? referential.category : null));
  return { natureId, includeUnclassified: category === "ALIMENTAIRE", query };
}

/**
 * The families the picker lists: of the type d'analyse chosen (plus the
 * unclassified ones when asked), matching the search, the client's own
 * first, then the catalogue, by name in each.
 */
export function filterFamilies<T extends Pick<ProductTypeRef, "name" | "natureId" | "clientId">>(
  types: readonly T[],
  filter: FamilyFilter
): T[] {
  return types
    .filter(
      (type) =>
        (filter.natureId === null ||
          type.natureId === filter.natureId ||
          (filter.includeUnclassified && type.natureId === null)) &&
        matchesQuery(type.name, filter.query)
    )
    .sort((a, b) => Number(a.clientId === null) - Number(b.clientId === null) || a.name.localeCompare(b.name, "fr"));
}

/** True when the ticked analyses are exactly the profile's. */
export function profileApplied(
  draft: ProgrammeDraft,
  profile: ProfileRef,
  referential: ProgrammeReferentialData
): boolean {
  const known = new Set(referential.parameters.map((parameter) => parameter.id));
  const ids = profile.parameterIds.filter((id) => known.has(id));
  return ids.length > 0 && ids.length === draft.parameterIds.length && ids.every((id) => draft.parameterIds.includes(id));
}

/** A tick by hand: remembered as asked for (`manualIds`), so a change of family keeps it. */
export function toggleParameter(
  draft: ProgrammeDraft,
  parameterId: string,
  referential: ProgrammeReferentialData
): ProgrammeDraft {
  const manualIds = draft.manualIds.includes(parameterId) ? draft.manualIds : [...draft.manualIds, parameterId];
  if (draft.parameterIds.includes(parameterId)) {
    return { ...draft, manualIds, parameterIds: draft.parameterIds.filter((id) => id !== parameterId) };
  }
  const type = typeOf(referential, draft.productTypeId);
  return {
    ...draft,
    manualIds,
    parameterIds: [...draft.parameterIds, parameterId],
    settings: { ...draft.settings, [parameterId]: withDefaults(draft.settings, parameterId, type, referential) },
  };
}

export function updateSetting(
  draft: ProgrammeDraft,
  parameterId: string,
  patch: Partial<ParameterSetting>
): ProgrammeDraft {
  return { ...draft, settings: { ...draft.settings, [parameterId]: { ...settingOf(draft, parameterId), ...patch } } };
}

/**
 * The family of each parameter: its own (`AnalysisParameter.family`, set on
 * `/admin/parametres` — RETOUR-LABO-06-10.md §5, V3). A referential that
 * does not carry it yet falls back to the catalogue: a germ cited only by
 * microbiology types is micro, only by chemistry types is chemistry; one
 * cited by both, or by none, follows the nature of the line.
 */
export function parameterFamilies(referential: ProgrammeReferentialData, natureFamily: Family): Map<string, Family> {
  const cited = new Map<string, Set<Family>>();
  for (const type of referential.productTypes) {
    if (type.family === "AUTRE") continue;
    for (const criterion of type.criteria) {
      const set = cited.get(criterion.parameterId) ?? new Set<Family>();
      set.add(type.family);
      cited.set(criterion.parameterId, set);
    }
  }
  const families = new Map<string, Family>();
  for (const parameter of referential.parameters) {
    if (parameter.family) {
      families.set(parameter.id, parameter.family);
      continue;
    }
    const set = cited.get(parameter.id);
    families.set(parameter.id, set && set.size === 1 ? [...set][0] : natureFamily);
  }
  return families;
}

/** The order the families are listed in: the two boxes of the protocol, then the rest. */
const FAMILY_ORDER: readonly Family[] = ["MICRO", "CHIMIE", "AUTRE"];

export type ParameterGroup = {
  family: Family;
  /** « Analyses microbiologiques », « Analyses physico-chimiques », « Autres analyses ». */
  label: string;
  /** True when the group is not the family of the line's nature: the other family is normally another sample. */
  foreign: boolean;
  parameters: ParameterRef[];
};

/**
 * The analyses offered, grouped by family (RETOUR-LABO-06-10.md §5, V3):
 * the line's own family first, then the others in the protocol's order;
 * empty groups are left out, the catalogue order is kept inside a group.
 */
export function groupParameters(
  referential: ProgrammeReferentialData,
  natureFamily: Family
): ParameterGroup[] {
  const families = parameterFamilies(referential, natureFamily);
  const order = [natureFamily, ...FAMILY_ORDER.filter((family) => family !== natureFamily)];
  return order.flatMap((family) => {
    const parameters = referential.parameters.filter((parameter) => families.get(parameter.id) === family);
    return parameters.length > 0
      ? [{ family, label: ANALYSIS_FAMILY_LABELS[family], foreign: family !== natureFamily, parameters }]
      : [];
  });
}

/**
 * « Analyses hors famille » (F6): the groups without the chosen family's
 * germs — those are ticked in « Paramètres à rechercher » — empty groups
 * left out. (« Autres analyses » is the AUTRE domain's name, never this panel's.)
 */
export function otherParameterGroups(
  groups: readonly ParameterGroup[],
  draft: ProgrammeDraft,
  referential: ProgrammeReferentialData
): ParameterGroup[] {
  const germs = new Set(familyGermIds(typeOf(referential, draft.productTypeId || null), referential));
  return groups.flatMap((group) => {
    const parameters = group.parameters.filter((parameter) => !germs.has(parameter.id));
    return parameters.length > 0 ? [{ ...group, parameters }] : [];
  });
}

/**
 * The natures the sheet offers (Q49 by default, Q129): the line's current
 * one — even archived, it stays readable — and the active natures of the
 * families it may take (`programmeNatureFamilies`): its own and « Autres
 * analyses » (« Analyse sensorielle » of a food), or from « Autres
 * analyses » back to the family of its code's letter (« …M » / « …P »; for
 * a single sample, the domain it came from — `referential.natureHome` —
 * both only when unknown). The other family of a split line is another
 * sample, never a choice here. The server already bounds the list by the
 * kind of sample (`selectableNatures`).
 */
export function natureChoices(
  referential: ProgrammeReferentialData,
  family: Family,
  twin: SampleTwin | null
): ProgrammeNatureData[] {
  const families = programmeNatureFamilies(family, twin, referential.natureHome ?? null);
  return referential.natures.filter((nature) => nature.current || (nature.active && families.includes(nature.family)));
}

/**
 * The hint under « Nature d'analyse » (Q129): where the other natures come
 * from — `choices` is the number of natures the select offers, the current
 * one included; `home`, the domain a single-sample line on « Autres
 * analyses » came from. The sheet shows it while the programme is editable.
 */
export function natureHint(family: Family, twin: SampleTwin | null, choices: number, home: Family | null = null): string {
  const label = (of: Family) => ANALYSIS_FAMILY_LABELS[of].toLowerCase();
  const homes = programmeNatureFamilies(family, twin, home).filter((of) => of !== "AUTRE");
  // A split line's other family is another sample; a line moved to « Autres
  // analyses » goes back to its domain — either, only when the journal knows none.
  const split = family !== "AUTRE" || homes.length === 1;
  if (choices < 2) {
    return family === "AUTRE"
      ? `Aucune autre nature active parmi les autres analyses ni dans ${split ? "le domaine de l'échantillon" : "les domaines"} (${homes.map(label).join(" ou ")}).`
      : `Aucune autre nature active dans le même domaine (${label(family)}) ni parmi les autres analyses.`;
  }
  const scope =
    family === "AUTRE"
      ? `Parmi les autres analyses, ou dans ${split ? "le domaine de l'échantillon" : "l'un des deux domaines"} (${homes.map(label).join(" ou ")})`
      : `Dans le même domaine (${label(family)}) ou parmi les autres analyses`;
  return `${scope}${split ? " : l'autre domaine fait l'objet d'un autre échantillon" : ""}. Changer de nature recharge les analyses et les profils ; la nature change à l'enregistrement du programme.`;
}

/**
 * What moving a line into « Autres analyses » undid (`adoptReferential`):
 * the units it had, the family it carried — null when unchanged — and, by
 * name, the analyses that came only from that family (D-16).
 */
export type OtherAnalysesReset = { unitCount: number; productType: string | null; removed: string[] };

/**
 * The draft once the referential of another nature replaced the one on
 * screen: the nature follows, and the analyses the new nature does not
 * offer are dropped — their names are returned so the sheet can say which.
 * Everything else (type, units, priority and dates, the settings of every
 * analysis) is kept: re-choosing the first nature loses nothing but the
 * dropped analyses, which the user ticks again.
 *
 * Except into « Autres analyses » from a micro or PC nature (« Analyse
 * sensorielle », 16/10, Q129 — RETOUR-LABO-16-10.md F9: « garder n = 1 pour
 * la sensorielle »): n goes back to 1 and the family is detached — the
 * micro family's n = 5 would have every analysis read per unit, R1–R5, and
 * its criteria are not the sensory analysis's. The family leaves as
 * « — aucune — » takes it (RETOUR-LABO-19-10.md D-16, `applyProductType`):
 * the analyses that came only from it leave too — a sensory sample never
 * goes to the bench with the family's micro germs — while those asked for
 * stay (ticked by hand, a profile, the préleveur's requests). `reset` says
 * what changed; the laboratory confirms the rule against its old
 * software's n = 5 (NEEDEDINFO Q133).
 */
export function adoptReferential(
  draft: ProgrammeDraft,
  previous: ProgrammeReferentialData,
  next: ProgrammeReferentialData
): { draft: ProgrammeDraft; dropped: string[]; reset: OtherAnalysesReset | null } {
  const known = new Set(next.parameters.map((parameter) => parameter.id));
  const kept = draft.parameterIds.filter((id) => known.has(id));
  const nameOf = (id: string) => previous.parameters.find((parameter) => parameter.id === id)?.name ?? id;
  const dropped = draft.parameterIds.filter((id) => !known.has(id)).map(nameOf);
  const familyOf = (r: ProgrammeReferentialData) => r.natures.find((nature) => nature.id === r.natureId)?.family ?? null;
  const intoOther = familyOf(next) === "AUTRE" && familyOf(previous) !== "AUTRE";
  if (intoOther && (draft.unitCount !== 1 || draft.productTypeId)) {
    // Read on the referential the family was chosen on; settings are kept, for a way back.
    const detached = applyProductType(draft, "", previous).parameterIds;
    const parameterIds = kept.filter((id) => detached.includes(id));
    const reset = {
      unitCount: draft.unitCount,
      productType: draft.productTypeId ? typeOf(previous, draft.productTypeId)?.name ?? null : null,
      // The new nature's own analyses only: the others are already `dropped`.
      removed: kept.filter((id) => !detached.includes(id)).map(nameOf),
    };
    return { draft: { ...draft, natureId: next.natureId, parameterIds, productTypeId: "", unitCount: 1 }, dropped, reset };
  }
  // The product type stays only while the client may still use it.
  const productTypeId = draft.productTypeId && typeOf(next, draft.productTypeId) ? draft.productTypeId : "";
  return { draft: { ...draft, natureId: next.natureId, parameterIds: kept, productTypeId }, dropped, reset: null };
}

/**
 * « Nature « Huiles » choisie : 2 analyses retirées (« A », « B ») … » — and,
 * into « Autres analyses », the n and the family undone and the analyses
 * that left with the family (D-16).
 */
export function natureChangeNotice(label: string, dropped: string[], current: boolean, reset: OtherAnalysesReset | null = null): string {
  const head = current ? `Nature d'origine « ${label} » rétablie` : `Nature « ${label} » choisie`;
  const quoted = (names: string[]) => names.map((name) => `« ${name} »`).join(", ");
  const removed =
    dropped.length === 0
      ? ""
      : dropped.length === 1
        ? ` : l'analyse « ${dropped[0]} » n'existe pas pour cette nature et a été retirée`
        : ` : ${dropped.length} analyses n'existent pas pour cette nature et ont été retirées (${quoted(dropped)})`;
  const parts = reset
    ? [
        ...(reset.unitCount !== 1 ? [`n ramené à 1 (au lieu de ${reset.unitCount})`] : []),
        ...(reset.productType ? [`famille « ${reset.productType} » retirée`] : []),
      ]
    : [];
  const otherAnalyses = parts.length > 0 ? ` ; ${parts.join(", ")} : une autre analyse se lit sur une seule unité` : "";
  const fromFamily = reset?.removed ?? [];
  const familyAnalyses =
    fromFamily.length === 0
      ? ""
      : fromFamily.length === 1
        ? ` ; l'analyse « ${fromFamily[0]} », venue de cette famille, a été retirée`
        : ` ; ${fromFamily.length} analyses venues de cette famille ont été retirées (${quoted(fromFamily)})`;
  return `${head}${removed}${otherAnalyses}${familyAnalyses}. Enregistrez le programme pour l'appliquer.`;
}

/**
 * Section 1's notice once a nature of « Autres analyses » detached the
 * family (`adoptReferential`, D-16) — « Famille « X » retirée avec la nature
 * « Analyse sensorielle » : n ramené à 1 (au lieu de 5) ; 2 analyses venues
 * de cette famille ont été retirées (…) » — said where the family is shown,
 * not only at the foot of the sheet. A line without a family only had its n
 * lowered.
 */
export function natureDetachNotice(label: string, reset: OtherAnalysesReset): string {
  const head = reset.productType ? `Famille « ${reset.productType} » retirée avec la nature « ${label} »` : `Nature « ${label} »`;
  const removed =
    reset.removed.length === 0
      ? []
      : reset.removed.length === 1
        ? [`l'analyse « ${reset.removed[0]} », venue de cette famille, a été retirée`]
        : [`${reset.removed.length} analyses venues de cette famille ont été retirées (${reset.removed.map((name) => `« ${name} »`).join(", ")})`];
  const parts = [...(reset.unitCount !== 1 ? [`n ramené à 1 (au lieu de ${reset.unitCount})`] : []), ...removed];
  return `${head}${parts.length > 0 ? ` : ${parts.join(" ; ")}` : ""}. Enregistrez le programme pour l'appliquer.`;
}

/**
 * What the sheet shows once the referential of another nature replaced the
 * one on screen (`changeNature`): the draft (`adoptReferential`), the notice
 * — and, in section 1, no notice of an earlier change of family any more
 * (RETOUR-LABO-19-10.md D-15), as after a save: it named the family chosen,
 * which « Analyse sensorielle » may just have detached — « Aucune famille »
 * under « Famille X choisie ». When it did, the old notice is replaced by
 * the detachment (`natureDetachNotice`), amber like a change of family that
 * took something away (F6, never silently): the family, maybe n and
 * analyses, went without being asked for. `savedNatureId` is the nature the
 * sample carries in the database.
 */
export function natureChangeOutcome(
  draft: ProgrammeDraft,
  previous: ProgrammeReferentialData,
  next: ProgrammeReferentialData,
  savedNatureId: string
): { draft: ProgrammeDraft; notice: string; familyNotice: { text: string; tookAway: boolean } | null } {
  const { draft: adopted, dropped, reset } = adoptReferential(draft, previous, next);
  const label = next.natures.find((nature) => nature.id === next.natureId)?.label ?? "choisie";
  return {
    draft: adopted,
    notice: natureChangeNotice(label, dropped, next.natureId === savedNatureId, reset),
    familyNotice: reset ? { text: natureDetachNotice(label, reset), tookAway: true } : null,
  };
}

/** The warning of PROGRAMME.md §3 when the units read are fewer than the type's plans need. */
export function unitWarning(draft: ProgrammeDraft, type: ProductTypeRef | undefined): string | null {
  const needed = typeUnitCount(type);
  if (!type || needed === 0 || draft.unitCount >= needed) return null;
  return `La famille « ${type.name} » attend n = ${needed} ; avec ${draft.unitCount} unité${draft.unitCount > 1 ? "s" : ""} la paillasse lira en indicatif, sans verdict officiel.`;
}

export type BillingLine = { parameterId: string; name: string; unitPrice: number | null };

/**
 * The lines the accountant will be proposed: each analysis at its catalogue
 * price, flagged when it has none. Section 7 of the sheet, computed for a
 * role that sees the billing only (`seesBilling`, the owner's rule of 25/10)
 * — the others receive no price to compute it from.
 */
export function billingLines(
  draft: ProgrammeDraft,
  referential: ProgrammeReferentialData
): { lines: BillingLine[]; total: number; unpriced: number } {
  const lines = draft.parameterIds.flatMap((id) => {
    const parameter = referential.parameters.find((candidate) => candidate.id === id);
    return parameter ? [{ parameterId: id, name: parameter.name, unitPrice: referential.prices[id] ?? null }] : [];
  });
  return {
    lines,
    total: roundMoney(lines.reduce((sum, line) => sum + (line.unitPrice ?? 0), 0)),
    unpriced: lines.filter((line) => line.unitPrice === null).length,
  };
}

/**
 * What the foot of an editable confirmed programme says while an invoice
 * holds the sample (`heldInvoiceFor`): a change of its analyses never
 * reaches that invoice by itself. The invoice's number and what the
 * accountant will do for the administrator; the warning alone for the
 * responsable des paramètres (the owner's rule of 25/10) — never the
 * draft's sentence for an issued invoice.
 */
export function heldInvoiceNotice(invoiced: InvoiceFact): string {
  if (!invoiced.issued) return "Échantillon sur un brouillon de facture : un changement d'analyses est à signaler à la comptabilité.";
  return invoiced.number === null
    ? "Échantillon déjà facturé : un changement d'analyses est à signaler à la comptabilité."
    : `Échantillon déjà facturé (${invoiced.number}) : un changement d'analyses est à signaler à la comptabilité (avoir ou facture complémentaire).`;
}

/**
 * The reception's checklist — the eight rules of the bon de réception, then
 * the contrôles complémentaires (hors bon) — recomputed with the programmed
 * analyses, units, product type and nature (PROGRAMME.md §4, Vérification
 * d'entrée). Every row is informative here: the reception already accepted
 * the line, so a rule it would refuse on is only « à vérifier ». Rule (1)
 * and the ticked control (C5) show what the réceptionniste answered; a line
 * received before the checklist or before the controls has no answer, and
 * says so. C3 (emballage) is no longer asked (16/10, Q70): no row, for any
 * sample — what an older reception answered stays in its « checklist
 * décidée » (the journal). Rule (6) follows the class chosen at reception (a stable
 * food needs no temperature) and rule (8) reads the désignation, the type
 * and the nature on the sheet (12/10).
 */
export function entryChecks(
  sample: Pick<ProgrammeSampleData, "lineKind" | "nature" | "quantity" | "quantityUnit" | "receptionTemperature"> & {
    /** The désignation — rule (8) reads it. */
    produit?: string | null;
    receptionExploitable?: boolean | null;
    receptionIdentificationOk?: boolean | null;
    storageClass?: ProgrammeSampleData["storageClass"];
    receptionTemperatureSource?: ProgrammeSampleData["receptionTemperatureSource"];
    expiryDate?: string | null;
    receivedAt?: string | null;
    serie?: Partial<Pick<ProgrammeSampleData["serie"], "startedAt" | "endedAt" | "arrivedAt" | "samplingTimeDeclared">>;
  },
  draft: ProgrammeDraft,
  referential: ProgrammeReferentialData,
  thresholds: ReceptionThresholds
): ChecklistRow[] {
  const parameterNames = draft.parameterIds.flatMap((id) => {
    const parameter = referential.parameters.find((candidate) => candidate.id === id);
    return parameter ? parameterSpellings(parameter) : [];
  });
  const exploitable = sample.receptionExploitable ?? null;
  // The nature and the type as programmed on the sheet (Q49), else the line's.
  const nature = referential.natures.find((candidate) => candidate.id === draft.natureId) ?? sample.nature;
  const paper = receptionChecklist(
    {
      lineKind: sample.lineKind,
      family: sample.nature.family,
      parameterNames,
      quantity: sample.quantity,
      quantityUnit: sample.quantityUnit,
      receptionTemperature: sample.receptionTemperature,
      unitCount: draft.unitCount,
      storageClass: sample.storageClass ?? null,
      productNames: [sample.produit, typeOf(referential, draft.productTypeId || null)?.name, nature.label],
    },
    thresholds,
    { exploitable, temperatureSource: sample.receptionTemperatureSource ?? null }
  );
  const complementary = complementaryChecklist(
    {
      lineKind: sample.lineKind,
      family: sample.nature.family,
      receptionTemperature: sample.receptionTemperature,
      // The class chosen at reception, else the kind's default.
      storageClass: sample.storageClass ?? null,
      temperatureSource: sample.receptionTemperatureSource ?? null,
      expiryDate: sample.expiryDate ? new Date(sample.expiryDate) : null,
    },
    receptionTiming(sample),
    thresholds,
    { identificationOk: sample.receptionIdentificationOk ?? null }
  );
  return [...paper, ...complementary].map((row): ChecklistRow => {
    if (row.key === "EXPLOITABLE" && exploitable === null) {
      return { ...row, status: "A_VERIFIER", detail: "Non renseigné : échantillon réceptionné avant la checklist" };
    }
    // A ticked control left unanswered: the line was received before the controls.
    if (row.code && row.status === "A_CONFIRMER") {
      return {
        ...row,
        status: "A_VERIFIER",
        detail: "Non renseigné : échantillon réceptionné avant les contrôles complémentaires",
      };
    }
    return row.status === "NON_CONFORME" ? { ...row, status: "A_VERIFIER" } : row;
  });
}

/**
 * The série's times and the reception instant as received — C1 and C7
 * recomputed; a payload without the série's times leaves C1 uncomputed.
 */
function receptionTiming(sample: {
  receivedAt?: string | null;
  serie?: Partial<Pick<ProgrammeSampleData["serie"], "startedAt" | "endedAt" | "arrivedAt" | "samplingTimeDeclared">>;
}): ComplementarySerie {
  const serie = sample.serie;
  return {
    startedAt: serie?.startedAt ? new Date(serie.startedAt) : null,
    endedAt: serie?.endedAt ? new Date(serie.endedAt) : null,
    arrivedAt: serie?.arrivedAt ? new Date(serie.arrivedAt) : null,
    samplingTimeDeclared: serie?.samplingTimeDeclared ?? null,
    receivedAt: sample.receivedAt ? new Date(sample.receivedAt) : null,
  };
}

/** Who holds the line at the bench, as the sheet says it. */
export type BenchHolder = {
  /** « Yassine », or « Yassine · Imane » when analyses were handed out before 13/10. */
  names: string;
  /** More than one technician holds part of the line (before 13/10). */
  several: boolean;
  /** When the sample was taken; null for a line held only through its analyses, or assigned before 13/10 without a stamp. */
  assignedAt: string | null;
};

/**
 * Who holds the line at the bench (« prise en charge libre », 13/10): the
 * technician who took it, then any technician a programme before 13/10
 * handed one of its analyses to — the names « Analysé par » shows at the
 * validation (`reportTechnicianNames`). Null = nobody (`isUnclaimed`):
 * once confirmed, the line waits in « À prendre ».
 */
export function benchHolder(
  sample: Pick<ProgrammeSampleData, "technicianId" | "technician" | "assignedAt"> & {
    parameters: Pick<ProgrammeSampleData["parameters"][number], "technicianId" | "technician">[];
  }
): BenchHolder | null {
  if (isUnclaimed(sample)) return null;
  const ids = new Set([sample.technicianId, ...sample.parameters.map((parameter) => parameter.technicianId)]);
  ids.delete(null);
  return {
    names: reportTechnicianNames(sample) ?? "un technicien",
    several: ids.size > 1,
    assignedAt: sample.technicianId ? sample.assignedAt : null,
  };
}

/** Who becomes responsible for a free line — the bench's rule, in words. */
const FIRST_TAKER = "le premier technicien qui le prend en charge (ou saisit un premier résultat) en devient responsable";

/**
 * The line the « Organisation » section shows about the bench: who took the
 * sample and when — and, while the programme can still change, that the
 * holder will see the change — or where the sample waits for a technician.
 */
export function benchHolderNotice(
  holder: BenchHolder | null,
  state: { status: SampleStatus; analysisBlocked: boolean; editable: boolean }
): string {
  if (holder) {
    const when = holder.assignedAt ? ` le ${formatDateTime(holder.assignedAt)}` : "";
    const visible =
      state.status === "PROGRAMME" && state.editable
        ? ` Une modification du programme ${holder.several ? "leur" : "lui"} sera visible à la paillasse.`
        : "";
    return `Pris en charge par ${holder.names}${when}.${visible}`;
  }
  if (state.status === "PRELEVE" || state.status === "RECU") {
    return `Aucun technicien n'est attribué : après la confirmation, l'échantillon rejoint la liste « À prendre » de la paillasse ; ${FIRST_TAKER}.`;
  }
  // On the bench with nobody on it — programmed, or started by an
  // administrator standing in (who never takes): the shared list.
  if (BENCH_STATUSES.includes(state.status)) {
    return state.analysisBlocked
      ? "Aucun technicien ne l'a pris en charge : bloqué en réception, l'échantillon n'apparaît dans « À prendre » qu'une fois libéré."
      : `Aucun technicien ne l'a encore pris en charge : l'échantillon attend dans la liste « À prendre » de la paillasse ; ${FIRST_TAKER}.`;
  }
  return "Aucun technicien n'a pris cet échantillon en charge à la paillasse.";
}

/** The notice of a confirmation that went through: who already holds the sample, else « À prendre ». */
export function confirmationNotice(holder: BenchHolder | null): string {
  return holder
    ? `Programme confirmé : l'échantillon est déjà pris en charge par ${holder.names}.`
    : "Programme confirmé : l'échantillon rejoint la liste « À prendre » de la paillasse.";
}

const text = (value: string) => (value.trim() ? value.trim() : null);

/**
 * The body of `PUT /api/samples/[id]/programme` (PROGRAMME.md §5) — never a
 * technician: the route would ignore one anyway (13/10).
 */
export function toRequestBody(draft: ProgrammeDraft, confirm: boolean) {
  return {
    confirm,
    // The current nature means « no change » to the route (Q49).
    natureId: draft.natureId || null,
    productTypeId: draft.productTypeId || null,
    parameterIds: draft.parameterIds,
    unitCount: draft.unitCount,
    testPortion: text(draft.testPortion),
    priority: draft.priority,
    dueAt: draft.dueAt ? fromLocalInput(draft.dueAt) : null,
    programmeNote: text(draft.programmeNote),
    parameters: draft.parameterIds.map((parameterId) => {
      const setting = settingOf(draft, parameterId);
      return {
        parameterId,
        normVersionId: setting.normVersionId || null,
        dilutionFactor: text(setting.dilutionFactor),
        note: text(setting.note),
      };
    }),
  };
}

/**
 * Why the programme sheet is read-only, or null while it may be edited
 * (PROGRAMME.md §5). Once the bench has started (16/10, Q128 — RP3b (a)),
 * the analyses — their list, the product type, the number of units — are
 * changed by the responsable des paramètres or the administrator through
 * the correction verb below the sheet, with a reason; the identification by
 * the reception, the validation or the administrator. The text names the
 * verb this person has, or who to ask.
 */
export function programmeReadOnlyReason(
  state: { editable: boolean; status: SampleStatus; analysisBlocked: boolean; cancelReason: CancelReason | null },
  role: Role
): string | null {
  if (state.editable) return null;
  if (state.status === "PRELEVE") {
    return "Cet échantillon n'est pas encore réceptionné : le programme se décide après la réception.";
  }
  if (state.status === "ANNULE") {
    const reason = state.cancelReason ? ` (${CANCEL_REASON_LABELS[state.cancelReason]})` : "";
    return `Échantillon annulé${reason} : seul un administrateur peut le réactiver.`;
  }
  if (state.analysisBlocked) {
    return "Échantillon bloqué en réception : il doit être libéré depuis « Bloqués » de la réception avant la programmation.";
  }
  if (!CORRECTABLE_STATUSES.includes(state.status)) {
    return "Fiche en lecture seule : l'échantillon est validé. Un changement passe par la réouverture du rapport pour amendement.";
  }
  const rights = correctionRights(role, state.status);
  const how = rights.analyses
    ? `par « ${correctionLabel(rights)} » ci-dessous, avec un motif`
    : "par le responsable des paramètres ou l'administrateur, avec un motif";
  return `Fiche en lecture seule : la paillasse a commencé. Les analyses, la famille de produits et le nombre d'unités se changent désormais ${how} ; l'identification de l'échantillon, par la réception, la validation ou l'administrateur.`;
}

/**
 * What the sheet says under the correction verbs about what is not this
 * person's (16/10, Q128), or null: nothing to add for whoever corrects the
 * identification, nor once the sample is approved, sent or cancelled. The
 * identification is `FICHE_CORRECTION_ROLES`' at every step; who cancels
 * depends on the step (16/10, Q13 — the state machine, `cancellersLabel`):
 * the réception and the administrator before the programme, the validation,
 * the Direction and the administrator from it.
 */
export function programmeVerbsNote(role: Role, status: SampleStatus): string | null {
  if (!CORRECTABLE_STATUSES.includes(status)) return null;
  const rights = correctionRights(role, status);
  if (rights.identification) return null;
  const cancellers = cancellersLabel(status, true);
  const elsewhere = `l'identification de l'échantillon (désignation, quantité, lot…) relève de la réception, de la validation ou de l'administrateur${
    cancellers ? ` ; son annulation, ${cancellers}` : ""
  }.`;
  if (rights.analyses) return `Les analyses se changent par « ${correctionLabel(rights)} » ; ${elsewhere}`;
  return `Les analyses se changent sur cette fiche tant que la paillasse n'a pas commencé ; ${elsewhere}`;
}

/**
 * The lead-in to the verbs under the sheet's « Vérification d'entrée »:
 * names only what the verbs offered to this person do — the responsable des
 * paramètres at the bench has « Corriger les analyses », never « Annuler ».
 */
export function programmeVerbsLead(verbs: { correct: boolean; correctAnalyses: boolean; cancel: boolean; reactivate: boolean }): string {
  const correcting = verbs.correct || verbs.correctAnalyses;
  const count = [correcting, verbs.cancel, verbs.reactivate].filter(Boolean).length;
  const what =
    correcting && verbs.cancel
      ? "Une correction ou une annulation"
      : correcting
        ? "Une correction"
        : verbs.cancel
          ? "Une annulation"
          : verbs.reactivate
            ? "Une réactivation"
            : null;
  return what ? `${what} passe par ${count > 1 ? "les verbes" : "le verbe"} ci-dessous.` : "";
}
