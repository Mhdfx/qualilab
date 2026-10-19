import type { AirMethod, HandsState, LineKind, QuantityUnit, SurfaceState } from "@/generated/prisma/enums";
import {
  AIR_EXPOSURE_MINUTES,
  AIR_METHOD_CHOICES,
  HANDS_STATE_CHOICES,
  SURFACE_STATE_CHOICES,
  isExposedPlate,
} from "./labels";
import { SERIE_MESSAGES, validateLine, type CleanLine, type NatureRef } from "./serie-input";

/**
 * « Corriger la fiche » — editing the identification fields of a sample
 * after its creation (a lot typed wrong, a DLC, the place), with a reason.
 * Pure: the same line rules as the protocol apply, the current row fills
 * what the correction does not mention, and only actual changes survive.
 *
 * A few fields are decided here rather than by the protocol's line rules,
 * because a correction must keep old rows readable and correctable
 * (RETOUR-LABO-06-10.md §5, V2 and V4):
 * - a SURFACE line's « Désignation » (`surfaceLabel`), « Surface prélevée
 *   (cm²) » (`surfaceAreaCm2`) or the « Autre » text that replaces it
 *   (`surfaceAreaNote`, 16/10 — the one typed replaces the other), and
 *   « État de la surface » (`surfaceState`) — the state is required on a
 *   new line, but a line entered before it existed may be corrected without
 *   one; once set it cannot be emptied;
 * - an AIR line's « Méthode de prélèvement » (`airMethod`), same rule, and
 *   the exposed plate's « Durée d'exposition » (`airExposureMin`, 16/10): a
 *   plate entered before it stays without one (it reads 30 min);
 * - a MAINS line's « État des mains » (`handsState`), same rule (16/10);
 * - the two temperatures go through the protocol's rules (range, decimal
 *   comma), but one that was recorded can no longer be emptied — an old
 *   line without them stays correctable, and the visit's required ambient
 *   temperature is never asked here;
 * - the product type, which the programme may give any line (not only a
 *   food one) — the protocol's rule would silently drop it;
 * - the analyses: at least one when the correction names them.
 * A stored value the correction does not mention is never emptied by a rule
 * of the line kind: old data stays as it was.
 */

export type IntakeFields = {
  produit: string | null;
  lieu: string;
  numeroLot: string | null;
  productionDate: Date | null;
  expiryDate: Date | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  productTemperature: number | null;
  ambientTemperature: number | null;
  surfaceLabel: string | null;
  surfaceAreaCm2: number | null;
  surfaceAreaNote: string | null;
  surfaceState: SurfaceState | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  airMethod: AirMethod | null;
  airExposureMin: number | null;
  remarks: string | null;
  unitCount: number;
  productTypeId: string | null;
};

export type IntakeCurrent = IntakeFields & { lineKind: LineKind; parameterIds: string[] };

export type IntakeValidation =
  | {
      ok: true;
      value: {
        changes: Partial<IntakeFields>;
        /** Null when the analyses were not touched. */
        parameterIds: string[] | null;
        reason: string;
      };
    }
  | { ok: false; error: string };

/** `Sample.surfaceLabel` VARCHAR(191). */
export const MAX_DESIGNATION = 191;
/** The area of a surface line: a whole number of cm², 100 when left blank. */
export const MAX_SURFACE_AREA_CM2 = 100_000;
export const DEFAULT_SURFACE_AREA_CM2 = 100;

const FIELDS: (keyof IntakeFields)[] = [
  "produit",
  "lieu",
  "numeroLot",
  "productionDate",
  "expiryDate",
  "quantity",
  "quantityUnit",
  "productTemperature",
  "ambientTemperature",
  "surfaceLabel",
  "surfaceAreaCm2",
  "surfaceAreaNote",
  "surfaceState",
  "personName",
  "personRole",
  "handsState",
  "airMethod",
  "airExposureMin",
  "remarks",
  "unitCount",
  "productTypeId",
];

/** The fields the protocol's line rules check; the others are decided here. */
const LINE_RULE_FIELDS: (keyof IntakeFields)[] = [
  "produit",
  "lieu",
  "numeroLot",
  "productionDate",
  "expiryDate",
  "quantity",
  "quantityUnit",
  "productTemperature",
  "ambientTemperature",
  "personName",
  "personRole",
  "remarks",
  "unitCount",
];

/** The temperatures a correction may fix but never empty once recorded (P9, 16/10). */
const TEMPERATURES = [
  ["productTemperature", "La température au prélèvement"],
  ["ambientTemperature", "La T° ambiante"],
] as const;

/** « AAAA-MM-JJ » in local time — a DLC is a day, never an instant. */
function iso(date: Date | null) {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function same(a: IntakeFields[keyof IntakeFields], b: IntakeFields[keyof IntakeFields]) {
  if (a instanceof Date || b instanceof Date) return iso(a as Date | null) === iso(b as Date | null);
  return (a ?? null) === (b ?? null);
}

/** The current row as the line validator expects it (strings, dates as « AAAA-MM-JJ »). */
function currentAsRaw(current: IntakeCurrent): Record<string, unknown> {
  return {
    natureId: "current",
    lineKind: current.lineKind,
    produit: current.produit ?? "",
    lieu: current.lieu,
    numeroLot: current.numeroLot ?? "",
    productionDate: iso(current.productionDate),
    expiryDate: iso(current.expiryDate),
    quantity: current.quantity ?? "",
    quantityUnit: current.quantityUnit ?? "",
    productTemperature: current.productTemperature ?? "",
    ambientTemperature: current.ambientTemperature ?? "",
    personName: current.personName ?? "",
    personRole: current.personRole ?? "",
    remarks: current.remarks ?? "",
    unitCount: current.unitCount,
  };
}

type Decided<T> = { ok: true; value: T } | { ok: false; error: string };

/** « Désignation » of a surface line: required there, free text (old data) elsewhere. */
function decideDesignation(input: Record<string, unknown>, current: IntakeCurrent): Decided<string | null> {
  let value = current.surfaceLabel;
  if (input.surfaceLabel !== undefined) {
    if (input.surfaceLabel !== null && typeof input.surfaceLabel !== "string") {
      return { ok: false, error: "La désignation est invalide." };
    }
    const typed = (input.surfaceLabel ?? "").trim();
    if (typed.length > MAX_DESIGNATION) {
      return { ok: false, error: `La désignation de la surface est trop longue (${MAX_DESIGNATION} caractères maximum).` };
    }
    value = typed || null;
  }
  if (current.lineKind === "SURFACE" && !value) {
    return { ok: false, error: "Indiquez la désignation de la surface." };
  }
  return { ok: true, value };
}

/** Nothing typed: `undefined`, null, or an empty / blank string. */
function blank(raw: unknown) {
  return raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");
}

/**
 * « Surface prélevée (cm²) » and its « Autre » text (16/10, Q114): a whole
 * number of cm², or a text that replaces it — never both. The one the
 * correction types replaces the stored other; both typed are refused; a
 * surface line left with neither takes 100 cm². The text belongs to a
 * surface line only; an old row of another kind keeps its area as it was.
 */
function decideSurfaceArea(
  input: Record<string, unknown>,
  current: IntakeCurrent
): Decided<{ area: number | null; note: string | null }> {
  const surface = current.lineKind === "SURFACE";
  const noteMentioned = input.surfaceAreaNote !== undefined;
  const areaMentioned = input.surfaceAreaCm2 !== undefined;

  let note = current.surfaceAreaNote;
  if (noteMentioned) {
    const raw = input.surfaceAreaNote;
    if (raw !== null && typeof raw !== "string") return { ok: false, error: "La précision « Autre » de la surface est invalide." };
    const typed = (raw ?? "").trim();
    if (typed.length > MAX_DESIGNATION) return { ok: false, error: SERIE_MESSAGES.surfaceAreaNoteTooLong };
    if (typed && !surface) {
      return { ok: false, error: "La précision « Autre » ne concerne qu'un échantillon de surface." };
    }
    note = typed || null;
  }

  let area = current.surfaceAreaCm2;
  if (areaMentioned) {
    const raw = input.surfaceAreaCm2;
    if (blank(raw)) {
      area = null;
    } else {
      const parsed =
        typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(",", ".")) : Number.NaN;
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_SURFACE_AREA_CM2) {
        return { ok: false, error: "La surface prélevée (cm²) doit être un nombre entier positif, 100 000 au plus." };
      }
      area = parsed;
    }
  }

  if (noteMentioned && areaMentioned && note && area !== null) return { ok: false, error: SERIE_MESSAGES.surfaceAreaBoth };
  // The one just typed replaces the stored other: never both on the row.
  if (note && area !== null) {
    if (noteMentioned) area = null;
    else note = null;
  }
  if (surface && note === null && area === null && (areaMentioned || noteMentioned)) area = DEFAULT_SURFACE_AREA_CM2;
  return { ok: true, value: { area, note } };
}

/**
 * « Durée d'exposition » of an exposed plate (16/10, Q50): a whole number
 * of minutes, 1 to 480. A plate entered before the duration existed stays
 * without one (it reads 30 min); one that was recorded cannot be emptied,
 * nor can a line just switched to the exposed plate be sent with an empty
 * one (a page that does not know the field keeps the stored value, like at
 * creation). Any other method carries none.
 */
function decideExposure(
  input: Record<string, unknown>,
  current: IntakeCurrent,
  airMethod: AirMethod | null
): Decided<number | null> {
  const raw = input.airExposureMin;
  if (current.lineKind !== "AIR") {
    if (!blank(raw)) return { ok: false, error: "La durée d'exposition ne concerne qu'un échantillon d'air." };
    return { ok: true, value: current.airExposureMin };
  }
  if (!isExposedPlate(airMethod)) return { ok: true, value: null };
  if (raw === undefined) return { ok: true, value: current.airExposureMin };
  if (blank(raw)) {
    if (current.airExposureMin !== null || !isExposedPlate(current.airMethod)) {
      return { ok: false, error: SERIE_MESSAGES.airExposureMissing };
    }
    return { ok: true, value: null };
  }
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(",", ".")) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < AIR_EXPOSURE_MINUTES.min || parsed > AIR_EXPOSURE_MINUTES.max) {
    return { ok: false, error: SERIE_MESSAGES.airExposureInvalid };
  }
  return { ok: true, value: parsed };
}

/**
 * A choice that belongs to one line kind (the surface state, the air
 * method, the hands state): refused on another kind, required once set on
 * its own kind — a line entered before the choice existed may stay without
 * one.
 */
function decideKindChoice<T extends string>(
  raw: unknown,
  stored: T | null,
  options: { applies: boolean; choices: readonly T[]; unknown: string; wrongKind: string; required: string }
): Decided<T | null> {
  if (raw === undefined) return { ok: true, value: stored };
  if (raw === null || raw === "") {
    if (options.applies && stored) return { ok: false, error: options.required };
    return { ok: true, value: options.applies ? stored : null };
  }
  if (typeof raw !== "string" || !(options.choices as readonly string[]).includes(raw)) {
    return { ok: false, error: options.unknown };
  }
  if (!options.applies) return { ok: false, error: options.wrongKind };
  return { ok: true, value: raw as T };
}

/** The request's body as a record: anything else reads as an empty one. */
function asInput(raw: unknown): Record<string, unknown> {
  return (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
}

/**
 * Whether the correction names a field — itself, or what decides it: the
 * unit follows the quantity it qualifies, the area and its « Autre » text
 * replace each other, the plate's duration follows the method.
 */
function mentionedIn(input: Record<string, unknown>, key: keyof IntakeFields): boolean {
  return (
    input[key] !== undefined ||
    (key === "quantityUnit" && input.quantity !== undefined) ||
    ((key === "surfaceAreaCm2" || key === "surfaceAreaNote") &&
      (input.surfaceAreaCm2 !== undefined || input.surfaceAreaNote !== undefined)) ||
    (key === "airExposureMin" && input.airMethod !== undefined)
  );
}

export function validateIntake(raw: unknown, current: IntakeCurrent): IntakeValidation {
  const input = asInput(raw);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) return { ok: false, error: "Indiquez le motif de la correction." };
  if (reason.length > 2000) return { ok: false, error: "Le motif est trop long (2000 caractères maximum)." };

  // ---- What the correction decides itself --------------------------------
  const surfaceLabel = decideDesignation(input, current);
  if (!surfaceLabel.ok) return surfaceLabel;
  const surfaceArea = decideSurfaceArea(input, current);
  if (!surfaceArea.ok) return surfaceArea;
  const surfaceState = decideKindChoice(input.surfaceState, current.surfaceState, {
    applies: current.lineKind === "SURFACE",
    choices: SURFACE_STATE_CHOICES,
    unknown: "État de la surface inconnu.",
    wrongKind: "L'état de la surface ne concerne qu'un échantillon de surface.",
    required: "Choisissez l'état de la surface.",
  });
  if (!surfaceState.ok) return surfaceState;
  const airMethod = decideKindChoice(input.airMethod, current.airMethod, {
    applies: current.lineKind === "AIR",
    choices: AIR_METHOD_CHOICES,
    unknown: "Méthode de prélèvement inconnue.",
    wrongKind: "La méthode de prélèvement ne concerne qu'un échantillon d'air.",
    required: "Choisissez la méthode de prélèvement.",
  });
  if (!airMethod.ok) return airMethod;
  const airExposureMin = decideExposure(input, current, airMethod.value);
  if (!airExposureMin.ok) return airExposureMin;
  const handsState = decideKindChoice(input.handsState, current.handsState, {
    applies: current.lineKind === "MAINS",
    choices: HANDS_STATE_CHOICES,
    unknown: "État des mains inconnu.",
    wrongKind: "L'état des mains ne concerne qu'un échantillon de mains.",
    required: SERIE_MESSAGES.handsStateMissing,
  });
  if (!handsState.ok) return handsState;

  // A temperature recorded is corrected, never emptied (P9): the protocol's
  // rules below check the range of the one typed.
  for (const [key, label] of TEMPERATURES) {
    if (input[key] !== undefined && blank(input[key]) && current[key] !== null) {
      return { ok: false, error: `${label} a été relevée : corrigez sa valeur, elle ne peut pas être effacée.` };
    }
  }

  let productTypeId = current.productTypeId;
  if (input.productTypeId !== undefined) {
    if (input.productTypeId !== null && typeof input.productTypeId !== "string") {
      return { ok: false, error: "Type de produit invalide." };
    }
    productTypeId = (input.productTypeId ?? "").trim() || null;
  }

  let parameterIds: string[] | null = null;
  if (input.parameterIds !== undefined) {
    if (!Array.isArray(input.parameterIds)) return { ok: false, error: "La liste des analyses est invalide." };
    const wanted = [
      ...new Set(input.parameterIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
    ];
    if (wanted.length === 0) return { ok: false, error: "Choisissez au moins une analyse." };
    const unchanged =
      wanted.length === current.parameterIds.length && wanted.every((id) => current.parameterIds.includes(id));
    parameterIds = unchanged ? null : wanted;
  }

  // ---- The protocol's line rules, on everything else ---------------------
  // Only the fields the correction mentions override the row; the kind and
  // the nature never change here (that would be another sample). What was
  // decided above goes in already clean — with a stand-in where an old row
  // has no value the rules may require — and its outcome is not read back.
  const merged = currentAsRaw(current);
  for (const key of LINE_RULE_FIELDS) {
    if (input[key] !== undefined) merged[key] = input[key];
  }
  merged.surfaceLabel = surfaceLabel.value ?? "";
  merged.surfaceAreaCm2 = surfaceArea.value.area ?? "";
  merged.surfaceAreaNote = surfaceArea.value.note ?? "";
  merged.surfaceState = surfaceState.value ?? (current.lineKind === "SURFACE" ? SURFACE_STATE_CHOICES[0] : "");
  merged.airMethod = airMethod.value ?? (current.lineKind === "AIR" ? AIR_METHOD_CHOICES[0] : "");
  merged.airExposureMin = airExposureMin.value ?? AIR_EXPOSURE_MINUTES.default;
  merged.handsState = handsState.value ?? (current.lineKind === "MAINS" ? HANDS_STATE_CHOICES[0] : "");
  merged.productTypeId = productTypeId ?? "";
  const listed = parameterIds ?? current.parameterIds;
  merged.parameterIds = listed.length > 0 ? listed : ["current"];

  const natures = new Map<string, NatureRef>([
    ["current", { id: "current", defaultLineKind: current.lineKind, active: true }],
  ]);
  const checked = validateLine(merged, 0, natures);
  if (!checked.ok) return { ok: false, error: checked.error };
  const clean: CleanLine = checked.value;

  const next: IntakeFields = {
    produit: clean.produit,
    lieu: clean.lieu,
    numeroLot: clean.numeroLot,
    productionDate: clean.productionDate,
    expiryDate: clean.expiryDate,
    quantity: clean.quantity,
    quantityUnit: clean.quantityUnit,
    productTemperature: clean.productTemperature,
    ambientTemperature: clean.ambientTemperature,
    surfaceLabel: surfaceLabel.value,
    surfaceAreaCm2: surfaceArea.value.area,
    surfaceAreaNote: surfaceArea.value.note,
    surfaceState: surfaceState.value,
    personName: clean.personName,
    personRole: clean.personRole,
    handsState: handsState.value,
    airMethod: airMethod.value,
    airExposureMin: airExposureMin.value,
    remarks: clean.remarks,
    unitCount: clean.unitCount,
    productTypeId,
  };

  const changes: Partial<IntakeFields> = {};
  for (const key of FIELDS) {
    if (same(current[key], next[key])) continue;
    // A rule of the line kind never empties a stored value nobody touched.
    if (next[key] === null && !mentionedIn(input, key)) continue;
    (changes as Record<string, unknown>)[key] = next[key];
  }

  if (Object.keys(changes).length === 0 && parameterIds === null) {
    return { ok: false, error: "Aucune modification à enregistrer." };
  }

  return { ok: true, value: { changes, parameterIds, reason } };
}

// ---- Who changes what (16/10, Q128 — F8) -----------------------------------

/**
 * The fields of the fiche that decide its analyses, with the list itself
 * (`parameterIds`): the product type, whose criteria judge the readings, and
 * the number of units read. Everything else is the identification.
 */
export const ANALYSES_FIELDS = ["productTypeId", "unitCount"] as const satisfies readonly (keyof IntakeFields)[];

function isAnalysesField(key: keyof IntakeFields): boolean {
  return (ANALYSES_FIELDS as readonly string[]).includes(key);
}

export type CorrectionTouches = {
  /** The list of analyses, the product type or the number of units changes. */
  analyses: boolean;
  /** An identification field the request names changes. */
  identification: boolean;
};

/**
 * Which halves of the fiche a checked correction changes, for
 * `correctionRefusal` (sample-verbs.ts). An identification field counts
 * only when the request names it: a stored value the protocol's rules merely
 * tidy on the way (a field nobody sent) is not this person's change.
 */
export function correctionTouches(
  raw: unknown,
  value: { changes: Partial<IntakeFields>; parameterIds: string[] | null }
): CorrectionTouches {
  const input = asInput(raw);
  const keys = Object.keys(value.changes) as (keyof IntakeFields)[];
  return {
    analyses: value.parameterIds !== null || keys.some(isAnalysesField),
    identification: keys.some((key) => !isAnalysesField(key) && mentionedIn(input, key)),
  };
}

/**
 * The changes a person without the identification right may write — the
 * responsable des paramètres: the analyses' fields only. Whatever else
 * `validateIntake` would tidy on an old row (a field nobody sent, since
 * `correctionRefusal` refused any field sent) stays as it was.
 */
export function analysesChangesOnly(changes: Partial<IntakeFields>): Partial<IntakeFields> {
  return Object.fromEntries(
    Object.entries(changes).filter(([key]) => isAnalysesField(key as keyof IntakeFields))
  ) as Partial<IntakeFields>;
}

// ---- What a correction does to the results (16/10, Q91 — C5) ---------------

/**
 * Which results a correction deletes.
 * - `none`: the analyses and their criteria are unchanged — every reading stays;
 * - `removed`: analyses withdrawn and nothing else — only their readings go,
 *   the others stay and so does the sample's step (no return to the bench);
 * - `all`: an analysis added, or the product type or the number of units
 *   changed — the criteria the readings were judged against change, so they
 *   all go and the bench starts again (CRITERES.md §6).
 */
export type ResultsReset =
  | { kind: "none" }
  | { kind: "removed"; parameterIds: string[] }
  | { kind: "all" };

/**
 * « Une analyse non faite se retire du programme » (16/10, Q91): a
 * correction that only withdraws analyses deletes their results, never a
 * colleague's readings of the analyses kept. `before` is the sample's list
 * as it stands (read under the row lock), `after` the corrected list, or
 * null when the correction leaves it alone.
 */
export function resultsToReset(before: readonly string[], after: readonly string[] | null, criteriaChanged: boolean): ResultsReset {
  if (criteriaChanged) return { kind: "all" };
  if (after === null) return { kind: "none" };
  if (after.some((id) => !before.includes(id))) return { kind: "all" };
  const removed = before.filter((id) => !after.includes(id));
  return removed.length > 0 ? { kind: "removed", parameterIds: removed } : { kind: "none" };
}
