import type { CancelReason, Family, ProgrammePriority, SampleStatus } from "@/generated/prisma/enums";
import { BENCH_STATUSES, isUnclaimed } from "@/lib/bench-access";
import { pickCriterion } from "@/lib/interpretation";
import { ANALYSIS_FAMILY_LABELS, CANCEL_REASON_LABELS, formatDateTime } from "@/lib/labels";
import { roundMoney } from "@/lib/invoice-math";
import {
  parameterSpellings,
  receptionChecklist,
  type ChecklistRow,
  type ReceptionThresholds,
} from "@/lib/reception-rules";
import { complementaryChecklist, type ComplementarySerie } from "@/lib/reception-complementary";
import { reportTechnicianNames } from "@/lib/report-programme";
import type { Role } from "@/lib/roles";
import { CORRECTABLE_STATUSES } from "@/lib/sample-status";
import { cancellersLabel, correctionLabel, correctionRights } from "@/lib/sample-verbs";
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
   * Q49): the line's own until the sheet picks another of the same family.
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
 * Everything else (type, units, priority and dates, the settings of every
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
  return `Fiche en lecture seule : la paillasse a commencé. Les analyses, le type de produit et le nombre d'unités se changent désormais ${how} ; l'identification de l'échantillon, par la réception, la validation ou l'administrateur.`;
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
