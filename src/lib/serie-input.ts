import type {
  AirMethod,
  Cadre,
  Family,
  HandsState,
  LineKind,
  NonConformityReason,
  PaymentMode,
  QuantityUnit,
  SampleType,
  SamplerKind,
  SerieKind,
  SurfaceState,
} from "@/generated/prisma/enums";
import { MAX_UNITS } from "./series";
import {
  AIR_METHOD_CHOICES,
  ANALYSIS_FAMILY_LABELS,
  CADRE_CHOICES,
  LINE_KIND_LABELS,
  SURFACE_STATE_CHOICES,
  futureMessage,
} from "./labels";
import { LINE_FAMILIES, familiesFor, familyOfNature, natureFor, type LineFamily } from "./nature-family";
import { twinFor, type SampleTwin } from "./sample-code";

/**
 * Validating a série (visite or dépôt) and its lines — pure, shared by the
 * API and the forms.
 *
 * The rules mirror the paper protocole de prélèvement: an aliment line
 * carries a lot, dates and a quantity; a surface line its désignation, its
 * state and its area; a mains line a person; an air line its sampling method;
 * temperatures and remarks are allowed on every kind. Anything the kind does
 * not use is dropped, never silently stored.
 *
 * A line ticks « Analyses microbiologiques » and / or « Analyses
 * physico-chimiques » (RETOUR-LABO-06-10.md §5, V3): the nature of each
 * sample is deduced from the type × the family, and a line with both boxes
 * ticked becomes two samples under the same line number. An older caller
 * that names a `natureId` without ticking anything keeps that nature (one
 * sample, the family of the nature).
 *
 * A dépôt (bon de réception) is received on the spot, so its lines also
 * carry what the reception of a visit records later: temperature at
 * arrival, conformity with a coded motif, technician.
 *
 * Messages: `validateLine` returns the bare sentence (« Choisissez l'état de
 * la surface. ») with the line number aside — « Corriger la fiche » shows it
 * as is; `validateSerie` and `planLineSamples` name the sample in the
 * sentence (« Échantillon 2 — choisissez l'état de la surface. »).
 */

export const LINE_KINDS: LineKind[] = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"];
export const QUANTITY_UNITS: QuantityUnit[] = ["UNITE", "G", "ML", "L"];
export const HANDS_STATES: HandsState[] = ["LAVEES", "NON_LAVEES"];
/** « Prélèvement effectué par » on a new série. SERVICE_VETERINAIRE stays in
 * the enum for the old séries but is refused at creation (RETOUR-LABO-06-10.md
 * §5, V1): a veterinary sampling is entered « Autre » + name. */
export const SAMPLER_KINDS: SamplerKind[] = ["QUALILAB", "CLIENT", "AUTRE"];
export const SERIE_KINDS: SerieKind[] = ["VISITE", "DEPOT"];
/** Chosen on the série, never deduced from who sampled (V1). */
export const CADRES: readonly Cadre[] = CADRE_CHOICES;
export const SURFACE_STATES: readonly SurfaceState[] = SURFACE_STATE_CHOICES;
export const AIR_METHODS: readonly AirMethod[] = AIR_METHOD_CHOICES;
export const PAYMENT_MODES: PaymentMode[] = ["ESPECES", "CHEQUE", "VIREMENT", "CARTE"];
export const NON_CONFORMITY_REASONS: NonConformityReason[] = [
  "CHAINE_FROID",
  "TEMPERATURE_MANQUANTE",
  "QUANTITE_INSUFFISANTE",
  "EMBALLAGE",
  "DELAI",
  "IDENTIFICATION",
  "AUTRE",
];

export const MAX_LINES = 200;
const TEXT = 191;

/** The messages the forms repeat word for word in their own checks. */
export const SERIE_MESSAGES = {
  cadreMissing: "Choisissez le cadre de l'analyse.",
  veterinaryRefused: "« Service vétérinaire » n'est plus proposé : choisissez « Autre » et indiquez le nom.",
  surfaceLabelMissing: "Indiquez la désignation de la surface.",
  surfaceStateMissing: "Choisissez l'état de la surface.",
  airMethodMissing: "Choisissez la méthode de prélèvement de l'air.",
} as const;

/**
 * A line message naming its sample: « Échantillon 2 — choisissez l'état de la
 * surface. » (`ref` is the line number, or « 2M » / « 2P » for one of the two
 * samples of a two-family line).
 */
export function sampleLineMessage(ref: number | string, message: string): string {
  return `Échantillon ${ref} — ${lowerFirst(message)}`;
}

/** « Indiquez … » → « indiquez … »; a sentence opening on an acronym or a
 * quotation mark is left alone. */
function lowerFirst(message: string): string {
  const [first, second] = [...message];
  if (!first || second === undefined) return message;
  const isCapital = first !== first.toLocaleLowerCase("fr");
  const isAcronym = second !== second.toLocaleLowerCase("fr");
  return isCapital && !isAcronym ? first.toLocaleLowerCase("fr") + message.slice(first.length) : message;
}

/**
 * A nature as the validator sees it. `code` and `family` let it deduce the
 * nature of a ticked family (nature-family.ts); a caller that only checks a
 * named nature (« Corriger la fiche ») may leave them out.
 */
export type NatureRef = {
  id: string;
  defaultLineKind: LineKind;
  active: boolean;
  code?: string;
  family?: Family;
};

/** One sample of a line: the family it was ticked for, and its nature. */
export type LineNature = { family: Family; natureId: string };

export type CleanLine = {
  lineKind: LineKind;
  /**
   * One entry per sample the line becomes, in display order (microbiology
   * first): one per ticked family, or the single nature an older caller named.
   */
  natures: LineNature[];
  /** FAMILIES: deduced from the ticked boxes (a `natureId` sent is ignored);
   * CHOSEN: the `natureId` of an older caller, kept as named. */
  natureSource: "FAMILIES" | "CHOSEN";
  produit: string | null;
  lieu: string;
  numeroLot: string | null;
  productionDate: Date | null;
  expiryDate: Date | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  productTemperature: number | null;
  ambientTemperature: number | null;
  receptionTemperature: number | null;
  /** « Désignation » of a SURFACE line; null on every other kind. */
  surfaceLabel: string | null;
  /** « Surface prélevée (cm²) » of a SURFACE line (100 by default); null elsewhere. */
  surfaceAreaCm2: number | null;
  /** « État de la surface » — SURFACE only. */
  surfaceState: SurfaceState | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  /** « Méthode de prélèvement » — AIR only. */
  airMethod: AirMethod | null;
  remarks: string | null;
  unitCount: number;
  /** Optional (V6): the programme sheet fixes the analyses when none is ticked. */
  parameterIds: string[];
  /** The catalogue's product type (CRITERES.md) — the criteria come from it. */
  productTypeId: string | null;
  /** Reception data — meaningful for a dépôt only; defaults for a visit. */
  conformity: boolean;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  /** A non-conform deposit line destroyed at the counter (slice E). */
  destroy: boolean;
  technicianId: string | null;
};

export type CleanSerie = {
  kind: SerieKind;
  clientId: string;
  siteId: string | null;
  interlocutor: string | null;
  samplerKind: SamplerKind;
  /** The Qualilab préleveur the visit is attributed to; null = the actor. */
  samplerUserId: string | null;
  samplerName: string | null;
  cadre: Cadre;
  /** The precision of « Autre »; always null for the other cadres. */
  cadreNote: string | null;
  clientReference: string | null;
  startedAt: Date;
  endedAt: Date | null;
  arrivedAt: Date | null;
  coolerTemperature: number | null;
  advanceAmount: number | null;
  advanceMode: PaymentMode | null;
  notes: string | null;
  lines: CleanLine[];
};

export type SerieValidation =
  | { ok: true; value: CleanSerie }
  | { ok: false; error: string; line?: number };

export type LineOptions = {
  kind?: SerieKind;
  /**
   * « Corriger la fiche » of a row entered before the state and the method
   * existed (07/10): `surfaceState` / `airMethod` may stay empty.
   */
  allowMissingState?: boolean;
};

function text(value: unknown, max = TEXT): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > max ? s.slice(0, max) : s;
}

function tooLong(value: unknown, max = TEXT) {
  return typeof value === "string" && value.trim().length > max;
}

function numberOrNull(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const parsed =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "invalid";
}

/** « 2026-09-13 » or a full ISO instant; a plain date is kept as a date. */
function dateOrNull(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const d = new Date(plain);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** « Analyses microbiologiques » ou « Analyses physico-chimiques ». */
function quotedFamilies(families: readonly LineFamily[]) {
  return families.map((f) => `« ${ANALYSIS_FAMILY_LABELS[f]} »`).join(" ou ");
}

/** Lower-cased, unaccented, single-spaced — the key that spots « CF+PAV1 » vs « CF + PAV1 ». */
export function normalizeLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function validateLine(
  raw: unknown,
  index: number,
  natures: ReadonlyMap<string, NatureRef>,
  options: LineOptions = {}
): { ok: true; value: CleanLine } | { ok: false; error: string; line: number } {
  const line = index + 1;
  const fail = (error: string) => ({ ok: false as const, error, line });
  const input = (raw ?? {}) as Record<string, unknown>;
  const deposit = options.kind === "DEPOT";

  // ---- Type and families → the nature of each sample ------------------------
  const ticksFamilies = typeof input.analysesMicro === "boolean" || typeof input.analysesChimie === "boolean";
  const chosenId = text(input.natureId);
  let lineKind: LineKind;
  let lineNatures: LineNature[];
  let natureSource: CleanLine["natureSource"];

  if (!ticksFamilies && chosenId) {
    // An older caller (test scripts, API clients) names the nature itself.
    const nature = natures.get(chosenId);
    if (!nature || !nature.active) return fail("Choisissez la nature d'analyse.");
    lineKind = oneOf(input.lineKind, LINE_KINDS) ?? nature.defaultLineKind;
    lineNatures = [{ family: familyOfNature(nature) ?? "AUTRE", natureId: nature.id }];
    natureSource = "CHOSEN";
  } else {
    const kind = oneOf(input.lineKind, LINE_KINDS);
    if (!kind) return fail("Choisissez le type d'échantillon.");
    lineKind = kind;
    const available = familiesFor(kind);
    const ticked = LINE_FAMILIES.filter((family) =>
      family === "MICRO" ? input.analysesMicro === true : input.analysesChimie === true
    );
    if (ticked.length === 0) return fail(`Cochez ${quotedFamilies(available)}.`);
    const catalogue = [...natures.values()].flatMap((n) =>
      n.code && n.family ? [{ id: n.id, code: n.code, family: n.family, active: n.active }] : []
    );
    lineNatures = [];
    for (const family of ticked) {
      const what = `« ${ANALYSIS_FAMILY_LABELS[family]} »`;
      const kindLabel = `« ${LINE_KIND_LABELS[kind]} »`;
      if (!available.includes(family)) return fail(`${what} ne s'applique pas à un échantillon ${kindLabel}.`);
      const nature = natureFor(catalogue, kind, family);
      if (!nature) {
        return fail(
          `${what} : la nature d'analyse d'un échantillon ${kindLabel} est archivée ou absente du catalogue — prévenez l'administrateur.`
        );
      }
      lineNatures.push({ family, natureId: nature.id });
    }
    natureSource = "FAMILIES";
  }

  // A deposit has no sampling place: the counter is the place.
  const lieu = text(input.lieu) || (deposit ? "Dépôt au laboratoire" : "");
  if (!lieu) return fail("Indiquez le lieu / la section du prélèvement.");
  if (tooLong(input.lieu)) return fail("Le lieu est trop long (191 caractères maximum).");

  const surface = lineKind === "SURFACE";
  for (const [key, label, applies] of [
    ["produit", "La désignation est trop longue", true],
    ["numeroLot", "Le numéro de lot est trop long", true],
    ["surfaceLabel", "La désignation de la surface est trop longue", surface],
    ["personName", "Le nom de la personne est trop long", true],
    ["personRole", "La fonction est trop longue", true],
  ] as const) {
    if (applies && tooLong(input[key])) return fail(`${label} (191 caractères maximum).`);
  }

  const produit = text(input.produit) || null;
  // « Désignation » of a surface (ex-« Surface prélevée »): a surface line
  // only — on another kind it would repeat the line's own désignation (Q47).
  const surfaceLabel = surface ? text(input.surfaceLabel) || null : null;
  const personName = text(input.personName) || null;
  const surfaceState = surface ? oneOf(input.surfaceState, SURFACE_STATES) : null;
  const airMethod = lineKind === "AIR" ? oneOf(input.airMethod, AIR_METHODS) : null;
  const strictStates = !options.allowMissingState;

  if (lineKind === "ALIMENT" && !produit) return fail("Indiquez la désignation du produit.");
  if (surface && !surfaceLabel) return fail(SERIE_MESSAGES.surfaceLabelMissing);
  if (surface && !surfaceState && strictStates) return fail(SERIE_MESSAGES.surfaceStateMissing);
  if (lineKind === "MAINS" && !personName) return fail("Indiquez la personne prélevée.");
  if (lineKind === "AIR" && !airMethod && strictStates) return fail(SERIE_MESSAGES.airMethodMissing);

  const productionDate = dateOrNull(input.productionDate);
  const expiryDate = dateOrNull(input.expiryDate);
  if (productionDate === "invalid") return fail("La date de production n'est pas valide.");
  if (expiryDate === "invalid") return fail("La date d'expiration n'est pas valide.");
  if (productionDate && expiryDate && expiryDate < productionDate) {
    return fail("La date d'expiration précède la date de production.");
  }

  const quantity = numberOrNull(input.quantity);
  if (quantity === "invalid" || (quantity !== null && quantity <= 0)) {
    return fail("La quantité doit être un nombre positif.");
  }
  const quantityUnit = quantity === null ? null : (oneOf(input.quantityUnit, QUANTITY_UNITS) ?? "UNITE");

  const productTemperature = numberOrNull(input.productTemperature);
  const ambientTemperature = numberOrNull(input.ambientTemperature);
  const receptionTemperature = numberOrNull(input.receptionTemperature);
  for (const [t, label] of [
    [productTemperature, "La température du produit"],
    [ambientTemperature, "La température ambiante"],
    [receptionTemperature, "La température à l'arrivée"],
  ] as const) {
    if (t === "invalid" || (t !== null && (t < -80 || t > 300))) {
      return fail(`${label} doit être un nombre plausible (−80 à 300 °C).`);
    }
  }

  // « Surface prélevée (cm²) » (ex-« Aire prélevée »): 100 cm² by default on
  // a surface line, nowhere else.
  let surfaceAreaCm2: number | null = null;
  if (surface) {
    const area = numberOrNull(input.surfaceAreaCm2);
    if (area === "invalid" || (area !== null && (!Number.isInteger(area) || area <= 0 || area > 100000))) {
      return fail("La surface prélevée doit être un nombre entier de cm².");
    }
    surfaceAreaCm2 = area ?? 100;
  }

  const handsState = lineKind === "MAINS" ? oneOf(input.handsState, HANDS_STATES) : null;
  const weighed = lineKind !== "SURFACE" && lineKind !== "MAINS";

  const unitCountRaw = numberOrNull(input.unitCount);
  const unitCount = unitCountRaw === null ? 1 : unitCountRaw;
  if (unitCount === "invalid" || !Number.isInteger(unitCount) || unitCount < 1 || unitCount > MAX_UNITS) {
    return fail(`Le nombre d'unités doit être un entier entre 1 et ${MAX_UNITS}.`);
  }

  // Analyses are optional (V6): the programme sheet fixes them when the
  // préleveur ticks none.
  const ids = Array.isArray(input.parameterIds) ? input.parameterIds : [];
  const parameterIds = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];

  // ---- Reception data of a deposit line ------------------------------------
  let conformity = true;
  let conformityReason: NonConformityReason | null = null;
  let conformityNote: string | null = null;
  let technicianId: string | null = null;
  let destroy = false;
  if (deposit) {
    if (input.conformity !== undefined && typeof input.conformity !== "boolean") {
      return fail("Indiquez la conformité de l'échantillon.");
    }
    conformity = input.conformity !== false;
    if (!conformity) {
      const reason = oneOf(input.conformityReason, NON_CONFORMITY_REASONS);
      if (!reason) return fail("Choisissez le motif de non-conformité.");
      conformityReason = reason;
      const note = text(input.conformityNote, 2000);
      if (reason === "AUTRE" && !note) return fail("Précisez le motif « autre ».");
      conformityNote = note || null;
    }
    // Case by case (29/09): a non-conform line is analysed anyway or destroyed.
    const decision = input.decision === undefined || input.decision === null ? "ANALYSER" : input.decision;
    if (decision !== "ANALYSER" && decision !== "DETRUIRE") return fail("Décision inconnue pour l'échantillon.");
    if (decision === "DETRUIRE" && conformity) return fail("Seul un échantillon non conforme peut être détruit.");
    destroy = decision === "DETRUIRE";
    technicianId = destroy ? null : text(input.technicianId) || null;
  }

  return {
    ok: true,
    value: {
      lineKind,
      natures: lineNatures,
      natureSource,
      produit: lineKind === "ALIMENT" || lineKind === "EAU" || lineKind === "AIR" || lineKind === "AUTRE" ? produit : null,
      lieu,
      numeroLot: lineKind === "ALIMENT" ? text(input.numeroLot) || null : null,
      productionDate: lineKind === "ALIMENT" ? productionDate : null,
      expiryDate: lineKind === "ALIMENT" ? expiryDate : null,
      // A surface or a pair of hands is not weighed: the quantity goes with
      // the lot when the line changes kind.
      quantity: weighed ? (quantity as number | null) : null,
      quantityUnit: weighed ? quantityUnit : null,
      productTemperature: productTemperature as number | null,
      ambientTemperature: ambientTemperature as number | null,
      receptionTemperature:
        receptionTemperature === null ? null : Math.round((receptionTemperature as number) * 10) / 10,
      surfaceLabel,
      surfaceAreaCm2,
      surfaceState,
      personName: lineKind === "MAINS" ? personName : null,
      personRole: lineKind === "MAINS" ? text(input.personRole) || null : null,
      handsState,
      airMethod,
      remarks: text(input.remarks, 2000) || null,
      unitCount: unitCount as number,
      parameterIds,
      // Criteria are written for a food product: a surface or a pair of
      // hands never carries one.
      productTypeId: lineKind === "ALIMENT" ? text(input.productTypeId) || null : null,
      conformity,
      conformityReason,
      conformityNote,
      destroy,
      technicianId,
    },
  };
}

export function validateSerie(
  raw: unknown,
  natures: ReadonlyMap<string, NatureRef>,
  options: { kind: SerieKind }
): SerieValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fail = (error: string) => ({ ok: false as const, error });
  const deposit = options.kind === "DEPOT";

  const clientId = text(input.clientId);
  if (!clientId) return fail("Choisissez le client.");
  const siteId = text(input.siteId) || null;

  // A veterinary sampling is « Autre » + the service's name since 07/10; the
  // old séries keep their value.
  if (input.samplerKind === "SERVICE_VETERINAIRE") return fail(SERIE_MESSAGES.veterinaryRefused);
  const samplerKind = oneOf(input.samplerKind, SAMPLER_KINDS) ?? (deposit ? "CLIENT" : "QUALILAB");
  const samplerName = text(input.samplerName) || null;
  if (samplerKind === "AUTRE" && !samplerName) {
    return fail("Indiquez qui a effectué le prélèvement.");
  }
  const samplerUserId = samplerKind === "QUALILAB" ? text(input.samplerUserId) || null : null;

  // The cadre is a choice, never deduced from who samples (V1); « Autre »
  // may carry a precision.
  const cadre = oneOf(input.cadre, CADRES);
  if (!cadre) return fail(SERIE_MESSAGES.cadreMissing);
  if (cadre === "AUTRE" && tooLong(input.cadreNote)) {
    return fail("La précision du cadre est trop longue (191 caractères maximum).");
  }
  const cadreNote = cadre === "AUTRE" ? text(input.cadreNote) || null : null;

  const startedAtRaw = dateOrNull(input.startedAt);
  if (startedAtRaw === "invalid") return fail("La date et l'heure du prélèvement ne sont pas valides.");
  const startedAt = startedAtRaw ?? new Date();
  const now = Date.now();
  if (startedAt.getTime() > now + 5 * 60 * 1000) return fail(futureMessage("L'heure du prélèvement"));
  if (startedAt.getTime() < now - 30 * 24 * 3600 * 1000) return fail("L'heure du prélèvement remonte à plus de 30 jours.");

  const endedAt = dateOrNull(input.endedAt);
  const arrivedAt = dateOrNull(input.arrivedAt);
  if (endedAt === "invalid") return fail("L'heure de fin n'est pas valide.");
  if (arrivedAt === "invalid") return fail("L'heure d'arrivée n'est pas valide.");
  if (endedAt && endedAt.getTime() > now + 5 * 60 * 1000) return fail(futureMessage("L'heure de fin"));
  if (arrivedAt && arrivedAt.getTime() > now + 5 * 60 * 1000) return fail(futureMessage("L'heure d'arrivée"));
  if (endedAt && endedAt < startedAt) return fail("L'heure de fin précède le début du prélèvement.");
  if (arrivedAt && endedAt && arrivedAt < endedAt) return fail("L'arrivée au laboratoire précède la fin du prélèvement.");
  if (arrivedAt && !endedAt && arrivedAt < startedAt) return fail("L'arrivée au laboratoire précède le prélèvement.");

  const coolerTemperature = numberOrNull(input.coolerTemperature);
  if (coolerTemperature === "invalid" || (coolerTemperature !== null && (coolerTemperature < -80 || coolerTemperature > 300))) {
    return fail("La température à l'arrivée doit être un nombre plausible.");
  }

  // Advance cashed at the counter — a deposit only.
  let advanceAmount: number | null = null;
  let advanceMode: PaymentMode | null = null;
  if (deposit) {
    const amount = numberOrNull(input.advanceAmount);
    if (amount === "invalid" || (amount !== null && (amount < 0 || amount > 10_000_000))) {
      return fail("L'avance doit être un montant positif.");
    }
    advanceAmount = amount === null || amount === 0 ? null : Math.round(amount * 100) / 100;
    if (advanceAmount !== null) {
      advanceMode = oneOf(input.advanceMode, PAYMENT_MODES);
      if (!advanceMode) return fail("Indiquez le mode de paiement de l'avance.");
    }
  }

  for (const [key, label] of [
    ["interlocutor", "L'interlocuteur est trop long"],
    ["clientReference", "La référence client est trop longue"],
  ] as const) {
    if (tooLong(input[key])) return fail(`${label} (191 caractères maximum).`);
  }

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (rawLines.length === 0) return fail("Ajoutez au moins un échantillon.");
  if (rawLines.length > MAX_LINES) return fail(`Une série ne peut pas dépasser ${MAX_LINES} échantillons.`);

  const lines: CleanLine[] = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const checked = validateLine(rawLines[i], i, natures, { kind: options.kind });
    if (!checked.ok) {
      return { ok: false, error: sampleLineMessage(checked.line, checked.error), line: checked.line };
    }
    lines.push(checked.value);
  }

  return {
    ok: true,
    value: {
      kind: options.kind,
      clientId,
      siteId,
      interlocutor: text(input.interlocutor) || null,
      samplerKind,
      samplerUserId,
      samplerName,
      cadre,
      cadreNote,
      clientReference: text(input.clientReference) || null,
      startedAt,
      endedAt,
      arrivedAt,
      coolerTemperature: coolerTemperature as number | null,
      advanceAmount,
      advanceMode,
      notes: text(input.notes, 2000) || null,
      lines,
    },
  };
}

// ---- From a line to its samples ----------------------------------------------

/** A nature as loaded from the catalogue when the samples are written. */
export type NatureRow = { id: string; family: Family; legacyType: SampleType };

/** An analysis parameter as loaded from the catalogue. */
export type ParameterRef = { id: string; name: string; family: Family; category: SampleType };

/** One sample a line becomes. */
export type PlannedSample = {
  family: Family;
  natureId: string;
  /** `Sample.type` — the nature's domain. */
  type: SampleType;
  /** « M » / « P » when the line becomes two samples; null for a single one. */
  twin: SampleTwin | null;
  /** The line's analyses of this sample's family. */
  parameterIds: string[];
};

export type LinePlan =
  | { ok: true; samples: PlannedSample[] }
  | { ok: false; error: string; line: number };

const FAMILY_ADJECTIVE: Record<LineFamily, string> = {
  MICRO: "microbiologique",
  CHIMIE: "physico-chimique",
};

/**
 * Splits a validated line into its samples — pure, used by the creation and
 * by the deposit's acceptance rules before it.
 *
 * Each ticked family gives one sample with its deduced nature; each analysis
 * goes to the sample of its family (`AnalysisParameter.family`) and must be
 * of the line's domain (`AnalysisParameter.category` = the nature's
 * `legacyType`). A line whose nature was named by an older caller stays one
 * sample and keeps every analysis of its domain, whatever their family, as
 * before.
 */
export function planLineSamples(
  line: Pick<CleanLine, "lineKind" | "natures" | "natureSource" | "parameterIds">,
  lineNumber: number,
  natures: ReadonlyMap<string, NatureRow>,
  parameters: ReadonlyMap<string, ParameterRef>
): LinePlan {
  const fail = (message: string): LinePlan => ({
    ok: false,
    error: sampleLineMessage(lineNumber, message),
    line: lineNumber,
  });
  const chosen = line.natureSource === "CHOSEN";
  const twins = line.natures.length > 1;

  const samples: PlannedSample[] = [];
  for (const entry of line.natures) {
    const nature = natures.get(entry.natureId);
    if (!nature) return fail("La nature d'analyse est inconnue ou archivée.");
    const family = chosen ? nature.family : entry.family;
    samples.push({
      family,
      natureId: nature.id,
      type: nature.legacyType,
      twin: twins && (family === "MICRO" || family === "CHIMIE") ? twinFor(family) : null,
      parameterIds: [],
    });
  }
  if (samples.length === 0) return fail("Choisissez la nature d'analyse.");

  const kindLabel = `« ${LINE_KIND_LABELS[line.lineKind]} »`;
  for (const id of line.parameterIds) {
    const parameter = parameters.get(id);
    if (!parameter) return fail("Une des analyses demandées n'existe pas.");
    const target = chosen ? samples[0] : samples.find((s) => s.family === parameter.family);
    if (!target) {
      const family = parameter.family;
      if ((family === "MICRO" || family === "CHIMIE") && familiesFor(line.lineKind).includes(family)) {
        return fail(
          `« ${parameter.name} » est une analyse ${FAMILY_ADJECTIVE[family]} : cochez « ${ANALYSIS_FAMILY_LABELS[family]} » ou retirez-la.`
        );
      }
      return fail(`L'analyse « ${parameter.name} » ne se demande pas sur un échantillon ${kindLabel}.`);
    }
    if (parameter.category !== target.type) {
      return fail(`L'analyse « ${parameter.name} » ne se demande pas sur un échantillon ${kindLabel}.`);
    }
    target.parameterIds.push(id);
  }

  return { ok: true, samples };
}
