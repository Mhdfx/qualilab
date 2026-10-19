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
  StorageClass,
  SurfaceState,
  TemperatureSource,
} from "@/generated/prisma/enums";
import { MAX_UNITS } from "./series";
import { parseIsoDay } from "./date-only";
import {
  AIR_EXPOSURE_MINUTES,
  AIR_METHOD_CHOICES,
  ANALYSIS_FAMILY_LABELS,
  CADRE_CHOICES,
  HANDS_STATE_CHOICES,
  LINE_KIND_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  SURFACE_STATE_CHOICES,
  futureMessage,
  isExposedPlate,
} from "./labels";
import { LINE_FAMILIES, familiesFor, familyOfNature, natureFor, type LineFamily } from "./nature-family";
import { EXPLOITABLE_MESSAGES, RECEPTION_NOTE_MAX, RECEPTION_NOTE_MESSAGES } from "./reception-rules";
import { COMPLEMENTARY_MESSAGES, STORAGE_CLASSES, TEMPERATURE_SOURCES, parseChoice } from "./reception-complementary";
import { twinFor, type SampleTwin } from "./sample-code";
import {
  CONSULTATION_MESSAGES,
  consultationMissing,
  parseConsultation,
  parseDecision,
  type ClientConsultation,
  type ReceptionDecision,
} from "./client-consultation";

/**
 * Validating a série (visite or dépôt) and its lines — pure, shared by the
 * API and the forms.
 *
 * The rules mirror the paper protocole de prélèvement: an aliment line
 * carries a lot, dates and a quantity; a surface line its désignation, its
 * state and its area (or the « Autre » text that replaces it); a mains line
 * a person and the state of the hands; an air line its sampling method (and
 * the exposed plate's duration); temperatures and remarks are allowed on
 * every kind — the ambient one required on a visit (16/10, Q113). Anything
 * the kind does not use is dropped, never silently stored.
 *
 * A line ticks « Analyses microbiologiques » and / or « Analyses
 * physico-chimiques » (RETOUR-LABO-06-10.md §5, V3): the nature of each
 * sample is deduced from the type × the family, and a line with both boxes
 * ticked becomes two samples under the same line number. An older caller
 * that names a `natureId` without ticking anything keeps that nature (one
 * sample, the family of the nature).
 *
 * A dépôt (bon de réception) is received on the spot, so its lines also
 * carry what the reception of a visit records later: rule (1) of the bon
 * (exploitable or not, answered for every line — retour du 08/10), C5
 * (identification; C3 « emballage » is no longer asked since 16/10, Q70 — a
 * `packagingOk` still sent is not read), temperature at arrival,
 * conformity with a coded motif, decision. Never a technician
 * (RETOUR-LABO-06-10.md §9.3): once programmed, the sample waits in
 * « À prendre » until a technician takes it (PROGRAMME.md §10); a
 * `technicianId` still sent is ignored.
 *
 * One container per family (the laboratory's answer of 12/10): a two-family
 * line weighs each family's part apart — the line's own quantity is the
 * microbiology sample's (« Quantité 2M »), `quantityChimie` /
 * `quantityUnitChimie` the physico-chemistry sample's (« Quantité 2P »). A
 * caller that does not send them (a page opened before) keeps the old rule:
 * the « P » sample takes the line's quantity (`sampleQuantity`).
 *
 * The times (16/10, Q118): « Prélevé le » is required on a visit and on a
 * deposit — the deposit's one exception, the client who truly does not know
 * (proposal of the re-ask 2.6, `SAMPLING_TIME_UNKNOWN`), is said by a box,
 * never by an empty field. The deposit's « Arrivé le » is read first: the
 * unknown sampling time falls back on it.
 *
 * Messages: `validateLine` returns the bare sentence (« Choisissez l'état de
 * la surface. ») with the line number aside — « Corriger la fiche » shows it
 * as is; `validateSerie` and `planLineSamples` name the sample in the
 * sentence (« Échantillon 2 — choisissez l'état de la surface. »).
 */

export const LINE_KINDS: LineKind[] = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"];
export const QUANTITY_UNITS: QuantityUnit[] = ["UNITE", "G", "ML", "L"];
/** The one list of `labels.ts` (16/10, Q109): ASEPTISEES, NON_LAVEES, LAVEES. */
export const HANDS_STATES: readonly HandsState[] = HANDS_STATE_CHOICES;
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
/** The coded motifs both APIs accept — derived from their labels, never listed twice. */
export const NON_CONFORMITY_REASONS = Object.keys(NON_CONFORMITY_REASON_LABELS) as NonConformityReason[];

export const MAX_LINES = 200;
/** The surface sampled when nothing was given: 100 cm² (the recap of the visit prints it too). */
export const SURFACE_AREA_DEFAULT_CM2 = 100;
const TEXT = 191;

/**
 * The deposit whose client truly does not know the sampling time (16/10,
 * Q118) — the PROPOSAL of the re-ask 2.6, pending the laboratory's answer:
 * a box « Heure de prélèvement inconnue du client », ticked on purpose. The
 * série is then « Non déclarée » (`samplingTimeDeclared` false), its
 * sampling instant the arrival, and C1 « à vérifier » with the observation
 * required. Should the laboratory answer « refusé tant que l'heure n'est
 * pas donnée », `allowed: false` takes the box off the counter and the API
 * refuses the flag — nothing else changes.
 */
export const SAMPLING_TIME_UNKNOWN = {
  allowed: true,
  label: "Heure de prélèvement inconnue du client",
} as const;

/** The messages the forms repeat word for word in their own checks. */
export const SERIE_MESSAGES = {
  cadreMissing: "Choisissez le cadre de l'analyse.",
  veterinaryRefused: "« Service vétérinaire » n'est plus proposé : choisissez « Autre » et indiquez le nom.",
  surfaceLabelMissing: "Indiquez la désignation de la surface.",
  surfaceStateMissing: "Choisissez l'état de la surface.",
  surfaceAreaBoth: "Indiquez soit la surface prélevée en cm², soit une précision « Autre » — pas les deux.",
  surfaceAreaNoteTooLong: "La précision « Autre » de la surface est trop longue (191 caractères maximum).",
  handsStateMissing: "Choisissez l'état des mains.",
  airMethodMissing: "Choisissez la méthode de prélèvement de l'air.",
  airExposureMissing: "Indiquez la durée d'exposition de la boîte, en minutes.",
  airExposureInvalid: `La durée d'exposition doit être un nombre entier de minutes, de ${AIR_EXPOSURE_MINUTES.min} à ${AIR_EXPOSURE_MINUTES.max}.`,
  ambientMissing: "Indiquez la T° ambiante : elle est obligatoire sur la visite.",
  arrivalBeforeEnd: "L'arrivée au laboratoire précède la fin du prélèvement.",
  arrivalBeforeStart: "L'arrivée au laboratoire précède le prélèvement.",
  /** « Prélevé le » emptied on a visit (16/10, Q118): the screen pre-fills it, the API refuses it empty. */
  startedMissing: "Indiquez la date et l'heure du prélèvement.",
  /** The counter's screen: the field and its box are both on it (the box only while it is offered). */
  depositStartedMissing: SAMPLING_TIME_UNKNOWN.allowed
    ? `Indiquez la date et l'heure du prélèvement, ou cochez « ${SAMPLING_TIME_UNKNOWN.label} ».`
    : "Indiquez la date et l'heure du prélèvement.",
  /** The deposit API: a page opened before 16/10 has no box — told to reload. */
  depositStartedMissingApi: SAMPLING_TIME_UNKNOWN.allowed
    ? `Indiquez la date et l'heure du prélèvement, ou cochez « ${SAMPLING_TIME_UNKNOWN.label} » (rechargez la page si cette case n'apparaît pas).`
    : "Indiquez la date et l'heure du prélèvement.",
  /** `SAMPLING_TIME_UNKNOWN.allowed` false: the box is refused. */
  samplingUnknownRefused: "L'heure du prélèvement est obligatoire : le dépôt ne peut pas être enregistré sans elle.",
  /** The deposit's « Arrivé le » emptied on the screen (16/10, Q118). */
  arrivalMissing: "Indiquez la date et l'heure d'arrivée au laboratoire.",
  arrivalTooOld: "L'heure d'arrivée remonte à plus de 30 jours.",
} as const;

/** The oldest sampling or arrival a new série may carry (30 days). */
const MAX_PAST_MS = 30 * 24 * 3600 * 1000;
/** The clock tolerance of « dans le futur » (5 min), the screens' too (`futureFieldError`). */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * The arrival at the laboratory against the sampling: never before its end,
 * nor before its start when no end was typed. One rule for the visit's
 * creation, the série's header (PATCH), the reception and its screen.
 */
export function arrivalRefusal(arrivedAt: Date, startedAt: Date, endedAt: Date | null): string | null {
  if (endedAt && arrivedAt < endedAt) return SERIE_MESSAGES.arrivalBeforeEnd;
  if (arrivedAt < startedAt) return SERIE_MESSAGES.arrivalBeforeStart;
  return null;
}

/**
 * A CHANGE of the série's arrival through its header (PATCH
 * /api/series/[id]), beyond `arrivalRefusal`. Since lot 1b the arrival is
 * the report's « Date et heure de réception » and C1's end: once the série
 * is received it belongs to the laboratory — never the préleveur's (as the
 * cadre), never emptied, never after the reception (its 5 min of clock
 * tolerance). Never more than 30 days back, as at creation: from the
 * reception once there is one, else from now.
 */
export function arrivalChangeRefusal(change: {
  next: Date | null;
  receivedAt: Date | null;
  byPreleveur: boolean;
  now?: number;
}): string | null {
  const { next, receivedAt, byPreleveur } = change;
  if (receivedAt) {
    if (byPreleveur) return "La série est réceptionnée : le laboratoire seul peut corriger l'heure d'arrivée.";
    if (!next) return SERIE_MESSAGES.arrivalMissing;
    if (next.getTime() > receivedAt.getTime() + FUTURE_TOLERANCE_MS) return "L'heure d'arrivée suit la réception de la série.";
  }
  const reference = receivedAt?.getTime() ?? change.now ?? Date.now();
  if (next && next.getTime() < reference - MAX_PAST_MS) {
    return receivedAt ? "L'heure d'arrivée précède la réception de plus de 30 jours." : SERIE_MESSAGES.arrivalTooOld;
  }
  return null;
}

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
  /** The line's quantity — on a two-family line, its microbiology sample's (« Quantité 2M »). */
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  /**
   * « Quantité 2P »: what the physico-chemistry sample of a two-family line
   * weighs (one container per family, 12/10) — `quantity` null when not
   * weighed. Null when not sent (a page opened before: the « P » sample takes
   * the line's quantity), on a line that is one sample, on a kind not weighed.
   */
  chimieQuantity: { quantity: number | null; quantityUnit: QuantityUnit | null } | null;
  productTemperature: number | null;
  ambientTemperature: number | null;
  receptionTemperature: number | null;
  /** C2, a deposit only: where the temperature at arrival was read; null without one, and on a visit. */
  receptionTemperatureSource: TemperatureSource | null;
  /** C2, a deposit only: the conservation class chosen; null = the kind's default, and on a visit. */
  storageClass: StorageClass | null;
  /** « Désignation » of a SURFACE line; null on every other kind. */
  surfaceLabel: string | null;
  /** « Surface prélevée (cm²) » of a SURFACE line (100 by default); null
   * elsewhere, and when the line carries a `surfaceAreaNote` instead. */
  surfaceAreaCm2: number | null;
  /** « Autre » of a SURFACE line given as a text (« couteau entier », 16/10):
   * printed in place of the area; null elsewhere and with an area. */
  surfaceAreaNote: string | null;
  /** « État de la surface » — SURFACE only. */
  surfaceState: SurfaceState | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  /** « Méthode de prélèvement » — AIR only. */
  airMethod: AirMethod | null;
  /** « Durée d'exposition » (minutes) of an exposed plate; null on every other method and kind. */
  airExposureMin: number | null;
  remarks: string | null;
  unitCount: number;
  /** Optional (V6): the programme sheet fixes the analyses when none is ticked. */
  parameterIds: string[];
  /** The catalogue's product type (CRITERES.md) — the criteria come from it. */
  productTypeId: string | null;
  // Reception data — meaningful for a dépôt only; defaults for a visit.
  /** Rule (1) of the bon de réception, answered at the counter; null on a visit. */
  exploitable: boolean | null;
  /** C5 (identification), ticked at the counter; null on a visit. */
  identificationOk: boolean | null;
  conformity: boolean;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  /** « Observation de réception » of a deposit line (A7), shared by its samples; null on a visit. */
  receptionNote: string | null;
  /** A non-conform deposit line destroyed at the counter (slice E). */
  destroy: boolean;
  /** The counter's decision on the line (A9); « Analyser » on a visit and on every conform line. */
  decision: ReceptionDecision;
  /** « En attente du client »: received, held until released. */
  awaitClient: boolean;
  /** The client's agreement to analyse a non-conform line; null = not recorded, and on a visit. */
  consultation: ClientConsultation | null;
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
  /**
   * C1: true when the deposit's « Prélevé le » was typed; false when the
   * client did not know it (`SAMPLING_TIME_UNKNOWN`, 16/10 — `startedAt` is
   * then the arrival), as on the deposits saved before 16/10 with the field
   * left empty; null on a visit.
   */
  samplingTimeDeclared: boolean | null;
  /** The arrival typed (the deposit's « Arrivé le »); null = not sent — a
   * deposit then arrives at its save (`createSerie`), an old page included. */
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
  /** VISITE: the ambient temperature is required (16/10, Q113). Absent in
   * « Corriger la fiche », which never blocks an old row on it. */
  kind?: SerieKind;
  /** LabSettings.consultationRequired — the deposit's non-conform analysis needs the agreement (A9). */
  consultationRequired?: boolean;
  /**
   * A row entered before the states and the method were required (07/10,
   * 16/10): `surfaceState` / `airMethod` / `handsState` may stay empty.
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

/** The largest quantity a line may carry — the reception's bound too. */
const MAX_QUANTITY = 1_000_000;

/** « Quantité 2P » refused: the twin's own wording, the bound of the line's. */
export function chimieQuantityMessage(lineNumber: number): string {
  return `La quantité ${lineNumber}P doit être un nombre positif (1 000 000 au plus).`;
}

function numberOrNull(value: unknown): number | null | "invalid" {
  // A blank string is nothing typed — not 0 (`Number("  ")` is 0): a
  // required T° ambiante made of spaces is missing, not « 0 °C ».
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return null;
  const parsed =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "invalid";
}

/** « 2026-09-13 » or a full ISO instant; a plain date is kept as a date. */
function dateOrNull(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  // A plain date (DLC) is a calendar day: UTC midnight, never local (date-only.ts).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseIsoDay(value) ?? "invalid";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/**
 * A calendar day (date de production, DLC): the « AAAA-MM-JJ » written,
 * even when a caller sends a full date-time — its UTC day slipped one day
 * back (« 2026-09-20T00:30+01:00 » was stored 19/09), and a five-digit year
 * (« +010000-01-01 ») overflowed the DATE column (a 500).
 */
function dayOrNull(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value.trim());
  return (match && parseIsoDay(match[1])) || "invalid";
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
  const handsState = lineKind === "MAINS" ? oneOf(input.handsState, HANDS_STATES) : null;
  const strictStates = !options.allowMissingState;

  if (lineKind === "ALIMENT" && !produit) return fail("Indiquez la désignation du produit.");
  if (surface && !surfaceLabel) return fail(SERIE_MESSAGES.surfaceLabelMissing);
  if (surface && !surfaceState && strictStates) return fail(SERIE_MESSAGES.surfaceStateMissing);
  if (lineKind === "MAINS" && !personName) return fail("Indiquez la personne prélevée.");
  // Required on a new line, visit and deposit alike (16/10, Q109).
  if (lineKind === "MAINS" && !handsState && strictStates) return fail(SERIE_MESSAGES.handsStateMissing);
  if (lineKind === "AIR" && !airMethod && strictStates) return fail(SERIE_MESSAGES.airMethodMissing);

  // « Durée d'exposition » of an exposed plate (16/10, Q50): required with
  // that method, a whole number of minutes. A page opened before the field
  // existed does not send it (`undefined`): its plate is the 30 min the
  // method's name carried. Any other method has no duration.
  let airExposureMin: number | null = null;
  if (isExposedPlate(airMethod)) {
    if (input.airExposureMin === undefined) {
      airExposureMin = AIR_EXPOSURE_MINUTES.default;
    } else {
      const minutes = numberOrNull(input.airExposureMin);
      if (minutes === null) return fail(SERIE_MESSAGES.airExposureMissing);
      if (
        minutes === "invalid" ||
        !Number.isInteger(minutes) ||
        minutes < AIR_EXPOSURE_MINUTES.min ||
        minutes > AIR_EXPOSURE_MINUTES.max
      ) {
        return fail(SERIE_MESSAGES.airExposureInvalid);
      }
      airExposureMin = minutes;
    }
  }

  const productionDate = dayOrNull(input.productionDate);
  const expiryDate = dayOrNull(input.expiryDate);
  if (productionDate === "invalid") return fail("La date de production n'est pas valide.");
  if (expiryDate === "invalid") return fail("La date d'expiration n'est pas valide.");
  if (productionDate && expiryDate && expiryDate < productionDate) {
    return fail("La date d'expiration précède la date de production.");
  }

  const quantity = numberOrNull(input.quantity);
  // Bounded like the reception's (reception-input.ts): the column is a
  // DECIMAL(10,2) — beyond it the insert failed with a 500.
  if (quantity === "invalid" || (quantity !== null && (quantity <= 0 || quantity > MAX_QUANTITY))) {
    return fail("La quantité doit être un nombre positif (1 000 000 au plus).");
  }
  const quantityUnit = quantity === null ? null : (oneOf(input.quantityUnit, QUANTITY_UNITS) ?? "UNITE");

  // « Quantité 2P » (12/10): read only when the line becomes the two samples
  // and is weighed; `undefined` is a page that does not know the field.
  const weighedKind = lineKind !== "SURFACE" && lineKind !== "MAINS";
  const twoSamples = natureSource === "FAMILIES" && lineNatures.length > 1;
  let chimieQuantity: CleanLine["chimieQuantity"] = null;
  if (twoSamples && weighedKind && input.quantityChimie !== undefined) {
    const own = numberOrNull(input.quantityChimie);
    if (own === "invalid" || (own !== null && (own <= 0 || own > MAX_QUANTITY))) return fail(chimieQuantityMessage(line));
    chimieQuantity = {
      quantity: own,
      quantityUnit: own === null ? null : (oneOf(input.quantityUnitChimie, QUANTITY_UNITS) ?? "UNITE"),
    };
  }

  const productTemperature = numberOrNull(input.productTemperature);
  const ambientTemperature = numberOrNull(input.ambientTemperature);
  const receptionTemperature = numberOrNull(input.receptionTemperature);
  for (const [t, label] of [
    [productTemperature, "La température au prélèvement"],
    [ambientTemperature, "La température ambiante"],
    [receptionTemperature, "La température à l'arrivée"],
  ] as const) {
    if (t === "invalid" || (t !== null && (t < -80 || t > 300))) {
      return fail(`${label} doit être un nombre plausible (−80 à 300 °C).`);
    }
  }
  // The ambient temperature is required on the visit, every kind — the air
  // included; « 0 » is a value (16/10, Q113). Never at the counter, never in
  // « Corriger la fiche » (no `kind`): an old line stays correctable.
  if (options.kind === "VISITE" && ambientTemperature === null) return fail(SERIE_MESSAGES.ambientMissing);

  // « Surface prélevée (cm²) » (ex-« Aire prélevée »): 100 cm² by default on
  // a surface line, nowhere else. « Autre » (16/10, Q114) is another whole
  // number of cm², or a text (`surfaceAreaNote`) that replaces the area: the
  // area then stays empty — never the 100 cm² default — and both together
  // are refused.
  let surfaceAreaCm2: number | null = null;
  let surfaceAreaNote: string | null = null;
  if (surface) {
    if (tooLong(input.surfaceAreaNote)) return fail(SERIE_MESSAGES.surfaceAreaNoteTooLong);
    surfaceAreaNote = text(input.surfaceAreaNote) || null;
    const area = numberOrNull(input.surfaceAreaCm2);
    if (area === "invalid" || (area !== null && (!Number.isInteger(area) || area <= 0 || area > 100000))) {
      return fail("La surface prélevée doit être un nombre entier de cm².");
    }
    if (surfaceAreaNote && area !== null) return fail(SERIE_MESSAGES.surfaceAreaBoth);
    surfaceAreaCm2 = surfaceAreaNote ? null : (area ?? SURFACE_AREA_DEFAULT_CM2);
  }

  const weighed = weighedKind;

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
  let exploitable: boolean | null = null;
  let identificationOk: boolean | null = null;
  let receptionTemperatureSource: TemperatureSource | null = null;
  let storageClass: StorageClass | null = null;
  let conformity = true;
  let conformityReason: NonConformityReason | null = null;
  let conformityNote: string | null = null;
  let receptionNote: string | null = null;
  let destroy = false;
  let decision: ReceptionDecision = "ANALYSER";
  let consultation: ClientConsultation | null = null;
  if (deposit) {
    // Rule (1) is answered for every line, one answer for its two samples —
    // a form opened before the checklist sends none and is told so.
    if (typeof input.exploitable !== "boolean") return fail(EXPLOITABLE_MESSAGES.missing);
    exploitable = input.exploitable;
    // The contrôle complémentaire C5, one answer for the line too. C3
    // (emballage) is no longer asked (16/10, Q70): an old page's answer is
    // not read, never refused.
    if (typeof input.identificationOk !== "boolean") return fail(COMPLEMENTARY_MESSAGES.identificationMissing);
    identificationOk = input.identificationOk;
    // C2: the class and where the temperature was read — both optional.
    const source = parseChoice(input.receptionTemperatureSource, TEMPERATURE_SOURCES);
    if (source === "invalid") return fail("Origine de la température inconnue.");
    const chosenClass = parseChoice(input.storageClass, STORAGE_CLASSES);
    if (chosenClass === "invalid") return fail("Classe de conservation inconnue.");
    receptionTemperatureSource = receptionTemperature === null ? null : source;
    storageClass = chosenClass;
    // A7: the observation — whether an accepted doubt needs it is decided
    // with the rows, in POST /api/series.
    if (tooLong(input.receptionNote, RECEPTION_NOTE_MAX)) return fail(RECEPTION_NOTE_MESSAGES.tooLong);
    receptionNote = text(input.receptionNote, RECEPTION_NOTE_MAX) || null;
    if (input.conformity !== undefined && typeof input.conformity !== "boolean") {
      return fail("Indiquez la conformité de l'échantillon.");
    }
    conformity = input.conformity !== false;
    if (!exploitable && conformity) return fail(EXPLOITABLE_MESSAGES.conform);
    if (!conformity) {
      const reason = oneOf(input.conformityReason, NON_CONFORMITY_REASONS);
      if (!reason) return fail("Choisissez le motif de non-conformité.");
      if (reason === "NON_EXPLOITABLE" && exploitable) return fail(EXPLOITABLE_MESSAGES.reason);
      conformityReason = reason;
      const note = text(input.conformityNote, 2000);
      if (reason === "AUTRE" && !note) return fail("Précisez le motif « autre ».");
      conformityNote = note || null;
    }
    // Case by case (29/09, A9): a non-conform line is analysed anyway — the
    // client's agreement recorded —, waits for the client, or is destroyed.
    const chosen = parseDecision(input.decision);
    if (!chosen) return fail("Décision inconnue pour l'échantillon.");
    if (chosen === "DETRUIRE" && conformity) return fail("Seul un échantillon non conforme peut être détruit.");
    if (chosen === "EN_ATTENTE_CLIENT" && conformity) return fail(CONSULTATION_MESSAGES.awaitConform);
    decision = chosen;
    destroy = decision === "DETRUIRE";
    if (!conformity && decision === "ANALYSER") {
      const parsed = parseConsultation(input.consultation, new Date());
      if (!parsed.ok) return fail(parsed.error);
      consultation = parsed.value;
    }
    if (consultationMissing(options.consultationRequired ?? false, decision, conformity, consultation)) {
      return fail(CONSULTATION_MESSAGES.required);
    }
    // `input.technicianId` is deliberately not read (§9.3): nobody assigns
    // a technician, one takes the sample from « À prendre ».
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
      chimieQuantity,
      productTemperature: productTemperature as number | null,
      ambientTemperature: ambientTemperature as number | null,
      receptionTemperature:
        receptionTemperature === null ? null : Math.round((receptionTemperature as number) * 10) / 10,
      receptionTemperatureSource,
      storageClass,
      surfaceLabel,
      surfaceAreaCm2,
      surfaceAreaNote,
      surfaceState,
      personName: lineKind === "MAINS" ? personName : null,
      personRole: lineKind === "MAINS" ? text(input.personRole) || null : null,
      handsState,
      airMethod,
      airExposureMin,
      remarks: text(input.remarks, 2000) || null,
      unitCount: unitCount as number,
      parameterIds,
      // Criteria are written for a food product: a surface or a pair of
      // hands never carries one.
      productTypeId: lineKind === "ALIMENT" ? text(input.productTypeId) || null : null,
      exploitable,
      identificationOk,
      conformity,
      conformityReason,
      conformityNote,
      receptionNote,
      destroy,
      decision,
      awaitClient: decision === "EN_ATTENTE_CLIENT",
      consultation,
    },
  };
}

export function validateSerie(
  raw: unknown,
  natures: ReadonlyMap<string, NatureRef>,
  options: { kind: SerieKind; consultationRequired?: boolean }
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

  const now = Date.now();

  // The arrival first (16/10, Q118): a deposit whose sampling time the
  // client does not know takes it as its sampling instant. Bounded like the
  // sampling — never in the future, never more than 30 days back.
  const arrivedAt = dateOrNull(input.arrivedAt);
  if (arrivedAt === "invalid") return fail("L'heure d'arrivée n'est pas valide.");
  if (arrivedAt && arrivedAt.getTime() > now + FUTURE_TOLERANCE_MS) return fail(futureMessage("L'heure d'arrivée"));
  if (arrivedAt && arrivedAt.getTime() < now - MAX_PAST_MS) return fail(SERIE_MESSAGES.arrivalTooOld);

  // « Prélevé le » is required (16/10, Q118): the screens pre-fill or ask
  // it, and an empty one is never replaced by the save instant any more.
  // The deposit's one exception is the box « Heure de prélèvement inconnue
  // du client » (re-ask 2.6), never an empty field — a page opened before
  // the box is told to reload. The box wins over a time sent with it.
  const startedAtRaw = dateOrNull(input.startedAt);
  if (startedAtRaw === "invalid") return fail("La date et l'heure du prélèvement ne sont pas valides.");
  const samplingTimeUnknown = deposit && input.samplingTimeUnknown === true;
  if (samplingTimeUnknown && !SAMPLING_TIME_UNKNOWN.allowed) return fail(SERIE_MESSAGES.samplingUnknownRefused);
  if (startedAtRaw === null && !samplingTimeUnknown) {
    return fail(deposit ? SERIE_MESSAGES.depositStartedMissingApi : SERIE_MESSAGES.startedMissing);
  }
  const startedAt = samplingTimeUnknown || startedAtRaw === null ? (arrivedAt ?? new Date(now)) : startedAtRaw;
  if (startedAt.getTime() > now + FUTURE_TOLERANCE_MS) return fail(futureMessage("L'heure du prélèvement"));
  if (startedAt.getTime() < now - MAX_PAST_MS) return fail("L'heure du prélèvement remonte à plus de 30 jours.");

  const endedAt = dateOrNull(input.endedAt);
  if (endedAt === "invalid") return fail("L'heure de fin n'est pas valide.");
  if (endedAt && endedAt.getTime() > now + FUTURE_TOLERANCE_MS) return fail(futureMessage("L'heure de fin"));
  if (endedAt && endedAt < startedAt) return fail("L'heure de fin précède le début du prélèvement.");
  const arrivalProblem = arrivedAt ? arrivalRefusal(arrivedAt, startedAt, endedAt) : null;
  if (arrivalProblem) return fail(arrivalProblem);

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
    const checked = validateLine(rawLines[i], i, natures, {
      kind: options.kind,
      consultationRequired: options.consultationRequired,
    });
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
      // C1: « Non déclarée » only when the client did not know (16/10).
      samplingTimeDeclared: deposit ? !samplingTimeUnknown : null,
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

/**
 * What one sample of a line weighs: the « P » sample of a two-family line
 * its own container when the counter weighed it apart (`chimieQuantity`,
 * 12/10); every other sample — and the « P » one of a page that did not send
 * it — the line's quantity. The deposit's acceptance rules and the creation
 * both read it, so the rule (3) judged is the weight written.
 */
export function sampleQuantity(
  line: Pick<CleanLine, "quantity" | "quantityUnit" | "chimieQuantity">,
  twin: SampleTwin | null
): { quantity: number | null; quantityUnit: QuantityUnit | null } {
  if (twin === "P" && line.chimieQuantity) return line.chimieQuantity;
  return { quantity: line.quantity, quantityUnit: line.quantityUnit };
}

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
