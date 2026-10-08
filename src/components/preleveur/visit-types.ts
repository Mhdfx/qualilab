import type {
  AirMethod,
  Family,
  HandsState,
  LineKind,
  QuantityUnit,
  SampleType,
  SurfaceState,
} from "@/generated/prisma/enums";
import { fromLabWallTime, toLabWallTime } from "@/lib/lab-time";
import { AIR_METHOD_LABELS, LINE_KIND_LABELS, withSurfaceState } from "@/lib/labels";
import {
  LINE_FAMILIES,
  defaultFamiliesFor,
  familiesFor,
  natureFor,
  type LineFamily,
  type NatureRef,
} from "@/lib/nature-family";
import { SERIE_MESSAGES } from "@/lib/serie-input";

/** Shapes shared by the visit screens (client side). No Prisma client here:
 * a server page imports `lineDesignation` from this module too. */

export type { LineFamily };

export type NatureOption = {
  id: string;
  code: string;
  label: string;
  family: Family;
  defaultLineKind: LineKind;
  legacyType: SampleType;
};

export type ClientOption = {
  id: string;
  name: string;
  sites?: { id: string; name: string }[];
};

/**
 * One analysis of the catalogue (`GET /api/parameters`). `family` is
 * `AnalysisParameter.family` (RETOUR-LABO-06-10.md §5, V3): the analyses
 * proposed on a sample are grouped by it. Optional only so that an older
 * payload still reads — a parameter without it counts as MICRO, the
 * column's default.
 */
export type ParameterOption = { id: string; name: string; unit?: string | null; family?: Family | null };

/** A panel of analyses proposed in one tap (client-specific ones first). */
export type ProfileOption = {
  id: string;
  name: string;
  natureId: string;
  clientId: string | null;
  unitCount: number;
  parameterIds: string[];
};

/** A product type of the catalogue (CRITERES.md): its germs and its n. */
export type ProductTypeOption = {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  criteriaCount: number;
  parameterIds: string[];
  unitCount: number;
};

export type ClientMemory = { places: string[]; products: string[] };

/** The forms' suggestions: the client's memory first, then what this visit already typed. */
export function mergeSuggestions(memory: string[], typed: string[]) {
  return [...new Set([...memory, ...typed.map((s) => s.trim()).filter(Boolean)])];
}

/**
 * One sample of the protocol as the form holds it (« Échantillon N » on
 * screen; `lineNumber` / `lineKind` in the code).
 *
 * `analysesMicro` / `analysesChimie` are the sample's two boxes
 * (RETOUR-LABO-06-10.md §5, V3). `natureId` is DERIVED from the type × the
 * first ticked box (micro first) — never picked by hand — and is "" when no
 * box is ticked. The micro and physico-chemistry natures of one type share
 * the same parameter category, so `natureId` (or `lineCategory`) is what the
 * form loads the analyses with.
 */
export type LineDraft = {
  key: string;
  natureId: string;
  lineKind: LineKind;
  analysesMicro: boolean;
  analysesChimie: boolean;
  produit: string;
  productTypeId: string;
  lieu: string;
  numeroLot: string;
  productionDate: string;
  expiryDate: string;
  quantity: string;
  quantityUnit: QuantityUnit;
  productTemperature: string;
  ambientTemperature: string;
  /** « Désignation » of a Surface line (ex-« Surface prélevée »). */
  surfaceLabel: string;
  /** « État de la surface » of a Surface line; "" = not chosen yet. */
  surfaceState: SurfaceState | "";
  /** « Surface prélevée (cm²) » of a Surface line (ex-« Aire prélevée »). */
  surfaceAreaCm2: string;
  /** « Méthode de prélèvement » of an Air line; "" = not chosen yet. */
  airMethod: AirMethod | "";
  personName: string;
  personRole: string;
  handsState: HandsState | "";
  remarks: string;
  unitCount: number;
  parameterIds: string[];
};

let keySeed = 0;
export function newKey() {
  keySeed += 1;
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `line-${Date.now()}-${keySeed}`;
}

// ---- the two boxes of a sample ------------------------------------------------

/** The ticked boxes of a sample, in display order (micro first). */
export function lineFamilies(line: { analysesMicro: boolean; analysesChimie: boolean }): LineFamily[] {
  return LINE_FAMILIES.filter((family) => (family === "MICRO" ? line.analysesMicro : line.analysesChimie));
}

/** The two flags of a set of families. */
export function familyFlags(families: readonly LineFamily[]): { analysesMicro: boolean; analysesChimie: boolean } {
  return { analysesMicro: families.includes("MICRO"), analysesChimie: families.includes("CHIMIE") };
}

/**
 * Whether a box can be ticked on a sample of this type: « OK », greyed out
 * by the table (« NOT_FOR_KIND »: air × physico-chimie, autre × micro…), or
 * greyed out because the catalogue has no active nature for it (« MISSING »).
 */
export type FamilyStatus = "OK" | "NOT_FOR_KIND" | "MISSING";

export function familyStatus(natures: readonly NatureRef[], kind: LineKind, family: LineFamily): FamilyStatus {
  if (!familiesFor(kind).includes(family)) return "NOT_FOR_KIND";
  return natureFor(natures, kind, family) ? "OK" : "MISSING";
}

/** The boxes a sample of this type may tick with this catalogue. */
export function availableFamilies(natures: readonly NatureRef[], kind: LineKind): LineFamily[] {
  return familiesFor(kind).filter((family) => familyStatus(natures, kind, family) === "OK");
}

/**
 * The boxes of a sample of this type: the wanted ones that the type and the
 * catalogue allow, otherwise the type's default (micro, or physico-chimie
 * for « Autre »), otherwise the first available box. Empty only when the
 * catalogue has no nature at all for the type.
 */
export function resolveFamilies(
  natures: readonly NatureRef[],
  kind: LineKind,
  wanted?: readonly LineFamily[]
): LineFamily[] {
  const available = availableFamilies(natures, kind);
  const kept = available.filter((family) => wanted?.includes(family));
  if (kept.length > 0) return kept;
  const defaults = defaultFamiliesFor(kind).filter((family) => available.includes(family));
  return defaults.length > 0 ? defaults : available.slice(0, 1);
}

/** The nature `natureId` holds: the one of the first ticked box (micro first). */
export function primaryNature<N extends NatureRef>(
  natures: readonly N[],
  kind: LineKind,
  families: readonly LineFamily[]
): N | undefined {
  for (const family of LINE_FAMILIES) {
    if (!families.includes(family)) continue;
    const nature = natureFor(natures, kind, family);
    if (nature) return nature;
  }
  return undefined;
}

/** The nature of each ticked box — one sample each once saved (« 1/26-1M », « 1/26-1P »). */
export function lineNatures<N extends NatureRef>(
  natures: readonly N[],
  line: Pick<LineDraft, "lineKind" | "analysesMicro" | "analysesChimie">
): { family: LineFamily; nature: N }[] {
  return lineFamilies(line).flatMap((family) => {
    const nature = natureFor(natures, line.lineKind, family);
    return nature ? [{ family, nature }] : [];
  });
}

/** The ids of `lineNatures` — e.g. to keep the profiles of a sample. */
export function lineNatureIds(
  natures: readonly NatureRef[],
  line: Pick<LineDraft, "lineKind" | "analysesMicro" | "analysesChimie">
): string[] {
  return lineNatures(natures, line).map(({ nature }) => nature.id);
}

/** The parameter category of a type: the one its natures share. */
export function kindCategory(
  natures: readonly (NatureRef & { legacyType: SampleType })[],
  kind: LineKind
): SampleType | undefined {
  for (const family of familiesFor(kind)) {
    const nature = natureFor(natures, kind, family);
    if (nature) return nature.legacyType;
  }
  return undefined;
}

/**
 * The category whose parameters a sample proposes (`/api/parameters?category=`):
 * its derived nature's, or — no box ticked yet — its type's. Load it for
 * every line, then pass that list as `parameters` to the LineEditor.
 */
export function lineCategory(
  natures: readonly (NatureRef & { legacyType: SampleType })[],
  line: Pick<LineDraft, "natureId" | "lineKind">
): SampleType | undefined {
  return natures.find((n) => n.id === line.natureId)?.legacyType ?? kindCategory(natures, line.lineKind);
}

// ---- the analyses, grouped by family ------------------------------------------

/** The family of a parameter (MICRO when the payload predates the column). */
export function parameterFamily(parameter: Pick<ParameterOption, "family">): Family {
  return parameter.family ?? "MICRO";
}

/** The parameters shown under the ticked boxes, in the catalogue's order. */
export function visibleParameters<P extends ParameterOption>(
  parameters: readonly P[],
  families: readonly LineFamily[]
): P[] {
  return parameters.filter((p) => (families as readonly Family[]).includes(parameterFamily(p)));
}

/** The ticked analyses that stay once only `families` are ticked; an id the
 * list does not know (still loading) is kept. */
function keepFamilies(ids: readonly string[], families: readonly LineFamily[], parameters?: readonly ParameterOption[]) {
  if (!parameters) return [...ids];
  const byId = new Map(parameters.map((p) => [p.id, p]));
  return ids.filter((id) => {
    const parameter = byId.get(id);
    return !parameter || (families as readonly Family[]).includes(parameterFamily(parameter));
  });
}

/** The profile's analyses that the sample shows (its category, a ticked box). */
export function profileParameterIds(
  profile: Pick<ProfileOption, "parameterIds">,
  parameters: readonly ParameterOption[],
  families: readonly LineFamily[]
): string[] {
  const visible = new Set(visibleParameters(parameters, families).map((p) => p.id));
  return profile.parameterIds.filter((id) => visible.has(id));
}

/**
 * Applying a profile replaces the analyses of ITS family (or families) and
 * sets n — the other box's analyses stay ticked.
 */
export function applyProfilePatch(
  line: Pick<LineDraft, "parameterIds" | "analysesMicro" | "analysesChimie">,
  profile: Pick<ProfileOption, "parameterIds" | "unitCount">,
  parameters: readonly ParameterOption[]
): Partial<LineDraft> {
  const families = lineFamilies(line);
  const ids = profileParameterIds(profile, parameters, families);
  const byId = new Map(parameters.map((p) => [p.id, p]));
  const touched = new Set(ids.map((id) => parameterFamily(byId.get(id)!)));
  const visible = new Set(visibleParameters(parameters, families).map((p) => p.id));
  const kept = line.parameterIds.filter((id) => visible.has(id) && !touched.has(parameterFamily(byId.get(id)!)));
  return { parameterIds: [...new Set([...kept, ...ids])], unitCount: profile.unitCount };
}

/** A profile is « applied » when its family's ticked analyses are exactly its own. */
export function isProfileApplied(
  line: Pick<LineDraft, "parameterIds" | "analysesMicro" | "analysesChimie">,
  profile: Pick<ProfileOption, "parameterIds">,
  parameters: readonly ParameterOption[]
): boolean {
  const families = lineFamilies(line);
  const ids = profileParameterIds(profile, parameters, families);
  if (ids.length === 0) return false;
  const byId = new Map(parameters.map((p) => [p.id, p]));
  const touched = new Set(ids.map((id) => parameterFamily(byId.get(id)!)));
  const visible = new Set(visibleParameters(parameters, families).map((p) => p.id));
  const ticked = line.parameterIds.filter((id) => visible.has(id) && touched.has(parameterFamily(byId.get(id)!)));
  return ticked.length === ids.length && ids.every((id) => ticked.includes(id));
}

// ---- edits that keep a draft consistent ---------------------------------------

/**
 * Ticking / unticking the boxes: the derived nature follows, and the
 * analyses of an unticked box go — a hidden analysis is never sent. A box
 * the type or the catalogue does not allow is ignored. No box ticked is a
 * valid draft (`lineDraftError` refuses it at save).
 */
export function familiesPatch(
  natures: readonly NatureRef[],
  line: Pick<LineDraft, "lineKind" | "parameterIds">,
  families: readonly LineFamily[],
  parameters?: readonly ParameterOption[]
): Partial<LineDraft> {
  const available = availableFamilies(natures, line.lineKind);
  const kept = LINE_FAMILIES.filter((family) => families.includes(family) && available.includes(family));
  return {
    ...familyFlags(kept),
    natureId: primaryNature(natures, line.lineKind, kept)?.id ?? "",
    parameterIds: keepFamilies(line.parameterIds, kept, parameters),
  };
}

/**
 * Changing the type of a sample. The ticked boxes the new type still allows
 * stay ticked; when none does — or when the boxes were just the old type's
 * default, untouched — the new type's default applies (so a tap on
 * « Autre » and back does not leave a food sample in physico-chimie). The
 * analyses stay when the category does not change (filtered by box), and
 * restart otherwise. Fields the new type does not show: the chosen state /
 * method are cleared, typed text is kept (a mis-tap costs nothing) and
 * `linePayload` leaves it out. `parameters` = the list currently shown
 * (old category); `fallbackUnit` = the unit a line leaving « Eau » (litres)
 * takes — « UNITE » on a visit, « G » at the counter.
 */
export function kindPatch(
  natures: readonly (NatureRef & { legacyType: SampleType })[],
  line: LineDraft,
  kind: LineKind,
  options: { parameters?: readonly ParameterOption[]; fallbackUnit?: QuantityUnit } = {}
): Partial<LineDraft> {
  const ticked = lineFamilies(line);
  const oldDefaults = resolveFamilies(natures, line.lineKind);
  const untouched = ticked.length > 0 && sameFamilies(ticked, oldDefaults);
  const families = resolveFamilies(natures, kind, untouched ? undefined : ticked);
  const from = lineCategory(natures, line);
  const to = kindCategory(natures, kind);
  const sameCategory = from !== undefined && from === to;
  const fallbackUnit = options.fallbackUnit ?? "UNITE";
  return {
    lineKind: kind,
    ...familyFlags(families),
    natureId: primaryNature(natures, kind, families)?.id ?? "",
    parameterIds: sameCategory ? keepFamilies(line.parameterIds, families, options.parameters) : [],
    // A product type only exists on a food line (and its germs went with the category).
    productTypeId: kind === "ALIMENT" ? line.productTypeId : "",
    quantityUnit: kind === "EAU" ? "L" : line.quantityUnit === "L" ? fallbackUnit : line.quantityUnit,
    // L'aire de 100 cm² est la valeur d'usage d'une ligne surface : on la
    // propose en y entrant, on la retire en en sortant.
    surfaceAreaCm2:
      kind === "SURFACE" ? line.surfaceAreaCm2 || "100" : line.surfaceAreaCm2 === "100" ? "" : line.surfaceAreaCm2,
    surfaceState: kind === "SURFACE" ? line.surfaceState : "",
    airMethod: kind === "AIR" ? line.airMethod : "",
  };
}

function sameFamilies(a: readonly LineFamily[], b: readonly LineFamily[]) {
  return a.length === b.length && a.every((family) => b.includes(family));
}


/**
 * A new sample. With the catalogue's natures and the previous sample, it
 * continues the previous one: same type, same boxes, same analyses, same
 * place and ambient temperature (and the air method of an air sample) —
 * a visit usually swabs several surfaces in a row. Without a previous
 * sample: a food sample with the type's default box (micro).
 */
export function emptyLine(natures: readonly NatureOption[], previous?: LineDraft): LineDraft {
  const kind: LineKind = previous?.lineKind ?? "ALIMENT";
  // A new sample starts on its type's default box (microbiology): the
  // physico-chimie box is ticked on purpose, never inherited — inherited, it
  // silently doubled the next sample (recette 07/10). « Dupliquer » copies all.
  const families = resolveFamilies(natures, kind);
  return {
    key: newKey(),
    natureId: primaryNature(natures, kind, families)?.id ?? "",
    lineKind: kind,
    ...familyFlags(families),
    produit: "",
    productTypeId: "",
    lieu: previous?.lieu ?? "",
    numeroLot: "",
    productionDate: "",
    expiryDate: "",
    quantity: kind === "ALIMENT" ? "1" : "",
    quantityUnit: kind === "EAU" ? "L" : "UNITE",
    productTemperature: "",
    ambientTemperature: previous?.ambientTemperature ?? "",
    surfaceLabel: "",
    surfaceState: "",
    // L'aire n'a de valeur par défaut que sur une ligne Surface.
    surfaceAreaCm2: kind === "SURFACE" ? "100" : "",
    airMethod: kind === "AIR" && previous?.lineKind === "AIR" ? previous.airMethod : "",
    personName: "",
    personRole: "",
    handsState: "",
    remarks: "",
    unitCount: 1,
    // Same type and same boxes: the previous sample's analyses are proposed again.
    parameterIds: previous && sameFamilies(families, lineFamilies(previous)) ? [...previous.parameterIds] : [],
  };
}

/**
 * « Dupliquer l'échantillon N »: the same sample under a new key, without
 * its lot and dates. A copy of a sample with no box ticked gets its type's
 * default box.
 */
export function duplicateDraft(line: LineDraft, natures: readonly NatureRef[]): LineDraft {
  const copy: LineDraft = {
    ...line,
    key: newKey(),
    numeroLot: "",
    productionDate: "",
    expiryDate: "",
    parameterIds: [...line.parameterIds],
  };
  if (lineFamilies(line).length > 0) return copy;
  return { ...copy, ...familiesPatch(natures, line, resolveFamilies(natures, line.lineKind)) };
}

/** The série's two boxes, computed from its samples (no longer ticked by hand). */
export function serieAnalyses(lines: readonly Pick<LineDraft, "analysesMicro" | "analysesChimie">[]) {
  return {
    analysesMicro: lines.some((l) => l.analysesMicro),
    analysesChimie: lines.some((l) => l.analysesChimie),
  };
}

const FAMILY_ADJECTIVES: Record<LineFamily, string> = {
  MICRO: "microbiologiques",
  CHIMIE: "physico-chimiques",
};

/**
 * What stops a sample from being saved, in the form's words — the form
 * prefixes « Échantillon N — ». Analyses are not required any more
 * (RETOUR-LABO-06-10.md §5, V6). `requirePlace: false` at the counter, where
 * the place defaults to « Dépôt au laboratoire ».
 */
export function lineDraftError(
  line: LineDraft,
  natures: readonly NatureRef[],
  options: { requirePlace?: boolean } = {}
): string | null {
  const families = lineFamilies(line);
  if (families.length === 0) return "Cochez au moins une famille d'analyses (microbiologiques ou physico-chimiques).";
  for (const family of families) {
    if (familyStatus(natures, line.lineKind, family) !== "OK") {
      return `Les analyses ${FAMILY_ADJECTIVES[family]} ne sont pas proposées pour ce type de prélèvement.`;
    }
  }
  if ((options.requirePlace ?? true) && !line.lieu.trim()) return "Indiquez le lieu / la section.";
  switch (line.lineKind) {
    case "ALIMENT":
      if (!line.produit.trim()) return "Indiquez la désignation du produit.";
      break;
    case "SURFACE":
      if (!line.surfaceLabel.trim()) return SERIE_MESSAGES.surfaceLabelMissing;
      if (!line.surfaceState) return SERIE_MESSAGES.surfaceStateMissing;
      break;
    case "MAINS":
      if (!line.personName.trim()) return "Indiquez la personne prélevée.";
      break;
    case "AIR":
      if (!line.airMethod) return SERIE_MESSAGES.airMethodMissing;
      break;
  }
  return null;
}

/** A line as `POST /api/series` reads it. */
export type LinePayload = Omit<LineDraft, "key" | "surfaceState" | "airMethod" | "handsState"> & {
  surfaceState?: SurfaceState;
  airMethod?: AirMethod;
  handsState?: HandsState;
};

/**
 * The line sent to the API: without its key, without what its type does
 * not show (a surface designation left on a food line, a method left on a
 * water line…), and with "" choices sent as absent.
 */
export function linePayload(line: LineDraft): LinePayload {
  const { key: _key, surfaceState, airMethod, handsState, ...rest } = line;
  void _key;
  const surface = line.lineKind === "SURFACE";
  const hands = line.lineKind === "MAINS";
  return {
    ...rest,
    surfaceLabel: surface ? rest.surfaceLabel : "",
    surfaceAreaCm2: surface ? rest.surfaceAreaCm2 : "",
    surfaceState: surface && surfaceState ? surfaceState : undefined,
    airMethod: line.lineKind === "AIR" && airMethod ? airMethod : undefined,
    personName: hands ? rest.personName : "",
    personRole: hands ? rest.personRole : "",
    handsState: hands && handsState ? handsState : undefined,
    productTypeId: line.lineKind === "ALIMENT" ? rest.productTypeId : "",
    // An air line has no product, so no « T° produit » field (§8.5): a value
    // typed before switching the type to Air is not sent.
    productTemperature: line.lineKind === "AIR" ? "" : rest.productTemperature,
  };
}

// ---- display -------------------------------------------------------------------

/**
 * What the sample is about, for lists and recaps: « Planche verte — surface
 * nettoyée », « Mains — Prénom Nom », « Salle blanche — Boîte exposée
 * 30 min ». Samples saved before the state and the method existed print
 * their designation alone.
 */
export function lineDesignation(line: {
  lineKind: LineKind;
  produit?: string | null;
  surfaceLabel?: string | null;
  personName?: string | null;
  surfaceState?: SurfaceState | "" | null;
  airMethod?: AirMethod | "" | null;
}) {
  if (line.lineKind === "SURFACE") return withSurfaceState(line.surfaceLabel || "Surface", line.surfaceState || null);
  if (line.lineKind === "MAINS") return line.personName ? `Mains — ${line.personName}` : "Mains du personnel";
  if (line.lineKind === "AIR" && line.airMethod) {
    return `${line.produit || LINE_KIND_LABELS.AIR} — ${AIR_METHOD_LABELS[line.airMethod]}`;
  }
  return line.produit || "—";
}

/**
 * `datetime-local` wants a wall time without zone: 2026-09-13T14:05. It is
 * the LABORATORY's wall time (lab-time.ts), not the device's: a phone whose
 * time-zone data predates Morocco's return to UTC would otherwise shift
 * every typed hour by one.
 */
export function toLocalInput(date: Date) {
  return toLabWallTime(date);
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return fromLabWallTime(value)?.toISOString() ?? null;
}

/** The instant behind a `datetime-local` value, for display and comparison. */
export function localInputDate(value: string): Date | null {
  if (!value) return null;
  return fromLabWallTime(value);
}
