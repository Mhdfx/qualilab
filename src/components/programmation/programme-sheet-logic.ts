import type { Family, ProgrammePriority } from "@/generated/prisma/enums";
import { pickCriterion } from "@/lib/interpretation";
import { ANALYSIS_FAMILY_LABELS } from "@/lib/labels";
import { roundMoney } from "@/lib/invoice-math";
import { evaluateReception, type Check, type ReceptionThresholds } from "@/lib/reception-rules";
import { MAX_UNITS } from "@/lib/series";
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
 * how a product type, a profile or a shortcut rewrites the draft, what the
 * entry check and the billing preview show. Pure, so the tests beside it pin
 * the behaviour the responsable des paramètres sees; the route validates
 * everything again (`programme-input.ts`).
 */

export type ParameterSetting = {
  /** "" = the sample's technician. */
  technicianId: string;
  /** "" = no explicit version (the bench then reads the criterion's, else the parameter's). */
  normVersionId: string;
  /** As typed (« 10 », « 2,5 »); "" = none. The server parses it. */
  dilutionFactor: string;
  note: string;
};

export type ProgrammeDraft = {
  /**
   * The nature the programme is written for (RETOUR-LABO-06-10.md §5, V3 —
   * Q49): the line's own until the sheet picks another of the same family.
   * It is always the nature of the referential on screen.
   */
  natureId: string;
  productTypeId: string;
  parameterIds: string[];
  unitCount: number;
  testPortion: string;
  /** "" = no default technician. */
  technicianId: string;
  priority: ProgrammePriority;
  /** `datetime-local` wall time on the laboratory's clock; "" = none. */
  dueAt: string;
  programmeNote: string;
  /** Kept for every parameter, ticked or not: unticking then re-ticking loses nothing. */
  settings: Record<string, ParameterSetting>;
};

export const UNIT_CHOICES = [1, 3, 5, 9] as const;

const EMPTY_SETTING: ParameterSetting = { technicianId: "", normVersionId: "", dilutionFactor: "", note: "" };

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

/** The sheet as it opens: the stored programme, or what the préleveur ticked before any programme. */
export function initialDraft(
  programme: ProgrammeState,
  referential: ProgrammeReferentialData
): ProgrammeDraft {
  const known = new Set(referential.parameters.map((parameter) => parameter.id));
  const type = typeOf(referential, programme.productTypeId);
  const parameterIds = programme.parameterIds.filter((id) => known.has(id));
  const settings: Record<string, ParameterSetting> = {};
  for (const entry of programme.parameters) {
    if (!known.has(entry.parameterId)) continue;
    settings[entry.parameterId] = {
      technicianId: entry.technicianId ?? "",
      normVersionId: entry.normVersionId ?? "",
      dilutionFactor: dilutionText(entry.dilutionFactor),
      note: entry.note ?? "",
    };
  }
  for (const id of parameterIds) settings[id] = withDefaults(settings, id, type, referential);
  const technicianId = programme.technicianId ?? "";
  return {
    natureId: referential.natureId || programme.natureId,
    productTypeId: type?.id ?? "",
    parameterIds,
    unitCount: clampUnits(programme.unitCount),
    testPortion: programme.testPortion ?? "",
    technicianId: referential.technicians.some((technician) => technician.id === technicianId) ? technicianId : "",
    priority: programme.priority,
    dueAt: programme.dueAt ? toLocalInput(new Date(programme.dueAt)) : "",
    programmeNote: programme.programmeNote ?? "",
    settings,
  };
}

/**
 * Choosing a type ADDS its germs to the analyses, raises n to what its plans
 * read and proposes the criterion's norm version — never removes an analysis
 * the préleveur asked for. « — aucun — » only detaches the type.
 */
export function applyProductType(
  draft: ProgrammeDraft,
  typeId: string,
  referential: ProgrammeReferentialData
): ProgrammeDraft {
  const type = typeOf(referential, typeId);
  if (!type) return { ...draft, productTypeId: "" };
  const known = new Set(referential.parameters.map((parameter) => parameter.id));
  const criteria = criteriaOf(type).filter((criterion) => known.has(criterion.parameterId));
  const parameterIds = [...new Set([...draft.parameterIds, ...criteria.map((criterion) => criterion.parameterId)])];
  const settings = { ...draft.settings };
  for (const criterion of criteria) {
    const current = withDefaults(settings, criterion.parameterId, type, referential);
    const fromCriterion = criterionVersion(criterion.parameterId, type, referential);
    settings[criterion.parameterId] = fromCriterion ? { ...current, normVersionId: fromCriterion } : current;
  }
  const needed = typeUnitCount(type);
  return {
    ...draft,
    productTypeId: type.id,
    parameterIds,
    settings,
    unitCount: needed > 0 ? clampUnits(Math.max(draft.unitCount, needed)) : draft.unitCount,
  };
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
    unitCount: clampUnits(Math.max(profile.unitCount, typeUnitCount(type))),
  };
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

export function toggleParameter(
  draft: ProgrammeDraft,
  parameterId: string,
  referential: ProgrammeReferentialData
): ProgrammeDraft {
  if (draft.parameterIds.includes(parameterId)) {
    return { ...draft, parameterIds: draft.parameterIds.filter((id) => id !== parameterId) };
  }
  const type = typeOf(referential, draft.productTypeId);
  return {
    ...draft,
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

/** « Tous à X » : X becomes the default, every per-parameter override is lifted. */
export function assignAll(draft: ProgrammeDraft, technicianId: string): ProgrammeDraft {
  const settings: Record<string, ParameterSetting> = {};
  for (const [id, setting] of Object.entries(draft.settings)) settings[id] = { ...setting, technicianId: "" };
  return { ...draft, technicianId, settings };
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

/** True when the programmed analyses span both families: « micro à X, chimie à Y » then means something. */
export function spansFamilies(draft: ProgrammeDraft, families: Map<string, Family>): boolean {
  const seen = new Set(draft.parameterIds.map((id) => families.get(id)));
  return seen.has("MICRO") && seen.has("CHIMIE");
}

/** « Micro à X, chimie à Y » : X becomes the default, the chemistry parameters carry Y. */
export function assignByFamily(
  draft: ProgrammeDraft,
  families: Map<string, Family>,
  micro: string,
  chimie: string
): ProgrammeDraft {
  const settings = { ...draft.settings };
  for (const id of draft.parameterIds) {
    const override = families.get(id) === "CHIMIE" && chimie !== micro ? chimie : "";
    settings[id] = { ...settingOf(draft, id), technicianId: override };
  }
  return { ...draft, technicianId: micro, settings };
}

/**
 * The natures the sheet offers (Q49 by default): the line's current one —
 * even archived, it stays readable — and the active natures of its family.
 * The other family is another sample, never a choice here.
 */
export function natureChoices(referential: ProgrammeReferentialData, family: Family): ProgrammeNatureData[] {
  return referential.natures.filter((nature) => nature.current || (nature.active && nature.family === family));
}

/**
 * The draft once the referential of another nature replaced the one on
 * screen: the nature follows, and the analyses the new nature does not
 * offer are dropped — their names are returned so the sheet can say which.
 * Everything else (type, units, organisation, the settings of every
 * analysis) is kept: re-choosing the first nature loses nothing but the
 * dropped analyses, which the user ticks again.
 */
export function adoptReferential(
  draft: ProgrammeDraft,
  previous: ProgrammeReferentialData,
  next: ProgrammeReferentialData
): { draft: ProgrammeDraft; dropped: string[] } {
  const known = new Set(next.parameters.map((parameter) => parameter.id));
  const kept = draft.parameterIds.filter((id) => known.has(id));
  const dropped = draft.parameterIds
    .filter((id) => !known.has(id))
    .map((id) => previous.parameters.find((parameter) => parameter.id === id)?.name ?? id);
  // The product type stays only while the client may still use it.
  const productTypeId = draft.productTypeId && typeOf(next, draft.productTypeId) ? draft.productTypeId : "";
  return { draft: { ...draft, natureId: next.natureId, parameterIds: kept, productTypeId }, dropped };
}

/** « Nature « Huiles » choisie : 2 analyses retirées (« A », « B ») … ». */
export function natureChangeNotice(label: string, dropped: string[], current: boolean): string {
  const head = current ? `Nature d'origine « ${label} » rétablie` : `Nature « ${label} » choisie`;
  const removed =
    dropped.length === 0
      ? ""
      : dropped.length === 1
        ? ` : l'analyse « ${dropped[0]} » n'existe pas pour cette nature et a été retirée`
        : ` : ${dropped.length} analyses n'existent pas pour cette nature et ont été retirées (${dropped.map((name) => `« ${name} »`).join(", ")})`;
  return `${head}${removed}. Enregistrez le programme pour l'appliquer.`;
}

/** The warning of PROGRAMME.md §3 when the units read are fewer than the type's plans need. */
export function unitWarning(draft: ProgrammeDraft, type: ProductTypeRef | undefined): string | null {
  const needed = typeUnitCount(type);
  if (!type || needed === 0 || draft.unitCount >= needed) return null;
  return `Le type « ${type.name} » attend n = ${needed} ; avec ${draft.unitCount} unité${draft.unitCount > 1 ? "s" : ""} la paillasse lira en indicatif, sans verdict officiel.`;
}

export type BillingLine = { parameterId: string; name: string; unitPrice: number | null };

/** The lines the accountant will be proposed: each analysis at its catalogue price, flagged when it has none. */
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
 * The reception's acceptance rules, recomputed with the programmed analyses
 * and units (PROGRAMME.md §4, Vérification d'entrée). Never blocking here —
 * the reception already accepted the line — so a rule the reception would
 * refuse on is only a warning.
 */
export function entryChecks(
  sample: Pick<ProgrammeSampleData, "lineKind" | "nature" | "quantity" | "quantityUnit" | "receptionTemperature">,
  draft: ProgrammeDraft,
  referential: ProgrammeReferentialData,
  thresholds: ReceptionThresholds
): Check[] {
  const parameterNames = draft.parameterIds.flatMap((id) => {
    const parameter = referential.parameters.find((candidate) => candidate.id === id);
    return parameter ? [parameter.name] : [];
  });
  return evaluateReception(
    {
      lineKind: sample.lineKind,
      family: sample.nature.family,
      parameterNames,
      quantity: sample.quantity,
      quantityUnit: sample.quantityUnit,
      receptionTemperature: sample.receptionTemperature,
      unitCount: draft.unitCount,
    },
    thresholds
  ).map((check) => (check.level === "BLOQUANT" ? { ...check, level: "AVERTISSEMENT" } : check));
}

const text = (value: string) => (value.trim() ? value.trim() : null);

/** The body of `PUT /api/samples/[id]/programme` (PROGRAMME.md §5). */
export function toRequestBody(draft: ProgrammeDraft, confirm: boolean) {
  return {
    confirm,
    // The current nature means « no change » to the route (Q49).
    natureId: draft.natureId || null,
    productTypeId: draft.productTypeId || null,
    parameterIds: draft.parameterIds,
    unitCount: draft.unitCount,
    testPortion: text(draft.testPortion),
    technicianId: draft.technicianId || null,
    priority: draft.priority,
    dueAt: draft.dueAt ? fromLocalInput(draft.dueAt) : null,
    programmeNote: text(draft.programmeNote),
    parameters: draft.parameterIds.map((parameterId) => {
      const setting = settingOf(draft, parameterId);
      return {
        parameterId,
        technicianId: setting.technicianId || null,
        normVersionId: setting.normVersionId || null,
        dilutionFactor: text(setting.dilutionFactor),
        note: text(setting.note),
      };
    }),
  };
}
